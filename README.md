# AI 私有知识库项目总文档

## 1. 项目介绍

本项目用于部署一个个人私有 AI 知识库系统。系统基于 FastGPT、PostgreSQL + pgvector、MongoDB、Redis、AIProxy 和 Caddy，目标是在 `kb.zero007.chat` 提供可登录访问的知识库服务。

项目执行策略：

- 本地开发测试优先。
- 本地验证通过后再部署服务器。
- 当前代码基线是基于 FastGPT 的私有二次开发版本，后续不再默认同步 FastGPT 上游代码。
- 未实现的项目需求优先通过修改本地 FastGPT 代码补齐；只有依赖不可用付费服务、外部授权或重资源组件的原 FastGPT 功能才隐藏入口。
- `api.zero007.chat` 继续服务 sub2api。
- `kb.zero007.chat` 通过服务器现有 Caddy 反代 FastGPT。
- 密钥只放本地 `key.md` 或私有 `.env`，不提交仓库。

项目最终形态：

```text
个人版 NotebookLM + 私有知识库 + AI 研发资料中心
```

核心目标：

- 保存原始资料，不只保存向量数据。
- 支持 PDF、DOCX、TXT、Markdown、手动文本等资料入库。
- 支持后续扩展 URL、图片、视频资料。
- 支持 AI 问答、来源引用、原文查看。
- 支持动态分类推荐，分类由 AI 建议、用户确认。
- 尽量复用现有腾讯云 CVM、Docker、Caddy 和 FastGPT 原有能力。

## 2. 基础设施

现有资源：

```text
服务器：腾讯云 CVM
配置：2 Core / 4 GB RAM / 60 GB SSD
已部署：Docker、Caddy、sub2api
现有 API 域名：api.zero007.chat
知识库域名：kb.zero007.chat
DNS 托管：Cloudflare
仓库：GitHub 私有仓库 ai-knowledge-base
```

资源约束：

```text
内存长期低于 3.5 GB
CPU 长期低于 60%
普通问答响应小于 15 秒
V1 不新增服务器作为必要条件
```

域名分流：

```text
api.zero007.chat -> 现有 sub2api
kb.zero007.chat  -> FastGPT
```

## 3. 系统架构

```text
用户
↓
kb.zero007.chat
↓
Caddy
↓
FastGPT
├── MongoDB：业务数据、知识库元数据
├── PostgreSQL + pgvector：向量数据
├── Redis：缓存
├── storage：原始资料和派生文件
└── AIProxy / 模型渠道：通过 FastGPT 页面配置
```

V1 不引入重型本地组件：

```text
不本地跑 Milvus
不本地跑本地大模型或本地向量模型
不本地跑 Whisper
不本地跑 Marker / MinerU
不本地跑浏览器集群
不启用复杂 Agent sandbox 作为必要能力
```

## 4. 功能范围

V1 必须支持：

- FastGPT 可访问、可登录、可配置模型。
- FastGPT 中已配置的问答和向量化能力可用。
- PDF、DOCX、TXT、Markdown 上传入库。
- 手动文本录入。
- 原始资料保存。
- 自动向量化。
- 单知识库、多知识库、全局问答。
- 回答显示可理解来源。
- 来源可追溯到原文、原图或原始链接。
- 动态分类推荐和用户确认。

V1 暂不做：

- 复杂网页自动抓取。
- 图片自动理解。
- 视频自动字幕提取。
- 批量爬虫。
- 自动迁移分类。
- NotebookLM 风格复杂交互。
- 多模态全文精准定位。

V2 可扩展：

- 普通 URL 自动抓取并转 Markdown。
- 图片理解并生成 Markdown 描述。
- 视频字幕导入。
- 标签管理。
- 一键重新分析分类结构。
- 复杂网页通过 Firecrawl、Browserbase、Apify 等服务接入。

### 4.1 无 Web 站点同步权限时导入整站文章

如果 FastGPT 当前没有 Web 站点同步权限，目标形态是在 FastGPT 知识库页面内新增“导入 URL 目录”能力，与原有上传文件、创建集合、导入数据的交互保持一致。用户在知识库内选择目标目录后输入 sitemap 地址，系统自动使用当前知识库上下文创建链接集合，不应跳转到割裂的独立项目页面。

当前仓库只保留过早期验证逻辑；正式实现不应依赖独立页面作为用户入口。

适用条件：

