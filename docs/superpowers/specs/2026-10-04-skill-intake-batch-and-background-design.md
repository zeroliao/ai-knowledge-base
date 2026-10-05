# Skill Intake Batch and Background Processing Design

## Goal

把“项目 / Skill 收录”工作流升级为确认优先、可分批同步执行、支持大批量后台执行的收录任务流程。任何项目在候选来源未确认前不得写入知识库、训练或建立向量索引。

## Scope

本设计覆盖两个交付面：

1. 外部工作流配置 `C:\Users\Administrator\Downloads\项目 _ Skill 收录项目 _ Skill 收录 (2).json` 的全量候选确认、同步批处理、继续/停止交互和结果汇总。
2. `fastgpt/` 内的后台任务持久化、队列 worker、任务状态查询和幂等保护。

不包含模型供应商配置、GitHub 认证凭据写入仓库、生产部署和自动提交。

## Confirm-first Contract

用户提交后先执行拆分、来源识别、GitHub 搜索和候选匹配。此阶段只产生候选状态，不调用知识库写入、训练或索引接口。

每个输入条目必须进入以下之一：

- `confirmed`: 已有明确来源，包含 canonical、repo、resource、kind 和原始输入。
- `needs_confirmation`: 有多个候选或证据不足，包含完整候选列表。
- `invalid`: 无法识别为项目或 Skill，包含原因。

只有全部条目为 `confirmed`，或用户明确修正/选择后全部变为 `confirmed`，任务才能进入收录阶段。任何 `needs_confirmation` 或 `invalid` 都会阻止写入。

候选展示格式为每项单独一行的结构化文本，至少包含序号、`owner/repo`、Star 数、GitHub URL、匹配依据和差异。对只有项目名称的输入，按仓库名称匹配优先，Star 仅作为名称匹配相同或接近时的辅助排序；未提供的作者、用途等字段不得作为否决条件。

## User Confirmation and Resume

候选确认状态必须可从下一轮输入恢复。确认输入支持候选序号、`owner/repo` 或完整 GitHub URL，例如 `候选1`、`第2个`、`选择 iOfficeAI/OfficeCLI`。

工作流交互恢复优先使用 FastGPT 的 interactive response state；跨请求、跨会话或后台任务必须使用持久化任务记录，不能只依赖 LLM chat history。候选列表和输入条目按稳定索引保存，用户选择后只允许选择当前任务中的候选，禁止把序号重新作为 GitHub 搜索关键词。

## Synchronous Batch Mode

同步模式的默认批次大小为 20，批内使用 `parallelRun`，默认并发数为 5，最终并发不能超过服务配置 `WORKFLOW_PARALLEL_MAX_CONCURRENCY`。

当确认条目数大于 20 时：

1. 只执行前 20 条。
2. 汇总每条的 `indexed`、`submitted`、`duplicate`、`failed` 状态。
3. 返回已完成数量、成功/失败数量和剩余数量。
4. 将任务状态置为 `awaiting_continue`。
5. 用户回复“继续”后执行下一批；回复“停止”则置为 `stopped`。

批次执行失败不得丢弃未执行条目。失败条目保留错误原因，可在任务结束后单独重试；同一任务继续时只消费尚未完成的条目。

## Background Mode

当用户明确要求后台执行，或确认条目数超过同步阈值时，创建持久化后台任务。后台任务必须在全部来源确认后创建，不能后台自动替用户选择候选。

任务最小字段：

```text
taskId
owner identity (teamId/userId/appId)
status: confirming | queued | running | awaiting_continue | completed | partial_failed | stopped
items[]: input, canonical, repo, resource, kind, confirmation status, result status, error
batchSize: 20
concurrency: 5
cursor / completedCount / remainingCount
createdAt / updatedAt
```

使用现有 BullMQ/Redis 基础设施实现队列 worker。worker 按批次拉取任务，使用并行处理项目，但每个项目内部仍保持来源核实、去重、写入、训练检查和索引检查的顺序。用户通过任务查询接口或工作流查询动作获取进度。

## Idempotency and Shared Resources

`canonical` 是任务级幂等键。写入前查询只是优化，不能作为并发安全保证。后台写入必须增加以下至少一种保护：服务端唯一约束、幂等键写入接口，或写入后的二次合并检查。

外部 GitHub 请求、LLM 请求和知识库 API 都受共享限流影响。并发上限必须可配置，默认 5；批次总数和并发数分开限制。单任务默认最多 100 条，超过该数要求拆分或后台任务继续排队。

## Result Aggregation

同步和后台查询都返回按原始输入顺序排列的结果，每条至少包含：

```json
{
  "input": "OfficeCLI",
  "status": "indexed",
  "repo": "iOfficeAI/OfficeCLI",
  "stars": 31545,
  "canonical": "gh:iofficeai/officecli|readme|",
  "collectionId": "...",
  "reason": ""
}
```

总结果必须区分 `confirmed`、`needs_confirmation`、`queued`、`indexed`、`submitted`、`duplicate`、`failed` 和 `stopped`，不能把“已提交”表述为“已索引”。

## Proposed Interfaces

工作流配置需要新增或改造以下逻辑节点：

- 全量候选状态收集节点；
- 候选确认/恢复节点；
- 20 条批次切片节点；
- `parallelRun` 批次执行节点；
- 批次结果汇总节点；
- 继续/停止分支；
- 后台任务创建和任务状态查询分支。

FastGPT 后端需要提供内部受保护接口或等价服务函数：

- 创建确认完成的后台收录任务；
- 查询任务状态和逐条结果；
- 继续或停止 `awaiting_continue` 任务；
- worker 原子领取下一批；
- 以 canonical 执行幂等写入。

接口具体路径和鉴权方式沿用仓库现有 API 约定，使用 `parseApiInput` 校验外部请求。

## Failure Handling

- 候选搜索失败：条目标记 `needs_confirmation` 或 `failed`，不写入。
- 正文读取失败或正文与来源不一致：条目标记 `failed`，不写入。
- 单条写入失败：不阻塞同批其他条目，汇总保留错误。
- worker 重启：任务从持久化 cursor 和逐条状态恢复，不重复处理已完成 canonical。
- 用户在确认阶段提交新输入：创建新确认上下文，不覆盖旧任务。

## Verification

验证分为三层：

1. 工作流 JSON：导入解析、节点连线、候选换行格式、确认阻断和批次切片。
2. 后端单元/集成测试：任务状态机、原子领取、并发上限、幂等 canonical、worker 重启恢复。
3. 运行验收：2 条确认后同步收录、21 条分两批、包含歧义候选时禁止写入、100 条后台任务创建并查询进度。

## Risks and Open Decisions

- FastGPT 当前 `parallelRun` 支持并行子流程，但工作流 JSON 本身不提供跨会话 durable task storage；后台模式必须由后端任务服务承接。
- 知识库现有“先 list 再 create”流程是否能增加唯一幂等键，需要根据实际 API 合约决定采用服务端修改还是 worker 锁。
- 任务是否允许用户在 `awaiting_continue` 状态修改失败条目后重试，默认设计为允许按条目重试，不自动重跑成功条目。
