# AI 私有知识库系统实施交接文档 V1.0

## 1. 项目目标

基于现有腾讯云 CVM、Docker、Nginx、sub2api，部署一个私有化 AI 知识库系统。

目标效果：

- 保存原始资料
- 支持文档、文本、URL、图片、视频资料逐步入库
- 支持 AI 问答
- 回答必须带可理解来源
- 引用必须能追溯原文、原图或原始链接
- 分类不预初始化，由 AI 根据已有内容动态推荐，人工确认

最终形态：

```text
个人版 NotebookLM + 私有知识库 + AI 研发资料中心
```

## 2. 当前基础设施

已有资源：

```text
服务器：腾讯云 CVM
配置：2 Core / 4 GB RAM / 60 GB SSD
已用磁盘：约 13 GB
已部署：Docker、Nginx、sub2api
已有域名：api.zero007.chat
新增域名：kb.zero007.chat
```

资源约束：

```text
内存长期低于 3.5 GB
CPU 长期低于 60%
单次问答响应小于 15 秒
不新增服务器作为 V1 必要条件
```

## 3. 总体优先级

所有功能按以下优先级落地：

```text
1. 本地小资源可运行的，优先本地运行
2. 需要 AI 理解/生成/分类的，优先走自己的大模型 API 额度
3. 需要 MCP 工具的，优先选择完全免费/开源 MCP
4. 免费 MCP 不够时，再接第三方免费额度或付费服务
```

## 4. 最终架构

```text
用户
↓
kb.zero007.chat
↓
Nginx
↓
FastGPT
├── MongoDB：业务数据、知识库元数据
├── PostgreSQL + pgvector：向量数据
├── Redis：缓存
├── 本地 storage：原始资料和派生 Markdown
└── AIProxy
    ↓
    sub2api
    ↓
    自有大模型 API URL + API Key
```

V1 不引入重型本地组件：

```text
不本地跑 Milvus
不本地跑本地大模型
不本地跑本地 embedding 模型
不本地跑 Whisper
不本地跑 Marker/MinerU
不本地跑浏览器集群
不启用复杂 Agent 沙盒
```

## 5. V1 范围

V1 必须实现：

```text
FastGPT 部署
sub2api 对接
PDF 上传
DOCX 上传
TXT 上传
Markdown 上传
文本录入
原始资料保存
自动向量化
AI 问答
来源引用
原文查看
动态分类推荐
查询分类推荐
多知识库选择
全局问答入口
```

V1 暂不实现：

```text
复杂网页自动抓取
图片自动理解
视频自动字幕提取
批量爬虫
自动迁移分类
NotebookLM 风格交互
多模态全文精准定位
```

## 6. V2 范围

V2 实现：

```text
普通 URL 自动抓取
图片理解并转 Markdown
视频字幕导入
复杂网页外部服务接入
一键重新分析分类结构
标签管理
批量分类调整建议
```

V2 仍遵守成本优先级：

```text
普通 URL：本地免费抓取优先
图片理解：走自己的多模态模型 API
视频：优先已有字幕，其次外部 ASR
复杂网页：免费 MCP 不够时再接 Firecrawl/Browserbase/Apify
```

## 7. 费用边界

### 7.1 V1 必要费用

```text
现有腾讯云服务器成本
自有大模型 Chat API 调用额度
自有 embedding API 调用额度
```

### 7.2 V1 免费部分

```text
FastGPT 社区版
Docker
Nginx
MongoDB
PostgreSQL
pgvector
Redis
本地 storage
Let's Encrypt SSL
本地免费 MCP
```

### 7.3 V1 可选费用

```text
腾讯云 COS：原始资料备份或扩容时使用
服务器快照：建议开启，但不是系统运行必要条件
Rerank 模型：V1 可先不启用
```

### 7.4 V2 可能产生费用

```text
图片理解：消耗自有多模态模型 API 额度
复杂 URL 抓取：Firecrawl、Browserbase、Apify 等可能收费
视频无字幕转写：ASR 服务可能收费
批量社媒抓取：通常需要第三方服务额度
COS 存储和外网流量：数据量变大后可能产生费用
```