- 目标站点提供 `sitemap.xml`。
- 页面 HTML 可公开访问。
- FastGPT 可通过 OpenAPI 创建链接集合。
- 知识库已配置可用的向量化能力。

以 `https://869hr.uk` 为例，该站点可访问：

```text
https://869hr.uk/sitemap.xml
```

界面导入流程：

```text
在知识库页面点击“导入 URL 目录”
↓
使用当前知识库和当前目录上下文
↓
填写 sitemap 地址和导入参数
↓
预览 sitemap 中发现的文章 URL
↓
点击开始导入
↓
导入器逐个调用 FastGPT 链接集合接口
↓
FastGPT 抓取页面、切分内容并写入知识库
↓
FastGPT 完成内容切分和向量化
↓
在页面查看成功和失败明细
```

#### 4.1.1 准备 FastGPT

在 FastGPT 页面中先完成：

1. 进入 `账号 -> API 密钥`，创建或复制一个可用 API Key。
2. 进入 `知识库`，创建目标知识库，例如：

```text
869HR 文章库
```

3. 复制目标知识库 ID。知识库 ID 通常可从页面 URL、接口返回或开发者工具中获得。
4. 确认 FastGPT 页面中已有可用的模型渠道和向量化配置。
5. 知识库选择当前可用的向量化配置。

#### 4.1.2 正式实现要求

正式产品入口应内嵌到 FastGPT 知识库页面。当前仓库暂未包含 FastGPT 前端源码，因此这里先定义实现要求：

- 入口位置：知识库详情页或当前目录的导入菜单中。
- 交互形态：复用 FastGPT 现有弹窗、表单、按钮、进度条和任务反馈组件。
- 上下文：自动使用当前 `datasetId` 和当前目录/集合 ID。
- 权限：复用 FastGPT 当前登录态和知识库权限，不要求用户重新填写 FastGPT API Key。
- 参数：用户只填写 sitemap 地址、最大导入数量、单篇间隔、训练模式、分块大小等导入参数。
- 预览：先展示 sitemap 中解析出的 URL 数量和前若干条 URL。
- 执行：逐个创建链接集合，并在同一页面显示成功、失败、取消和重试状态。
- 安全：不在 URL、日志或前端持久化存储中暴露 API Key。

早期验证逻辑只用于迁移实现时参考，不作为生产入口。

#### 4.1.3 页面填写项

知识库内置页面需要用户填写：

```text
Sitemap 地址：https://869hr.uk/sitemap.xml
最大导入数量：0 表示全量；测试时建议先填 5
单篇间隔：建议 1000ms
训练模式：chunk
分块大小：8000
```

首次操作建议：

1. `最大导入数量` 填 `5`。
2. 点击 `预览 URL`。
3. 确认 URL 都是文章页。
4. 点击 `开始导入`。
5. 去 FastGPT 知识库里检查是否生成了链接集合和数据。
6. 确认效果后再把 `最大导入数量` 改为 `0` 全量导入。

#### 4.1.4 全量导入

确认 5 篇测试成功后：

1. 回到导入器页面。
2. `最大导入数量` 改为 `0`。
3. 保持 `单篇间隔` 为 `1000ms` 或更高。
4. 点击 `预览 URL`，确认数量。
5. 点击 `开始导入`。
6. 保持页面打开，直到状态变为 `done`。

`https://869hr.uk/sitemap.xml` 当前可发现约 600 个 URL。全量导入建议不要频繁取消或重复点击开始，避免 FastGPT 中生成重复集合。

#### 4.1.5 失败重试

导入器页面会显示最近的成功和失败明细。

如果少量失败：

- 复制失败 URL。
- 降低并发节奏，增加 `单篇间隔`。
- 将 `最大导入数量` 改成小批次。
- 必要时在 FastGPT 中手动创建单个链接集合。

如果大量失败：

- 检查 FastGPT API Key 是否正确。
- 检查知识库 ID 是否正确。
- 检查 FastGPT 是否能从服务器访问目标站点。
- 检查目标站点是否限制抓取。
- 检查 FastGPT 容器日志。

#### 4.1.6 验收检查

导入完成后测试以下问题：

```text
869HR 里关于 Gemini 学生认证的文章有哪些？
869HR 里是否有关于 AI Agent 学习路线的文章？
请总结 869HR 站点中和 ChatGPT 相关的教程，并列出来源。
某篇文章的原文链接是什么？
```

