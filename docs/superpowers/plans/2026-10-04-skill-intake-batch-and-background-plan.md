# Skill Intake Batch and Background Processing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现项目 / Skill 收录的全量来源确认、20 条同步分批、并行执行、继续/停止交互和大批量 BullMQ 后台任务。

**Architecture:** 先由工作流完成所有条目拆分、候选检索和确认，生成不可变的 canonical 条目快照；确认完成后同步模式按 20 条切片交给 `parallelRun`，后台模式把同一快照写入 Mongo 任务并投递 BullMQ。worker 使用稳定 cursor 和 canonical 幂等键处理条目，API 返回任务状态与逐条结果，工作流只负责调用这些接口并汇总结果。

**Tech Stack:** FastGPT workflow JSON, Next.js API routes, TypeScript, MongoDB/Mongoose, BullMQ/Redis, existing dataset collection APIs, Vitest.

**Spec:** [2026-10-04-skill-intake-batch-and-background-design.md](../specs/2026-10-04-skill-intake-batch-and-background-design.md)

## Global Constraints

- 所有项目必须先完成来源确认；存在 `needs_confirmation` 或 `invalid` 时禁止写入。
- 同步批次固定为 20 条，默认并发为 5；总条数与并发数分开限制。
- `canonical` 是幂等身份；“先查询重复”不能单独作为并发安全保证。
- 用户未提供的作者、用途等字段不能否决名称匹配候选；候选输出必须逐项换行并包含 Star。
- 不读取、打印或提交 secrets；不自动 commit、push、部署。
- 外部工作流文件位于 `C:\Users\Administrator\Downloads\项目 _ Skill 收录项目 _ Skill 收录 (2).json`，修改后必须重新解析校验。

---

### Task 1: Define intake task contracts and state machine

**Files:**
- Create: `fastgpt/packages/global/openapi/core/workflow/intake.ts`
- Create: `fastgpt/packages/global/core/workflow/intake/constants.ts`
- Test: `fastgpt/packages/global/test/core/workflow/intake/state.test.ts`

**Interfaces:**
- Produce `IntakeItemConfirmationType`, `IntakeItemResultType`, `IntakeTaskStatusEnum`, `IntakeItemStatusEnum`, and `IntakeTaskSnapshotType`.
- Produce pure functions `canStartIngestion(snapshot)`, `nextBatch(snapshot, batchSize)`, `applyItemResult(snapshot, index, result)`, and `applyUserSelection(snapshot, index, candidateIndex)`.

- [ ] **Step 1: Write failing state transition tests** for blocking on unresolved candidates, selecting a candidate, selecting the next 20 items, and preserving completed items.
- [ ] **Step 2: Run the focused global tests** with `pnpm --filter @fastgpt/global test test/core/workflow/intake/state.test.ts`; verify they fail because the contracts do not exist.
- [ ] **Step 3: Implement the enums, Zod schemas, and pure state helpers** with stable item indexes and explicit statuses.
- [ ] **Step 4: Re-run the focused tests** and add cases for `awaiting_continue`, `stopped`, and duplicate canonical entries.

### Task 2: Persist intake tasks and enforce canonical idempotency

**Files:**
- Create: `fastgpt/packages/service/core/workflow/intake/schema.ts`
- Create: `fastgpt/packages/service/core/workflow/intake/controller.ts`
- Create: `fastgpt/packages/service/test/core/workflow/intake/controller.test.ts`
- Modify: `fastgpt/packages/service/core/dataset/collection/schema.ts`

**Interfaces:**
- Produce `createIntakeTask`, `getIntakeTaskForOwner`, `updateIntakeTaskAtomically`, `claimNextIntakeBatch`, and `recordIntakeItemResult`.
- Store owner identity, immutable confirmed items, cursor, batch size, concurrency, status, timestamps, and per-item results.

- [ ] **Step 1: Write failing Mongo/controller tests** for owner isolation, atomic cursor claims, task status transitions, and retrying only incomplete items.
- [ ] **Step 2: Implement the Mongoose schema** with indexes on owner/status and a unique task item canonical key scoped to the task.
- [ ] **Step 3: Implement atomic updates** using `findOneAndUpdate` predicates on status and cursor so two workers cannot claim the same batch.
- [ ] **Step 4: Add the collection-side idempotency lookup** around the existing canonical filename convention; when the existing API cannot provide a unique constraint, record and re-check canonical before create.
- [ ] **Step 5: Run the focused service tests** with the repository’s Mongo-skip/test setup and document any unavailable integration dependency.

### Task 3: Add BullMQ background worker

**Files:**
- Modify: `fastgpt/packages/service/common/bullmq/index.ts`
- Modify: `fastgpt/packages/service/common/bullmq/type.d.ts`
- Create: `fastgpt/packages/service/core/workflow/intake/queue.ts`
- Create: `fastgpt/packages/service/core/workflow/intake/worker.ts`
- Test: `fastgpt/packages/service/test/core/workflow/intake/queue.test.ts`

**Interfaces:**
- Add `QueueNames.workflowIntake`.
- Produce `enqueueIntakeTask(taskId)`, `initWorkflowIntakeWorker()`, and `processIntakeBatch(taskId)`.

