# AI Knowledge Base Workspace

本仓库是私有 AI 知识库项目的唯一 Git 仓库，统一管理运维资料和 FastGPT 私有二开源码。

## 目录结构

```text
ops/        运维文档、版本流程、部署配置、验收资料和脚本
fastgpt/    FastGPT 私有二开源码
artifacts/  本地临时产物目录，不提交内容
```

## 工作原则

- `ops/` 记录部署、版本、服务器配置和验收结果。
- `fastgpt/` 保存应用源码改动，后续不默认同步 FastGPT 上游。
- `artifacts/` 只放镜像 tar、导出包、临时构建产物等本地文件。
- 密钥、`.env`、运行数据、日志、依赖目录和构建产物不得提交。

## 常用入口

- 项目运维说明：`ops/README.md`
- 版本流程：`ops/docs/version-management.md`
- 生产部署规范：`ops/docs/deployment-standard.md`
- FastGPT 源码：`fastgpt/`