验收标准：

- 能检索到对应文章。
- 回答里有可理解来源标题。
- 来源能追溯到原始 URL。
- 回答内容基于文章正文，而不是只基于标题。

#### 4.1.7 备用离线导出方案

如果 FastGPT 链接集合接口抓取某些页面效果不好，可以使用离线导出脚本先转 Markdown，再上传文件。该方案是备用方案，不是首选界面流程。

小批量导出：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\local\export-sitemap-articles.ps1 -Limit 5 -Overwrite
```

全量导出：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\local\export-sitemap-articles.ps1 -Overwrite
```

导出位置：

```text
storage/web/869hr/markdown/
```
## 5. 模型配置边界

模型配置完全通过 FastGPT 原有页面完成，项目代码和脚本不写入模型渠道、模型名称、Base URL 或 API Key。

页面路径：

```text
账号 -> 模型提供商 -> 模型渠道
账号 -> 模型提供商 -> 模型配置
```

注意：

- 项目文档不固定推荐具体模型或渠道。
- 新建知识库时在 FastGPT 页面选择当前可用的向量化配置。
- 切换向量化配置后，已有知识库可能需要重新向量化或重建索引。
- 模型 API Key 只放在 FastGPT 页面，不提交 Git。

## 6. 数据存储规范

服务器使用以下目录保存资料和派生内容：

```text
/storage/docs/
/storage/images/
/storage/web/
/storage/videos/
/storage/derived/
/storage/tmp/
```

目录用途：

```text
/storage/docs/      PDF、DOCX、TXT、Markdown 原文件
/storage/images/    PNG、JPG、WEBP 原图
/storage/web/       URL 抓取后的 Markdown 和 metadata
/storage/videos/    视频链接 Markdown、字幕、metadata
/storage/derived/   摘要、图片描述、视频字幕等派生内容
/storage/tmp/       临时上传和处理中间文件
```

每个资料建议保存 metadata：

```json
{
  "title": "资料标题",
  "source_type": "pdf|docx|txt|markdown|text|url|image|video",
  "original_path": "/storage/docs/example.pdf",
  "original_url": "https://example.com/article",
  "derived_path": "/storage/derived/example.md",
  "category_path": "AI 应用开发 / MCP",
  "tags": ["MCP", "Agent", "Tool Calling"],
  "created_at": "2026-06-02T00:00:00+08:00",
  "updated_at": "2026-06-02T00:00:00+08:00",
  "processed_by": "model-name-or-tool-name"
}
```

原则：

- 原始文件必须保存。
- 向量数据只作为检索索引，不作为唯一资料存储。
- `/storage` 不通过 Caddy 直接裸露到公网。
- 原文查看必须经过 FastGPT 或应用层鉴权。

## 7. 分类与问答流程

系统不预设复杂固定分类，只保留兜底分类：

```text
待分类 / 临时收集
```

资料录入流程：

```text
上传 / 粘贴 / 导入资料
↓
提取标题、摘要、来源、关键词
↓
读取已有分类
↓
AI 推荐分类、标签和理由
↓
用户确认或调整
↓
保存原始资料
↓
生成向量
↓
入库
```

分类推荐规则：

```text
confidence >= 0.85：默认选中推荐分类，用户确认
0.60 <= confidence < 0.85：展示 Top 3，用户选择
confidence < 0.60：建议新增分类或进入待分类
```

问答流程：

```text
用户输入问题
↓
AI 推荐相关分类或知识库范围
↓
用户选择推荐范围、手动多选或全局问答
↓
向量 / 关键词 / 混合检索
↓
生成回答
↓
展示可理解来源
↓
支持查看原文
```

回答要求：

- 必须基于知识库内容回答。
- 必须显示可理解来源名称。
- 禁止只显示 `chunk_123` 这类不可理解引用。
- 每个来源应能打开原文、原图或原始 URL。

## 8. 本地验证流程

本地验证用于部署前检查 Docker、FastGPT compose、端口和验收资料。

前置条件：

- Docker Desktop 已启动。
- `key.md`、`.env`、`.env.local` 不提交 Git。

命令：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\local\prepare.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\local\start.ps1
```

脚本职责：

```text
prepare.ps1
- 生成私有 .env.local。
- 自动检测端口冲突。
- 创建 runtime、storage、logs 等本地运行目录。