## 8. 服务选型

### 8.1 本地小资源运行

V1 本地运行：

```text
FastGPT
MongoDB
PostgreSQL + pgvector
Redis
Nginx
本地 storage
简单 URL Fetch
动态分类逻辑
```

低资源免费 MCP：

```text
Fetch MCP：抓普通静态网页
Filesystem MCP：管理指定 storage 目录
Git MCP：导入项目 README、docs、部署文档
Time MCP：记录采集时间和资料时间
Memory MCP：可选，不作为 V1 必需
```

### 8.2 走自有大模型 API

以下能力全部优先走自己的模型额度：

```text
AI 问答
Embedding
资料摘要
标题生成
标签生成
录入分类推荐
查询范围推荐
分类结构重分析
图片理解
内容清洗
Markdown 改写
引用答案生成
```

### 8.3 第三方服务放到 V2

仅当本地免费方案不满足时接入：

```text
Firecrawl：网页抓取、网页转 Markdown
Browserbase：复杂 JS 网页、云浏览器，可配置自有 modelApiKey
Apify：批量爬虫、视频平台、社媒平台
Zapier/Pipedream：第三方应用自动化连接
外部 ASR：视频无字幕时转写
```

## 9. 数据存储规范

V1 使用本地目录：

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
/storage/docs/      保存 PDF、DOCX、TXT、Markdown 原文件
/storage/images/    保存 PNG、JPG、WEBP 原图
/storage/web/       保存 URL 抓取后的 Markdown 和 metadata
/storage/videos/    保存视频链接 Markdown、字幕、metadata
/storage/derived/   保存摘要、图片描述、视频字幕等派生内容
/storage/tmp/       临时上传和处理中间文件
```

每个资料必须保存 metadata：

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

禁止只保存向量数据。

## 10. 动态分类体系

不初始化固定知识库种类。

系统只保留一个兜底分类：

```text
待分类 / 临时收集
```

### 10.1 录入时分类推荐

流程：

```text
用户上传/粘贴/导入
↓
系统提取标题、正文摘要、来源、关键词
↓
读取当前已有分类
↓
AI 判断：
  - 使用已有分类
  - 新增分类
  - 放入待分类
↓
用户确认
↓
保存原始资料
↓
生成向量
↓
入库
```

AI 输出结构：

```json
{
  "action": "use_existing",
  "category_path": "AI 应用开发 / MCP",
  "confidence": 0.86,
  "reason": "内容主要讨论 MCP Server、工具调用和 Agent 集成。",
  "suggested_tags": ["MCP", "Agent", "Tool Calling"],
  "alternative_categories": [
    "AI 应用开发 / Agent",
    "AI 编程与工程效率 / Codex"
  ]
}
```

分类规则：

```text
confidence >= 0.85：默认选中推荐分类，用户确认
0.60 <= confidence < 0.85：展示 Top 3，用户选择
confidence < 0.60：建议新增分类或进入待分类
```

### 10.2 查询时分类推荐

流程：

```text
用户输入问题
↓
AI 根据问题推荐相关分类
↓
界面展示可选分类
↓
用户可选择：
  - AI 推荐分类
  - 手动多选知识库
  - 全局问答
↓
检索
↓
生成回答
↓
展示引用来源
↓
支持查看原文
```

示例：

```text
问题：Codex 怎么接 MCP？

推荐检索范围：
[x] AI 编程与工程效率 / Codex
[x] AI 应用开发 / MCP
[x] AI 应用开发 / Agent
[ ] 全局问答
```

### 10.3 维护时分类重分析

功能名称：

```text
一键重新分析分类结构
```

流程：

```text
读取所有资料标题、摘要、标签、来源、引用频率
↓
发现分类过大、过小、重复、混乱
↓
AI 生成调整建议
↓
用户确认
↓
执行合并、拆分、迁移或仅改标签
```

调整建议示例：

```text
建议拆分：
AI 应用开发 / Agent
↓
AI 应用开发 / Agent 基础
AI 应用开发 / Agent Workflow
AI 应用开发 / Agent Memory

