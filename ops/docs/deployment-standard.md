# 生产部署规范

本文档用于约束 FastGPT 自定义版本的生产部署，避免服务器临时手改、镜像来源不可追踪、版本记录不闭环和临时包残留。

## 代码状态

- FastGPT 源码改动必须先提交。
- `aiKnowledge` 版本记录和部署配置必须先提交。
- 部署前工作区不得包含会影响部署判断的未提交改动。
- `.codex-logs/`、镜像 tar 包、运行缓存和临时构建产物不得提交。

## 版本闭环

- 每次上线必须创建或更新 `docs/releases/<version>.md`。
- 版本状态只允许使用 `开发中`、`已提测`、`成功`、`失败`、`取消`。
- 成功后必须提交版本记录并创建 `v<version>` tag。
- 成功后必须明确 push `main` 和 tag；如果暂不 push，需要在版本记录或交接说明中写明原因。

## 镜像

- 生产镜像必须使用固定 tag，例如 `fastgpt-custom:v001-url-directory`。
- 禁止使用 `latest` 作为生产镜像 tag。
- 优先使用镜像仓库发布和拉取镜像。
- 使用 tar 上传部署时，只作为过渡方案；部署成功后必须清理本地和服务器临时 tar 包。

## 服务器配置

- 不长期依赖服务器临时手改。
- 服务器 compose 变更必须同步回 `deploy/server/`。
- 修改服务器配置前必须备份原文件，备份命名使用时间戳。
- 修改后必须执行 `docker compose config` 校验。

## 部署执行

- 只重启必要服务。
- FastGPT app 代码或前端改动只重启 `fastgpt-app`。
- 不重启 MongoDB、PostgreSQL、Redis、MinIO 或 Caddy，除非本次变更直接涉及它们。

## 验证

部署前记录：

```bash
free -h
df -h /
docker ps
docker stats --no-stream
```

部署后验证：

```bash
docker ps
curl -I http://127.0.0.1:3000
curl -I https://kb.zero007.chat
docker logs fastgpt-app --tail=160
```

日志中如出现 fatal/error，必须修复或回滚。已知 warning 可以保留，但必须写入版本记录。

## 回滚

- 每次部署必须有明确回滚目标：上一版镜像 tag 和 compose override 备份。
- 回滚优先只恢复 `fastgpt-app`。
- 回滚结果必须写入版本记录。

## 清理

- 本地镜像 tar 上传后应删除，或放入已忽略的 `artifacts/`。
- 服务器 `/tmp/*.tar` 在部署成功后应删除。
- 临时日志和构建缓存不得进入提交。
