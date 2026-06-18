import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  PreviewGithubProjectCardsBodySchema,
  PreviewGithubProjectCardsResponseSchema,
  type PreviewGithubProjectCardsBodyType,
  type PreviewGithubProjectCardsResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/createApi';

const USER_AGENT = 'FastGPT-github-project-card-import/1.0';
const GITHUB_HOSTS = new Set(['github.com', 'www.github.com']);

type ParsedGithubUrl = {
  owner: string;
  repo: string;
  sourceUrl: string;
  sourcePath?: string;
  branch?: string;
};

type GithubRepoInfo = {
  name?: string;
  full_name?: string;
  description?: string | null;
  html_url?: string;
  language?: string | null;
  topics?: string[];
  default_branch?: string;
};

function parseGithubUrl(input: string): ParsedGithubUrl {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error(`无效的 GitHub 链接：${input}`);
  }

  if (!GITHUB_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error(`仅支持 github.com 链接：${input}`);
  }

  const parts = url.pathname.split('/').filter(Boolean);
  const [owner, repoWithSuffix] = parts;
  if (!owner || !repoWithSuffix) {
    throw new Error(`GitHub 链接缺少 owner/repo：${input}`);
  }

  const repo = repoWithSuffix.replace(/\.git$/i, '');
  const parsed: ParsedGithubUrl = {
    owner,
    repo,
    sourceUrl: `https://github.com/${owner}/${repo}`
  };

  if (parts[2] === 'tree' && parts[3]) {
    parsed.branch = parts[3];
    parsed.sourcePath = parts.slice(4).join('/');
    parsed.sourceUrl = `https://github.com/${owner}/${repo}/tree/${parts[3]}${
      parsed.sourcePath ? `/${parsed.sourcePath}` : ''
    }`;
  }

  return parsed;
}

function uniq(items: Array<string | undefined | null>) {
  return [...new Set(items.map((item) => item?.trim()).filter((item): item is string => !!item))];
}