建议合并：
AI 工具调用
MCP / Tool Use
↓
AI 应用开发 / MCP 与工具调用
```

## 11. 检索和问答策略

V1 默认策略：

```text
Embedding 检索：开启
关键词检索：开启
混合检索：开启
Query Optimization：开启
Rerank：默认关闭，效果不够时再启用
引用来源：必须展示
原文查看：必须支持
```

回答要求：

```text
必须基于知识库内容回答
必须显示可理解来源名称
禁止显示 chunk_123 这类不可理解引用
每个来源必须能打开原文、原图或原始 URL
```

引用格式：

```text
来源：
1. Agent设计指南.pdf [查看原文]
2. OpenAI 官方文档：Responses API [打开链接]
3. Agent 架构图.png [查看原图]
```

## 12. 部署执行步骤

### 12.1 DNS

新增解析：

```text
kb.zero007.chat -> 服务器公网 IP
```

保留：

```text
api.zero007.chat -> sub2api
```

### 12.2 服务器目录

创建目录：

```text
/opt/fastgpt/
/opt/fastgpt/config/
/opt/fastgpt/logs/
/storage/docs/
/storage/images/
/storage/web/
/storage/videos/
/storage/derived/
/storage/tmp/
```

### 12.3 部署组件

部署：

```text
FastGPT
MongoDB
PostgreSQL + pgvector
Redis
AIProxy
```

推荐使用 FastGPT 官方 Docker Compose 的 pgvector 版本作为基础模板。

资源优化参数：

```text
PARSE_FILE_WORKERS=1
HTML_TO_MARKDOWN_WORKERS=1
Redis maxmemory=256mb 或 512mb
PostgreSQL shared_buffers 控制在 256mb 左右
不启用 Milvus
不启用本地重型解析服务
```

### 12.4 模型配置

通过 AIProxy 配置：

```text
Base URL：sub2api 的 OpenAI-compatible 地址
API Key：sub2api 可用 key
Chat Model：默认 GPT-5.5 或你的主力模型
Embedding Model：text-embedding-3-large 或兼容 embedding 模型
Vision Model：V2 使用，用于图片理解
Rerank Model：可选
```

要求：

```text
模型可切换
OpenAI 兼容接口可用
Chat 和 embedding 必须分别测试
```

### 12.5 Nginx

配置目标：

```text
kb.zero007.chat -> FastGPT Web
api.zero007.chat -> sub2api
```

启用：

```text
HTTPS
WebSocket 支持
上传大小限制
反向代理超时
```

建议上传限制：

```text
client_max_body_size 100m;
```

### 12.6 SSL

使用 Let's Encrypt：

```text
kb.zero007.chat
api.zero007.chat
```

配置自动续期。

## 13. V1 验收清单

基础服务：

```text
[ ] kb.zero007.chat 可以访问
[ ] 管理员账号可登录
[ ] FastGPT 容器正常
[ ] MongoDB 正常
[ ] PostgreSQL 正常
[ ] Redis 正常
[ ] AIProxy 正常
[ ] sub2api 调用正常
```

模型：

```text
[ ] Chat 模型测试通过
[ ] Embedding 模型测试通过
[ ] 模型可切换
[ ] 失败时有错误提示
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

分类：

