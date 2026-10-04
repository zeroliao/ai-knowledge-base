# 备份、恢复与资源验证

## 范围

`backup-fastgpt.sh` 备份 MongoDB、PostgreSQL/pgvector 和 MinIO `/data`。服务器存在 `/storage` 时默认额外生成 `storage.tar.gz`。备份目录不再复制 `.env`，只记录环境文件名和 SHA-256 指纹；密钥仍由服务器现有 `.env` 提供。

备份脚本不会开启 sandbox、MCP server、OpenSandbox 或 volume-manager。服务器 override 将这些组件置于 `disabled` profile，资源检查也会记录该状态。

## 备份

先做无写入检查：

```bash
FASTGPT_DEPLOY_DIR=/opt/fastgpt \
FASTGPT_BACKUP_DIR=/opt/fastgpt-backups \
bash ops/scripts/server/backup-fastgpt.sh --dry-run
```

确认 compose 文件和服务健康后执行：

```bash
FASTGPT_DEPLOY_DIR=/opt/fastgpt \
FASTGPT_BACKUP_DIR=/opt/fastgpt-backups \
bash ops/scripts/server/backup-fastgpt.sh --retention-days 30
```

脚本输出 `manifest.sha256`，可用以下命令验证，不会连接数据库或修改服务：

```bash
bash ops/scripts/server/verify-backup.sh /opt/fastgpt-backups/YYYYMMDD-HHMMSS
```

备份保留清理只针对 `FASTGPT_BACKUP_DIR` 直接下的目录，并按修改时间执行。生产保留策略仍建议配合服务器快照和异地复制；本地备份目录损坏不应视为唯一恢复点。

## 恢复

恢复会使用 `mongorestore --drop`、导入 PostgreSQL dump，并清空目标 MinIO `/data`，属于破坏性操作。先验证备份并做 dry-run：

```bash
bash ops/scripts/server/restore-fastgpt.sh \
  /opt/fastgpt-backups/YYYYMMDD-HHMMSS --dry-run
```

交互式恢复需要输入 `RESTORE`；自动化或受控运维必须显式传 `--confirm`：

```bash
FASTGPT_DEPLOY_DIR=/opt/fastgpt \
bash ops/scripts/server/restore-fastgpt.sh \
  /opt/fastgpt-backups/YYYYMMDD-HHMMSS --confirm
```

恢复后应在恢复环境抽样检查：服务健康、知识库数量、向量维度、问答引用、原始资料访问和训练队列。`storage.tar.gz` 仅作为主机 `/storage` 归档提供，脚本不会自动覆盖主机目录；审核归档内容后再按恢复环境需要解包。

## 资源与验证记录

使用以下命令生成不含密钥的时间戳记录：

```bash
FASTGPT_DEPLOY_DIR=/opt/fastgpt \
FASTGPT_CHECK_DIR=/opt/fastgpt/ops-checks \
bash ops/scripts/server/check-resources.sh pre-deploy
```

记录包含磁盘、内存、Docker 容器、`docker compose config --quiet` 结果，以及 sandbox/MCP/volume-manager 的禁用配置。该脚本只读，不会重启或修改服务。`ops-checks/` 不应提交到 Git。

## 状态边界

- `verified-current`：脚本语法、帮助、备份包完整性检查通过。
- `pending`：服务器实际备份、隔离环境恢复演练、资源长期趋势和异地复制。
- `out-of-scope`：线上迁移、部署、启用 sandbox/MCP/volume-manager。

在没有资源评估、回滚目标和功能验收前，sandbox、MCP server、OpenSandbox、volume-manager 必须保持关闭，不能在验证记录中标记为已完成。
