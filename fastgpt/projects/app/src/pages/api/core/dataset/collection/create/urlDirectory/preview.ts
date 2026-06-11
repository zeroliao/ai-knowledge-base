import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { checkUrlSafety } from '@fastgpt/service/common/system/utils';
import {
  PreviewUrlDirectoryBodySchema,
  PreviewUrlDirectoryResponseSchema,
  type PreviewUrlDirectoryBodyType,
  type PreviewUrlDirectoryResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/createApi';

const MAX_PREVIEW_URLS = 1000;
const USER_AGENT = 'FastGPT-url-directory-import/1.0';
const DISCOVERY_CANDIDATE_PATHS = [
  '/robots.txt',
  '/sitemap.xml',
  '/sitemap_index.xml',
  '/sitemap-index.xml',
  '/sitemap/sitemap.xml',
  '/feed',
  '/feed.xml',
  '/rss.xml',
  '/atom.xml'
];
const NON_ARTICLE_EXTENSIONS =
  /\.(?:css|js|mjs|map|json|xml|txt|ico|png|jpe?g|gif|webp|svg|avif|bmp|mp3|mp4|m4a|wav|avi|mov|wmv|zip|rar|7z|gz|tar|pdf|docx?|xlsx?|pptx?)$/i;
const NON_ARTICLE_PATH_PATTERNS = [
  /^\/$/,
  /^\/(?:index|home)\/?$/i,
  /^\/(?:categories?|tags?|archives?|page|pages|search|sitemap|about|friends|support|contact|privacy)(?:\/|$)/i,
  /^\/(?:category|tag|archive|author|authors|topics?|columns?|series)(?:\/|$)/i,
  /^\/(?:login|logout|signup|register|account|user|users|member|members|profile)(?:\/|$)/i,
  /^\/(?:ads?|advertisements?|sponsors?|promotion|promo|links?|nav|menu)(?:\/|$)/i,
  /^\/(?:feed|rss|atom)(?:\.xml)?\/?$/i
];
const NON_ARTICLE_QUERY_KEYS = [
  'replytocom',
  'share',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content'
];

function decodeXmlText(value: string) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");
}

function parseSitemapUrls(xml: string) {
  const matches = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)];
  return matches.map((match) => decodeXmlText(match[1].trim()));
}

function parseRobotsSitemapUrls(text: string) {
  const matches = [...text.matchAll(/^sitemap:\s*(\S+)\s*$/gim)];
  return matches.map((match) => match[1].trim());
}

function parseFeedUrls(xml: string) {
  const rssLinks = [...xml.matchAll(/<link>\s*([^<]+?)\s*<\/link>/gi)].map((match) =>
    decodeXmlText(match[1].trim())
  );
  const atomLinks = [
    ...xml.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)
  ].map((match) => decodeXmlText(match[1].trim()));

  return [...rssLinks, ...atomLinks];
}

function parseHtmlLinks(html: string, baseUrl: string) {
  const matches = [...html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)];

  return matches
    .map((match) => normalizeUrl(match[1].trim(), baseUrl))
    .filter((url): url is string => !!url);
}

function normalizeUrl(url: string, baseUrl?: string) {
  try {
    const parsed = baseUrl ? new URL(url, baseUrl) : new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';

    parsed.hash = '';
    parsed.searchParams.sort();

    return parsed.href;
  } catch {
    return '';
  }
}

function isHttpUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function hasSameOrigin(url: string, originUrl: string) {
  try {
    return new URL(url).origin === new URL(originUrl).origin;
  } catch {
    return false;
  }
}

function isLikelySitemapUrl(url: string) {
  try {
    const { pathname } = new URL(url);
    return /sitemap/i.test(pathname) || /\.xml(\.gz)?$/i.test(pathname);
  } catch {
    return false;
  }
}

function isLikelyFeedUrl(url: string) {
  try {
    const { pathname } = new URL(url);
    return /(?:feed|rss|atom)/i.test(pathname);
  } catch {
    return false;
  }
}

