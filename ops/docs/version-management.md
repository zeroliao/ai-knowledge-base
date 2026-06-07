# 版本与分支管理

本文档是 `ai-knowledge-base` 项目的版本流程权威说明。

本项目是私有知识库部署与工具仓库，主要跟踪：

- FastGPT 部署文档。
- 本地和服务器启动脚本。
- Caddy / Docker Compose override。
- 知识库内 URL 目录导入能力。
- 验收资料和运维记录。

模型渠道、模型名称、Base URL 和 API Key 不进入版本流程；这些配置只通过 FastGPT 原有页面维护。

## 分支与版本模型

```text
main
dev/<version>
release/<version>
v<version>
```

- `main`：只保存已验证并可作为生产基线的稳定代码。
- `dev/<version>`：版本开发分支。
- `release/<version>`：提测、验证和服务器部署候选分支。
- `v<version>`：版本成功部署或确认可上线后的归档 tag。

版本状态只使用以下 5 种：

```text
开发中
已提测
成功
失败
取消
```

版本号使用三位数字递增，例如 `001`、`002`、`003`。

创建版本时，必须从当前仓库的本地/远程 `dev/*`、`release/*`、`v*` tag，以及 `docs/releases/*.md` 共同计算最大已占用版本号。下一版本号必须是最大已占用版本号 + 1。历史缺口不可复用。

## 适用范围

需要走版本流程的变更：

- 部署脚本变更。
- Docker Compose / Caddy 配置变更。
- 服务器资源策略变更，例如启停 sandbox、MCP、volume-manager。
- 知识库内 URL 目录导入能力变更。
- README、部署文档、验收清单发生实质变化。
- FastGPT 官方 compose、镜像版本或部署方式变化。

不需要单独创建版本的动作：

- 仅在 FastGPT 页面中配置模型、渠道、API Key。
- 仅上传资料、创建知识库、调整知识库分类。
- 临时查看日志、资源状态、容器状态。

如果一次操作同时包含代码/配置变更和 FastGPT 页面配置，只有代码/配置变更进入版本记录；页面配置只作为部署验收备注记录。

## 版本流程

1. 创建版本：
   - 计算当前最大已占用版本号。
   - 分配下一个版本号。
   - 创建 `docs/releases/<version>.md`。
   - 从 `main` 创建 `dev/<version>`。
   - 在版本记录中写入初始 `main` commit、变更范围和预期验证方式。

2. 开发：
   - 所有改动进入 `dev/<version>`。
   - `dev/<version>` 是唯一日常开发入口。
   - Commit message 使用中文，说明改动内容、原因和影响。
   - 不提交密钥、token、运行态数据、服务器私有 `.env`。

3. 提测：
   - `dev/<version>` 工作区干净。
   - 运行相关本地验证。
   - 将 `dev/<version>` 同步到 `release/<version>`。
   - 推送 `release/<version>`。
   - 版本状态改为 `已提测`。

4. 本地验证：
   - 使用同一个 `release/<version>` commit。
   - 验证 `docker compose config` 或本地启动脚本。
   - 验证知识库内 URL 目录导入或脚本改动涉及的最小功能。
   - 记录验证命令、结果、机器和时间。

5. 服务器部署前：
   - 创建或确认腾讯云快照。
   - 记录当前服务器 commit、compose 文件、Caddy 配置和关键容器状态。
   - 记录当前资源状态：内存、swap、磁盘、Docker 容器状态。
   - 如果涉及 sandbox、MCP、volume-manager 等资源敏感组件，必须先记录启用范围、资源预估和回滚方式。

6. 服务器部署：
   - 服务器必须使用同一个 `release/<version>` commit。
   - 上传或拉取同一份部署脚本和 compose override。
   - 生产镜像必须使用和版本号绑定的固定 tag，禁止使用 `latest`。
   - 优先通过镜像仓库 pull；临时 tar 部署只允许作为过渡方式，部署后必须清理本地和服务器临时包。
   - 启动或重启服务后检查：
     - `kb.zero007.chat` 可访问。
     - FastGPT 容器正常。
     - Caddy 正常。
     - 核心依赖容器正常。
     - 日志无明显 fatal/error。
   - 记录部署时间、命令、结果和回滚目标。

