# AI Knowledge Base

私有 AI 知识库实施项目。目标是先在本地跑通 FastGPT + PostgreSQL pgvector + MongoDB + Redis + AIProxy + sub2api 的 V1 闭环，再部署到腾讯云服务器，通过 `kb.zero007.chat` 对外访问。

## 当前策略

- 本地开发测试优先。
- 本地验证通过后再部署服务器。
- `api.zero007.chat` 继续服务 sub2api。
- `kb.zero007.chat` 通过 Nginx 反代 FastGPT。
- 密钥只放本地 `key.md` 或私有 `.env`，不提交仓库。

## 关键文档

- [AI知识库系统实施交接文档.md](AI知识库系统实施交接文档.md)
- [用户准备事项代办清单.md](用户准备事项代办清单.md)
- [部署方案.md](部署方案.md)

## 本地验证

Docker Desktop 启动后执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\local\prepare.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\local\start.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\local\verify.ps1
```

如果默认端口被占用，脚本会自动选择可用端口并写入本地 `.env.local`。