function titleFromSlug(value: string) {
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function detectCategory(parsed: ParsedGithubUrl, repo: GithubRepoInfo, readme: string) {
  const haystack = `${parsed.repo} ${parsed.sourcePath || ''} ${repo.description || ''} ${
    repo.topics?.join(' ') || ''
  } ${readme.slice(0, 2000)}`.toLowerCase();

  if (/rag|knowledge|vector|retrieval|知识库|检索/.test(haystack)) return 'RAG / 知识库应用';
  if (/agent|multi-agent|autogen|crewai|代理/.test(haystack)) return 'AI Agent 应用';
  if (/chatbot|chatgpt|chat[-_ ]?ui|nextchat|聊天/.test(haystack)) return 'LLM 聊天前端';
  if (/youtube|video|视频/.test(haystack)) return '视频理解与问答';
  if (/voice|audio|speech|语音/.test(haystack)) return '语音 AI 应用';
  if (/browser|web[-_ ]?agent|automation|自动化/.test(haystack)) return '浏览器自动化 / 工作流';
  if (/data|csv|excel|bi|analytics|分析/.test(haystack)) return '数据分析应用';
  if (/image|vision|ocr|图像|视觉/.test(haystack)) return '视觉 AI 应用';
  return 'LLM 应用模板';
}

function detectCapabilities(parsed: ParsedGithubUrl, repo: GithubRepoInfo, readme: string) {
  const haystack = `${parsed.repo} ${parsed.sourcePath || ''} ${repo.description || ''} ${
    repo.topics?.join(' ') || ''
  } ${readme.slice(0, 3000)}`.toLowerCase();
  const capabilities: string[] = [];

  if (/chat|chatgpt|conversation|聊天|对话/.test(haystack)) capabilities.push('AI 对话界面');
  if (/rag|retrieval|vector|knowledge|知识库|检索/.test(haystack)) capabilities.push('知识库检索增强');
  if (/agent|tool|function calling|workflow|代理|工具调用/.test(haystack)) capabilities.push('Agent 与工具调用');
  if (/youtube|video|视频/.test(haystack)) capabilities.push('视频内容问答');
  if (/csv|excel|data|analytics|bi|数据|分析/.test(haystack)) capabilities.push('数据分析');
  if (/deploy|docker|self-host|自托管/.test(haystack)) capabilities.push('自托管部署');
  if (/next\.js|react|vue|frontend|前端/.test(haystack)) capabilities.push('Web 前端交互');
  if (/python|fastapi|streamlit|gradio/.test(haystack)) capabilities.push('Python 快速原型');

  return uniq(capabilities).slice(0, 6);
}

function detectStack(repo: GithubRepoInfo, readme: string) {
  const haystack = `${repo.language || ''} ${readme.slice(0, 4000)}`.toLowerCase();
  const stack: string[] = [];

  if (repo.language) stack.push(repo.language);
  if (/next\.js|nextjs/.test(haystack)) stack.push('Next.js');
  if (/react/.test(haystack)) stack.push('React');
  if (/typescript|\.tsx|\.ts/.test(haystack)) stack.push('TypeScript');
  if (/python/.test(haystack)) stack.push('Python');
  if (/streamlit/.test(haystack)) stack.push('Streamlit');
  if (/fastapi/.test(haystack)) stack.push('FastAPI');
  if (/docker/.test(haystack)) stack.push('Docker');
  if (/langchain/.test(haystack)) stack.push('LangChain');
  if (/llamaindex|llama-index/.test(haystack)) stack.push('LlamaIndex');

  return uniq(stack).slice(0, 8);
}

function buildKeywords(parsed: ParsedGithubUrl, repo: GithubRepoInfo, category: string, capabilities: string[]) {
  return uniq([
    parsed.repo,
    titleFromSlug(parsed.repo),
    parsed.sourcePath?.split('/').pop(),
    category,
    ...(repo.topics || []),
    ...capabilities,
    repo.language || undefined
  ]).slice(0, 12);
}

function buildCardText({
  parsed,
  repo,
  readme
}: {
  parsed: ParsedGithubUrl;
  repo: GithubRepoInfo;
  readme: string;
}) {
  const name = repo.name || parsed.repo;
  const description = repo.description?.trim() || `${titleFromSlug(name)} 开源项目模板`;
  const category = detectCategory(parsed, repo, readme);
  const capabilities = detectCapabilities(parsed, repo, readme);
  const stack = detectStack(repo, readme);
  const keywords = buildKeywords(parsed, repo, category, capabilities);
  const sourcePath = parsed.sourcePath || '';

  const text = [
    `项目名称：${name}`,
    `分类：${category}`,
    `项目定位：${description}`,
    `适合需求：${capabilities.length > 0 ? capabilities.map((item) => `需要${item}`).join('；') : `需要 ${category} 类开源模板、可运行项目或二次开发参考`}`,
    `不适合需求：与 ${category} 无关的纯内容写作、通用闲聊或无需代码实现的咨询场景`,
    `核心能力：${capabilities.length > 0 ? capabilities.join('、') : `${category} 项目模板、可 clone、可二次开发`}`,
    `技术栈/框架：${stack.length > 0 ? stack.join('、') : '未明确'}`,
    `来源链接：${parsed.sourceUrl}`,
    `源码路径：${sourcePath}`,
    `是否外部项目：True`,
    `精准关键词：${keywords.join('、')}`,
    `推荐方式：当用户描述的功能、行业、交互方式、技术栈或关键词与本项目匹配时，推荐该项目作为开源模板；返回时说明适合原因、能力边界和来源链接。`
  ].join('\n');

  return { name, category, sourcePath, text };
}

async function fetchJson<T>(url: string): Promise<T | undefined> {
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': USER_AGENT
      },
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) return undefined;
    return (await res.json()) as T;
  } catch {
    return undefined;
  }
}

async function fetchText(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) return '';
    return await res.text();
  } catch {
    return '';
  }
}

async function getReadme(parsed: ParsedGithubUrl, defaultBranch?: string) {
  const branch = parsed.branch || defaultBranch || 'main';
  const readmeCandidates = ['README.md', 'readme.md', 'README.zh-CN.md'];
  const basePath = parsed.sourcePath ? `${parsed.sourcePath.replace(/\/$/, '')}/` : '';

  for (const filename of readmeCandidates) {
    const url = `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${branch}/${basePath}${filename}`;
    const text = await fetchText(url);
    if (text) return text;
  }

  return '';
}

async function buildCard(input: string) {
  const parsed = parseGithubUrl(input);
  const repo =
    (await fetchJson<GithubRepoInfo>(
      `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`
    )) || {
      name: parsed.repo,
      html_url: parsed.sourceUrl
    };
  const readme = await getReadme(parsed, repo.default_branch);
  const card = buildCardText({ parsed, repo, readme });

  return {
    name: card.name,
    category: card.category,
    sourceUrl: parsed.sourceUrl,
    sourcePath: card.sourcePath || undefined,
    owner: parsed.owner,
    repo: parsed.repo,
    text: card.text
  };
}

async function handler(
  req: ApiRequestProps<PreviewGithubProjectCardsBodyType>
): Promise<PreviewGithubProjectCardsResponseType> {
  const { datasetId, urls } = parseApiInput({
    req,
    bodySchema: PreviewGithubProjectCardsBodySchema
  }).body;

  await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: WritePermissionVal
  });

  const normalizedUrls = [...new Set(urls.map((url) => url.trim()).filter(Boolean))];
  const cards = await Promise.all(normalizedUrls.map(buildCard));

  return PreviewGithubProjectCardsResponseSchema.parse({
    total: cards.length,
    cards
  });
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '2mb'
    }
  }
};

export default NextAPI(handler);
