# 验收测试资料

测试资料由 `ops/scripts/local/generate-fixtures.ps1` 生成，用于验证 FastGPT V1 入库和问答流程。

生成后应包含：

- `ai-knowledge-overview.md`
- `mcp-agent-notes.txt`
- `deployment-checklist.docx`
- `citation-policy.pdf`
- `acceptance-questions.md`
- `manual-text.txt`（复制其内容到手动文本入口，不作为上传文件验收）

验收映射：

| 类型     | 资料                        | 验收重点                     |
| -------- | --------------------------- | ---------------------------- |
| Markdown | `ai-knowledge-overview.md`  | 上传、切块、向量化、来源标题 |
| TXT      | `mcp-agent-notes.txt`       | 上传、向量化、问答引用       |
| DOCX     | `deployment-checklist.docx` | 原始文件保存、解析、问答     |
| PDF      | `citation-policy.pdf`       | 原始文件保存、解析、问答     |
| 手动文本 | `manual-text.txt` 内容      | 粘贴入库、向量化、来源标题   |

Word 不可用时，生成器会保留 `deployment-checklist.docx.txt` 和
`citation-policy.pdf.txt` 文本回退文件；这种状态只能验证文本内容准备，不能替代真实 DOCX/PDF 解析验收。

每轮本地验证应新建带时间戳的知识库名称（例如 `local-validation-20261004-1200`）。
不要复用模型配置前创建的旧库（例如 `local-dedup-validation`），也不要把旧库的失败训练队列当作新验收结果。