function isLikelyRobotsUrl(url: string) {
  try {
    return /\/robots\.txt$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

function isLikelyHtmlUrl(url: string) {
  return !isLikelySitemapUrl(url) && !isLikelyFeedUrl(url) && !isLikelyRobotsUrl(url);
}

function isImportablePageUrl(url: string, originUrl: string) {
  if (!hasSameOrigin(url, originUrl)) return false;

  try {
    const { pathname, searchParams } = new URL(url);
    if (
      NON_ARTICLE_EXTENSIONS.test(pathname) ||
      NON_ARTICLE_PATH_PATTERNS.some((pattern) => pattern.test(pathname)) ||
      NON_ARTICLE_QUERY_KEYS.some((key) => searchParams.has(key))
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function getDiscoveryCandidates(url: string) {
  const candidates = [url];

  try {
    const parsed = new URL(url);
    if (isLikelyHtmlUrl(url)) {
      candidates.push(
        ...DISCOVERY_CANDIDATE_PATHS.map((path) => new URL(path, parsed.origin).href)
      );
    }
  } catch {
    return candidates;
  }

  return [...new Set(candidates)];
}

function getFetchErrorMessage(url: string, error: unknown) {
  const cause = error instanceof Error ? error.cause : undefined;
  const message =
    cause instanceof Error
      ? cause.message
      : error instanceof Error
        ? error.message
        : 'Unknown error';

  return `Failed to fetch URL directory entry ${url}: ${message}`;
}

async function fetchEntry(url: string) {
  await checkUrlSafety(url, 'entryUrl');

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT
      },
      signal: AbortSignal.timeout(15000)
    });
  } catch (error) {
    throw new Error(getFetchErrorMessage(url, error));
  }

  if (!response.ok) {
    throw new Error(`URL directory entry request failed: ${response.status} ${response.statusText}`);
  }

  return {
    finalUrl: response.url || url,
    contentType: response.headers.get('content-type') || '',
    text: await response.text()
  };
}

async function collectUrlDirectoryLinks({
  entryUrl,
  maxUrls,
  maxDiscoveryEntries = 30
}: {
  entryUrl: string;
  maxUrls: number;
  maxDiscoveryEntries?: number;
}) {
  const normalizedEntryUrl = normalizeUrl(entryUrl) || entryUrl;
  const queue = getDiscoveryCandidates(normalizedEntryUrl);
  const visitedEntries = new Set<string>();
  const urls = new Set<string>();
  let lastError: unknown;

  while (queue.length > 0 && visitedEntries.size < maxDiscoveryEntries && urls.size < maxUrls) {
    const currentEntryUrl = queue.shift();
    if (!currentEntryUrl || visitedEntries.has(currentEntryUrl)) continue;

    visitedEntries.add(currentEntryUrl);
    let entry: Awaited<ReturnType<typeof fetchEntry>>;
    try {
      entry = await fetchEntry(currentEntryUrl);
    } catch (error) {
      lastError = error;
      continue;
    }

    const text = entry.text;
    const normalizedCurrentUrl = normalizeUrl(entry.finalUrl) || currentEntryUrl;
    const isXmlLike = /xml|rss|atom/i.test(entry.contentType) || /^\s*</.test(text);

    if (isLikelyRobotsUrl(normalizedCurrentUrl)) {
      const sitemapUrls = parseRobotsSitemapUrls(text).filter(isHttpUrl);
      queue.push(...sitemapUrls);
      continue;
    }

    if (isXmlLike && /<sitemapindex[\s>]/i.test(text)) {
      const sitemapUrls = parseSitemapUrls(text).filter(isHttpUrl);
      queue.push(...sitemapUrls);
      continue;
    }

    if (isXmlLike && /<urlset[\s>]/i.test(text)) {
      const pageUrls = parseSitemapUrls(text).filter((url) =>
        isImportablePageUrl(url, normalizedEntryUrl)
      );
      for (const pageUrl of pageUrls) {
        urls.add(pageUrl);
        if (urls.size >= maxUrls) break;
      }
      continue;
    }

    if (isXmlLike && /<(rss|feed)\b/i.test(text)) {
      const feedUrls = parseFeedUrls(text).filter((url) =>
        isImportablePageUrl(url, normalizedEntryUrl)
      );
      for (const feedUrl of feedUrls) {
        urls.add(feedUrl);
        if (urls.size >= maxUrls) break;
      }
      continue;
    }

    if (/html/i.test(entry.contentType) || /<html[\s>]/i.test(text)) {
      const pageUrls = parseHtmlLinks(text, normalizedCurrentUrl).filter((url) =>
        isImportablePageUrl(url, normalizedEntryUrl)
      );
      for (const pageUrl of pageUrls) {
        urls.add(pageUrl);
        if (urls.size >= maxUrls) break;
      }
    }
  }

  if (urls.size === 0 && lastError) {
    throw lastError;
  }

  return [...urls].sort();
}

async function handler(
  req: ApiRequestProps<PreviewUrlDirectoryBodyType>
): Promise<PreviewUrlDirectoryResponseType> {
  const { datasetId, sitemapUrl, limit } = parseApiInput({
    req,
    bodySchema: PreviewUrlDirectoryBodySchema
  }).body;

  await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: WritePermissionVal
  });

  const urls = await collectUrlDirectoryLinks({
    entryUrl: sitemapUrl,
    maxUrls: MAX_PREVIEW_URLS
  });
  const previewUrls = limit > 0 ? urls.slice(0, limit) : urls;

  return PreviewUrlDirectoryResponseSchema.parse({
    total: urls.length,
    urls: previewUrls
  });
}

export default NextAPI(handler);