- [ ] **Step 1: Write queue tests** for deterministic job IDs, duplicate enqueue behavior, batch size 20, concurrency clamp 5 to configured maximum, and worker resume after a simulated restart.
- [ ] **Step 2: Add the queue name and worker registration** using existing `getQueue`/`getWorker` helpers.
- [ ] **Step 3: Implement the worker** to atomically claim a batch, run each confirmed item with bounded concurrency, record each result, and enqueue the next batch while work remains.
- [ ] **Step 4: Make failures item-scoped** so one item becomes `failed` without losing other results; mark task `partial_failed` or `completed` after the batch.
- [ ] **Step 5: Register the worker in `initBullMQWorkers`** and run the focused queue tests.

### Task 4: Expose protected task APIs

**Files:**
- Create: `fastgpt/projects/app/src/pages/api/core/workflow/intake/create.ts`
- Create: `fastgpt/projects/app/src/pages/api/core/workflow/intake/detail.ts`
- Create: `fastgpt/projects/app/src/pages/api/core/workflow/intake/continue.ts`
- Create: `fastgpt/projects/app/src/pages/api/core/workflow/intake/stop.ts`
- Create: `fastgpt/projects/app/src/pages/api/core/workflow/intake/confirm.ts`
- Create: `fastgpt/packages/global/openapi/core/workflow/intakeApi.ts`
- Test: `fastgpt/projects/app/test/api/core/workflow/intake.test.ts`

**Interfaces:**
- `POST /api/core/workflow/intake/confirm`: validate and persist a fully confirmed snapshot.
- `POST /api/core/workflow/intake/create`: create and enqueue a background task from a confirmed snapshot.
- `GET /api/core/workflow/intake/detail?taskId=...`: return owner-scoped task and item results.
- `POST /api/core/workflow/intake/continue`: atomically resume `awaiting_continue`.
- `POST /api/core/workflow/intake/stop`: atomically stop a queued or awaiting task.

- [ ] **Step 1: Write API contract tests** for `parseApiInput`, authentication/owner checks, unresolved-item rejection, and valid task creation.
- [ ] **Step 2: Add Zod request/response schemas** and use `NextAPI` plus existing authenticated team/member context.
- [ ] **Step 3: Implement confirm/create/detail/continue/stop handlers** with no secret values in responses or logs.
- [ ] **Step 4: Run the targeted API tests and typecheck** for the changed packages.

### Task 5: Convert the downloaded workflow to confirm-first and batch execution

**Files:**
- Modify: `C:\Users\Administrator\Downloads\项目 _ Skill 收录项目 _ Skill 收录 (2).json`
- Create: `ops/tests/fixtures/skill-intake-workflow-validation.ps1`

**Interfaces:**
- Workflow confirmation payload maps to `IntakeTaskSnapshotType`.
- `parallelRun` receives exactly one confirmed batch of at most 20 items and returns positional per-item results.

- [ ] **Step 1: Add a validation script** that parses the JSON, verifies node IDs/edges, checks the 20-item batch condition, and rejects any edge from unresolved confirmation directly to write/training nodes.
- [ ] **Step 2: Add a candidate aggregation stage** that searches and resolves every input item before the write branch; include Star count and one-candidate-per-line formatting.
- [ ] **Step 3: Add confirmation gating** so any `needs_confirmation` or `invalid` item routes to the response node and no ingestion node is reachable.
- [ ] **Step 4: Replace the serial `loopRun` ingestion body with `parallelRun`** at concurrency 5, preserving the existing per-item order: source read, card verification, dedup, write, collection lookup, training check, index check.
- [ ] **Step 5: Add batch slicing and continuation state** for 20-item pages, returning completed and remaining counts and routing “继续”/“停止” to the task APIs.
- [ ] **Step 6: Add explicit background mode** for user requests or more than 20 confirmed items, calling the protected create endpoint and returning `taskId`.
- [ ] **Step 7: Run the validation script and JSON parse check**; do not import or publish the workflow automatically.

### Task 6: Verification and acceptance fixtures

**Files:**
- Create: `fastgpt/packages/global/test/core/workflow/intake/fixtures.ts`
- Create: `ops/tests/fixtures/skill-intake-acceptance.md`
- Modify: `ops/tests/fixtures/README.md`

- [ ] **Step 1: Add fixtures** for two confirmed projects, 21 confirmed projects, one ambiguous project, one invalid item, and 100 confirmed projects.
- [ ] **Step 2: Run global tests, service tests, API tests, and FastGPT typecheck** using the project commands.
- [ ] **Step 3: Run the workflow JSON validation script** and `git diff --check`.
- [ ] **Step 4: Record any environment-blocked checks** as pending with the exact command and reason; do not claim production behavior without a live run.

## Execution Order

Tasks 1 and 2 establish the contract and persistence boundary. Task 3 depends on both and adds durable execution. Task 4 exposes the worker to the workflow. Task 5 then changes the downloaded workflow to use the confirmed contracts. Task 6 runs the full validation set.

No commit, push, deployment, or production write is part of this plan unless separately requested.
