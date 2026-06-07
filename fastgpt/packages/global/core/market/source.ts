export const MarketSourceTypeEnum = {
  fastgptPlugin: 'fastgpt-plugin',
  mcpRegistry: 'mcp-registry',
  openapiDirectory: 'openapi-directory',
  githubTemplate: 'github-template',
  difyTemplate: 'dify-template',
  n8nTemplate: 'n8n-template',
  cozeTemplate: 'coze-template',
  langchainTemplate: 'langchain-template'
} as const;

export type MarketSourceTypeEnum =
  (typeof MarketSourceTypeEnum)[keyof typeof MarketSourceTypeEnum];

export type MarketSourceCapability =
  | 'tool'
  | 'workflow'
  | 'template'
  | 'mcp'
  | 'openapi'
  | 'prompt';

export type MarketSourceInstallMode =
  | 'built-in'
  | 'direct-import'
  | 'manual-url'
  | 'manual-package'
  | 'reference';

export type MarketSourceListItemType = {
  id: string;
  name: string;
  type: MarketSourceTypeEnum;
  description: string;
  homepage: string;
  enabled: boolean;
  capabilities: MarketSourceCapability[];
  installMode: MarketSourceInstallMode;
  usage: string;
  actionLabel?: string;
  route?: string;
  itemsUrl?: string;
  requiresManualConfig?: boolean;
};

export type MarketSourceListResponseType = MarketSourceListItemType[];

export const defaultMarketSources: MarketSourceListItemType[] = [
  {
    id: 'fastgpt-local-plugin',
    name: 'FastGPT 本地插件资源',
    type: MarketSourceTypeEnum.fastgptPlugin,
    description: '使用本地已安装的系统工具，以及 .pkg/.zip 插件包。',
    homepage: '/config/tool',
    enabled: true,
    capabilities: ['tool', 'workflow'],
    installMode: 'direct-import',
    usage: '通过“导入资源”上传 .pkg 或 .zip 插件包，也可以选择已有应用作为工作流工具。',
    actionLabel: '导入资源',
    route: '/config/tool'
  },
  {
    id: 'mcp-official-registry',
    name: 'MCP official registry',
    type: MarketSourceTypeEnum.mcpRegistry,
    description: 'Model Context Protocol 官方 MCP server registry，用于发现可接入的 MCP server。',
    homepage: 'https://github.com/modelcontextprotocol/registry',
    enabled: true,
    capabilities: ['mcp', 'tool'],
    installMode: 'manual-url',
    usage: '打开来源选择合适的 server，再在 FastGPT 中创建 MCP 工具并填写 endpoint 与认证配置。',
    actionLabel: '创建 MCP 工具',
    route: '/dashboard/create?appType=toolSet',
    requiresManualConfig: true
  },
  {
    id: 'openapi-directory-apis-guru',
    name: 'APIs.guru OpenAPI Directory',
    type: MarketSourceTypeEnum.openapiDirectory,
    description: '公开 OpenAPI/Swagger 定义目录，可用于发现和导入 HTTP API schema。',
    homepage: 'https://apis.guru/openapi-directory/',
    itemsUrl: 'https://api.apis.guru/v2/list.json',
    enabled: true,
    capabilities: ['openapi', 'tool'],
    installMode: 'manual-url',
    usage: '复制合适的 OpenAPI schema URL，然后通过 HTTP 工具的 OpenAPI/Swagger 流程导入。',
    actionLabel: '创建 HTTP 工具',
    route: '/dashboard/create?appType=httpToolSet',
    requiresManualConfig: true
  },
  {
    id: 'github-openapi-directory',
    name: 'GitHub OpenAPI specs',
    type: MarketSourceTypeEnum.githubTemplate,
    description: '托管在 GitHub 上的社区维护 OpenAPI specs。',
    homepage: 'https://github.com/APIs-guru/openapi-directory',
    enabled: true,
    capabilities: ['openapi', 'tool'],
    installMode: 'manual-url',
    usage: '作为 schema 文件参考来源，找到合适 URL 后导入为 HTTP 工具。',
    actionLabel: '创建 HTTP 工具',
    route: '/dashboard/create?appType=httpToolSet',
    requiresManualConfig: true
  },
  {
    id: 'dify-community-templates',
    name: 'Dify community templates',
    type: MarketSourceTypeEnum.difyTemplate,
    description: 'Dify 应用和 workflow 模板参考源。当前作为设计参考，暂不做自动转换。',
    homepage: 'https://dify.ai/',
    enabled: true,
    capabilities: ['workflow', 'template'],
    installMode: 'reference',
    usage: '查看 workflow 设计，适合当前项目时手动复刻为 FastGPT workflow。',
    requiresManualConfig: true
  },
  {
    id: 'coze-plugin-workflow-reference',
    name: 'Coze plugin and workflow reference',
    type: MarketSourceTypeEnum.cozeTemplate,
    description: 'Coze 插件和 workflow 参考源。当前作为工具设计参考，暂不做自动转换。',
    homepage: 'https://docs.coze.com/guides/plugin_node',
    enabled: true,
    capabilities: ['tool', 'workflow', 'template'],
    installMode: 'reference',
    usage: '参考 Coze 插件节点和 workflow 设计，按需在 FastGPT 中复刻为 HTTP/MCP/工作流工具。',
    requiresManualConfig: true
  },
  {
    id: 'n8n-workflow-templates',
    name: 'n8n workflow templates',
    type: MarketSourceTypeEnum.n8nTemplate,
    description: 'n8n 官方 workflow template 目录，可用于自动化场景和集成模式参考。',
    homepage: 'https://n8n.io/workflows/',
    enabled: true,
    capabilities: ['workflow', 'template'],
    installMode: 'reference',
    usage: '作为集成 workflow 参考，将相关逻辑复刻为 FastGPT 工具、HTTP 工具或 MCP 工具。',
    requiresManualConfig: true
  },
  {
    id: 'langchain-hub',
    name: 'LangChain Hub',
    type: MarketSourceTypeEnum.langchainTemplate,
    description: 'Prompt 与 chain 模板来源，可复用其中的提示词结构。',
    homepage: 'https://smith.langchain.com/hub',
    enabled: true,
    capabilities: ['prompt', 'template'],
    installMode: 'reference',
    usage: '参考 prompt 模板，把合适的提示词迁移到 FastGPT workflow 或应用提示词中。',
    requiresManualConfig: true
  }
];