start.ps1
- 检查 Docker daemon。
- 下载 FastGPT 官方 PgVector Docker Compose。
- 使用 .env.local 启动本地 stack。
```

默认端口：

```text
FastGPT Web: 3000
AIProxy: 3001
PostgreSQL: 5432
Redis: 6379
MongoDB: 27017
```

如端口被占用，脚本会自动向后选择可用端口并写入 `.env.local`。

`prepare.ps1` 也会生成本地私有 `runtime/fastgpt/docker-compose.local.override.yml`，用于修正本地 MinIO 外部访问地址。

当前本地 FastGPT Web 入口：`http://127.0.0.1:3000`。

生成验收资料：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\local\generate-fixtures.ps1
```

验收资料目录：

```text
tests/fixtures/
```

## 9. 服务器部署流程

部署前确认：

- 腾讯云服务器已创建快照。
- Cloudflare 中 `kb.zero007.chat` A 记录指向服务器公网 IP。
- 首次部署建议 `kb.zero007.chat` 使用 `DNS only`。
- 腾讯云安全组开放 TCP `80` 和 `443`。
- 服务器 Docker、Docker Compose、Caddy 可用。
- 当前 sub2api 服务不受部署影响，必要时避开业务高峰。

服务器目录初始化：

```bash
sudo bash /opt/fastgpt/bootstrap.sh
```

目录由 `deploy/server/bootstrap.sh` 创建：

```text
/opt/fastgpt/config
/opt/fastgpt/logs
/storage/docs
/storage/images
/storage/web
/storage/videos
/storage/derived
/storage/tmp
```

部署步骤：

1. 上传本地验证通过的 Docker Compose、配置文件和必要脚本到 `/opt/fastgpt`。
2. 在服务器配置 FastGPT、MongoDB、PostgreSQL + pgvector、Redis、AIProxy。
3. 启动 Docker Compose。
4. 配置 Caddy，让 `kb.zero007.chat` 反代 FastGPT Web。
5. 保持 `api.zero007.chat` 继续反代现有 sub2api。
6. 配置 HTTPS 和自动续期。
7. 登录 FastGPT 页面，确认模型渠道和模型可用。
8. 上传测试资料，完成入库、向量化、问答、引用和原文查看验收。

服务器检查脚本：

```bash
sudo bash /opt/fastgpt/check-server.sh
```

检查内容：

```text
系统信息
磁盘空间
内存
Docker 版本和容器状态
Caddy 版本和配置语法
```

## 10. Caddy 与 HTTPS

`kb.zero007.chat` Caddy 目标：

```text
kb.zero007.chat -> 127.0.0.1:${FASTGPT_WEB_PORT}
```

关键配置：

```caddyfile
kb.zero007.chat {
	reverse_proxy 127.0.0.1:${FASTGPT_WEB_PORT}
	request_body {
		max_size 100MB
	}
}
```

HTTPS：

```bash
sudo caddy fmt --overwrite /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

建议：

- 不为 `/storage` 配置静态公网访问。
- 上传大小先限制为 `100m`，后续按实际资料体积调整。
- Cloudflare Proxy 可在服务稳定后再开启，首次部署先减少排障变量。

## 11. 验收清单

基础服务：

```text
[ ] kb.zero007.chat 可以访问
[ ] 管理员账号可登录
[ ] FastGPT 容器正常
[ ] MongoDB 正常
[ ] PostgreSQL 正常
[ ] Redis 正常
[ ] AIProxy 正常
[ ] FastGPT 模型渠道调用正常
```

模型能力：

```text
[ ] 问答能力测试通过
[ ] 向量化能力测试通过
[ ] 失败时有明确错误提示
```

资料入库：

```text
[ ] PDF 上传成功
[ ] DOCX 上传成功
[ ] TXT 上传成功
[ ] Markdown 上传成功
[ ] 手动文本录入成功
[ ] 原始文件保存成功
[ ] 向量化成功
[ ] metadata 保存成功
```

问答：

```text
[ ] 单知识库问答成功
[ ] 多知识库问答成功
[ ] 全局问答成功
[ ] 回答包含来源
[ ] 来源名称可理解
[ ] 可以查看原文
```

性能：

```text
[ ] 内存长期低于 3.5 GB
[ ] CPU 长期低于 60%
[ ] 普通问题响应小于 15 秒
[ ] 上传 20MB PDF 不导致服务崩溃
```

## 12. 运维监控

日常检查：