7. 成功：
   - 版本状态改为 `成功`。
   - `release/<version>` 合入 `main`。
   - 创建 `v<version>` tag。
   - 推送 `main` 和 `v<version>`，或在版本记录中说明未推送原因。
   - 将最新 `main` 同步到仍保留的 `dev/<version>`；不再继续开发的 `dev/<version>` 可以删除或归档。

8. 失败：
   - 版本状态改为 `失败`。
   - 按版本记录中的回滚目标恢复。
   - 保留 `release/<version>` 分支用于排查。
   - 不合入 `main`，不创建成功 tag。

9. 取消：
   - 版本状态改为 `取消`。
   - 写明取消原因。
   - 不合入 `main`。

## 验证要求

最低验证：

```text
git diff --check
PowerShell 脚本语法检查
docker compose config
README / docs 关键字检查
```

按变更类型追加验证：

- 本地启动脚本：运行 `scripts/local/prepare.ps1`，必要时运行 `scripts/local/start.ps1`。
- 服务器启动脚本：在服务器上检查脚本语法，并用当前 compose 做 config 校验。
- Caddy 配置：运行 `caddy validate --config /etc/caddy/Caddyfile`。
- 知识库内 URL 目录导入：运行页面服务并做小批量导入测试。
- 资源策略：记录 `free -h`、`df -h`、`docker ps`、`docker stats --no-stream`。

## 生产安全规则

- 部署前必须有快照或明确回滚点。
- 不允许把 `.env`、`.env.local`、`key.md`、API Key、OAuth token、服务器密码提交到仓库。
- 不允许在未确认影响前删除服务器已有 sidecar、挂载目录或 Caddy 站点配置。
- 不允许直接把未经验证的 `dev/<version>` 部署到服务器。
- `main` 只能接收已成功验证的 `release/<version>`。
- 模型配置不由项目代码管理；不要为了模型变更修改仓库。
- 不允许长期依赖服务器临时手改；服务器 compose 变更必须同步回 `deploy/server/`。
- 不允许提交 `.codex-logs/`、镜像 tar 包、运行缓存或其它临时构建产物。

## 节点交接信号

| 节点 | 完成信号 | 下一步 |
| --- | --- | --- |
| 创建版本 | `docs/releases/<version>.md` 已创建，初始 commit 和范围已记录 | 创建 `dev/<version>` |
| 开发完成 | `dev/<version>` 工作区干净，本地验证结果已记录 | 同步到 `release/<version>` |
| 提测完成 | `release/<version>` 已推送，版本状态为 `已提测` | 执行本地/服务器候选验证 |
| 服务器验证 | 快照、资源状态、容器状态和访问结果已记录 | 部署或确认上线 |
| 部署成功 | 访问、容器、日志、核心路径验证通过 | 合入 `main`，打 `v<version>` |
| 部署失败 | 失败原因和回滚结果已记录 | 修复、重试或标记失败 |

任一节点失败时，不进入下一节点；先把失败原因写入版本记录。

## 版本记录模板

每个版本必须在 `docs/releases/<version>.md` 记录：

```text
# v<version> <标题>

## 范围

- 状态：开发中 / 已提测 / 成功 / 失败 / 取消
- 类型：文档 / 部署 / 工具 / 混合
- 触发人：
- 分支：dev/<version> / release/<version>
- 初始 main commit：
- release commit：
- tag：
- 回滚目标：

## 变更

-

## 验证

-

## 服务器记录

- 快照：
- 资源状态：
- 部署命令：
- 部署结果：
- 访问验证：
- 日志检查：

## 备注

-
```