```text
[ ] 新资料录入时 AI 推荐分类
[ ] 可使用已有分类
[ ] 可建议新增分类
[ ] 可进入待分类
[ ] 用户确认后入库
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

## 14. V2 验收清单

URL：

```text
[ ] 普通 URL 可抓取
[ ] 标题保存
[ ] 原始 URL 保存
[ ] 正文 Markdown 保存
[ ] 可入库问答
```

图片：

```text
[ ] 原图保存
[ ] 多模态模型生成 Markdown 描述
[ ] 能理解截图、流程图、架构图
[ ] 图片描述可问答
[ ] 来源可查看原图
```

视频：

```text
[ ] 视频链接保存
[ ] 已有字幕可导入
[ ] 字幕转 Markdown
[ ] 可问答
[ ] 来源可打开原始视频链接
```

分类维护：

```text
[ ] 一键重新分析分类结构
[ ] 生成合并建议
[ ] 生成拆分建议
[ ] 生成迁移建议
[ ] 用户确认后执行
```

## 15. 安全要求

```text
FastGPT 管理后台必须强密码
AIProxy 密钥不得公开
sub2api 密钥不得公开
storage 目录不得直接公网裸露
原文查看必须经过应用鉴权或签名链接
Nginx 限制上传大小
定期备份数据库和原始资料
MCP Filesystem 只能访问指定 storage 目录
外部 URL 抓取需要限制内网地址访问，避免 SSRF
```

SSRF 防护要求：

```text
禁止抓取 127.0.0.1
禁止抓取 localhost
禁止抓取内网 IP
禁止抓取云厂商 metadata 地址
限制跳转次数
限制下载大小
限制请求超时
```

## 16. 备份方案

V1 最低备份：

```text
每日备份 MongoDB
每日备份 PostgreSQL
每周备份 /storage
部署前创建服务器快照
重大升级前创建服务器快照
```

推荐升级：

```text
原始资料同步到腾讯云 COS
数据库备份同步到 COS
保留最近 7 天每日备份
保留最近 4 周每周备份
```

## 17. 运维监控

至少监控：

```text
CPU
内存
磁盘剩余空间
Docker 容器状态
FastGPT 日志
AIProxy 调用失败率
sub2api 调用失败率
PostgreSQL 磁盘占用
storage 目录大小
```

告警阈值：

```text
内存 > 3.5 GB 持续 5 分钟
CPU > 80% 持续 10 分钟
磁盘使用率 > 80%
模型调用失败率 > 10%
容器异常退出
```

## 18. 实施顺序

第一阶段：V1 部署

```text
1. 配置 DNS：kb.zero007.chat
2. 准备 /opt/fastgpt 和 /storage 目录
3. 部署 FastGPT + MongoDB + PostgreSQL + Redis + AIProxy
4. 配置 Nginx 和 HTTPS
5. 配置 AIProxy -> sub2api -> 自有模型 API
6. 测试 Chat 模型
7. 测试 embedding 模型
8. 创建兜底分类：待分类 / 临时收集
9. 测试 PDF/DOCX/TXT/Markdown 入库
10. 测试 AI 分类推荐
11. 测试单库、多库、全局问答
12. 测试引用和原文查看
13. 完成 V1 验收
```

第二阶段：V2 扩展

```text
1. 接入普通 URL 本地抓取
2. 接入图片理解，走自有多模态模型
3. 接入视频字幕导入
4. 接入分类结构重分析
5. 评估复杂网页是否需要 Firecrawl/Browserbase
6. 评估批量爬虫是否需要 Apify
7. 完成 V2 验收
```

## 19. 交付物

V1 交付物：

```text
FastGPT 可用站点：kb.zero007.chat
AIProxy 模型配置
Nginx 配置
Docker Compose 配置
storage 目录结构
动态分类功能
上传入库流程
问答和引用流程
备份脚本或备份说明
管理员账号交接
```

V2 交付物：

```text
URL 导入流程
图片理解流程
视频字幕导入流程
分类结构重分析功能
第三方服务接入说明
费用使用说明
```

## 20. 成功标准

用户能够：

```text
1. 上传文档并保留原文件
2. 粘贴文本并入库
3. AI 自动推荐分类，用户确认
4. 使用自然语言提问
5. 选择 AI 推荐分类、多个知识库或全局问答
6. 获得基于知识库的回答
7. 查看可理解来源
8. 点击打开原文、原图或原始链接
9. 定期让 AI 重新分析分类结构
10. 长期积累个人知识资产
```

系统最终形成：

```text
个人版 NotebookLM + 私有知识库 + AI 研发资料中心
```