```bash
docker ps
docker compose ps
docker compose logs --tail=200
df -h
free -h
caddy validate --config /etc/caddy/Caddyfile
systemctl status caddy
```

重点监控：

```text
CPU
内存
磁盘剩余空间
Docker 容器状态
FastGPT 日志
AIProxy 调用失败率
FastGPT 模型调用失败率
PostgreSQL 磁盘占用
storage 目录大小
Caddy 证书有效期
```

建议告警阈值：

```text
内存 > 3.5 GB 持续 5 分钟
CPU > 80% 持续 10 分钟
磁盘使用率 > 80%
FastGPT 模型调用失败率 > 10%
容器异常退出
```

常见处理：

- 模型测试失败：先在 FastGPT 页面测试模型渠道，再检查页面中的渠道配置。
- 向量化配置变更：已有知识库可能需要重新向量化。
- 上传失败：检查 `client_max_body_size`、FastGPT 日志和磁盘空间。
- WebSocket 或长请求异常：检查 Caddy 反代配置和 timeout 配置。
- Docker 镜像拉取失败：换服务器环境拉取、重试、或避开非必要组件。

## 13. 备份方案

最低备份：

```text
每日备份 MongoDB
每日备份 PostgreSQL
每周备份 /storage
部署前创建服务器快照
重大升级前创建服务器快照
```

推荐保留策略：

```text
最近 7 天每日备份
最近 4 周每周备份
```

后续可选：

```text
原始资料同步到腾讯云 COS
数据库备份同步到 COS
```

恢复演练建议：

1. 在非生产目录恢复 MongoDB。
2. 在非生产目录恢复 PostgreSQL。
3. 挂载或复制 `/storage`。
4. 启动临时 FastGPT stack。
5. 抽样检查知识库、引用和原文查看。

## 14. 安全要求

密钥：

- `key.md`、`.env`、`.env.local` 不提交 Git。
- API Key、服务器密码、SSH private key 不发送到聊天或公开文档。
- 已暴露的 API Key 应立即吊销并重新生成。

访问：

- FastGPT 管理后台必须使用强密码。
- 上线后立即修改初始管理员密码。
- 原文查看必须经过登录鉴权。
- `/storage` 不直接公网裸露。

Caddy：

- 限制上传大小。
- 开启 HTTPS。
- 保留 WebSocket 代理支持。

SSRF 防护，V2 URL 抓取前必须落实：

```text
禁止抓取 127.0.0.1
禁止抓取 localhost
禁止抓取内网 IP
禁止抓取云厂商 metadata 地址
限制跳转次数
限制下载大小
限制请求超时
```

## 15. 费用边界

V1 必要成本：

```text
现有腾讯云服务器成本
模型 API 调用额度
```

V1 免费或已包含部分：

```text
FastGPT 社区版
Docker
Caddy
MongoDB
PostgreSQL
pgvector
Redis
本地 storage
Let's Encrypt SSL
```

可选成本：

```text
腾讯云 COS：原始资料备份或扩容
服务器快照：部署和升级前建议创建
重排能力：效果不够时再按需启用
```

V2 可能产生费用：

```text
图片理解能力调用
复杂网页抓取服务
视频转写服务
批量爬虫服务
COS 存储和外网流量
```

## 16. 仓库与文件说明

仓库只保存文档、脚本、模板和验收资料，不保存密钥和运行态数据。

主要目录：

```text
scripts/local/        本地准备、启动、验证和测试资料生成脚本
deploy/server/        服务器初始化和检查脚本
deploy/caddy/         Caddy 配置模板
tests/fixtures/       验收测试资料
```

忽略文件：

```text
key.md
.env
.env.*
runtime/
storage/
logs/
tmp/
*.log
```

GitHub：

```text
仓库名：ai-knowledge-base
建议可见性：Private
默认分支：main
```

## 17. 长期维护原则

- 版本创建、提测、部署、回滚以 `docs/version-management.md` 为准。
- 模型渠道只通过 FastGPT 页面配置，不为模型变更改代码。
- 每次新增资料类型前，先明确原始资料保存位置、metadata、引用方式和安全边界。
- 每次切换向量化配置后，评估是否需要重建已有知识库向量。
- 每次上线或升级前创建快照。
- 每次开放外部抓取能力前，先完成 SSRF 防护。
- 文档保持“当前可执行状态”，不要保留临时待办、历史阻塞、聊天过程和已过期模型结论。
