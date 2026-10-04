import {
  createInternalAddressChecker,
  PRIVATE_URL_TEXT
} from '@fastgpt/global/common/system/network';
import { serviceEnv } from '../../env';

const { isInternalAddress } = createInternalAddressChecker({
  checkInternalIp: () => serviceEnv.CHECK_INTERNAL_IP
});

// 外部资料导入必须在开发环境也拒绝内网目标；通用 isInternalAddress 为兼容本地开发服务保留了 dev 放行行为。
const { isInternalAddress: isStrictInternalAddress } = createInternalAddressChecker({
  checkInternalIp: () => true,
  nodeEnv: 'production'
});

export { isInternalAddress, PRIVATE_URL_TEXT };

/**
 * 用于"保存配置 URL"或"调用前校验"的统一安全检查:
 *  - 必须是合法 URL
 *  - 协议必须是 http/https
 *  - 不能指向内部地址(loopback/metadata,以及在 CHECK_INTERNAL_IP=true 时的私网)
 *
 * 注意:`isInternalAddress` 在 dev 环境直接放行;为了让保存入口
 * 在 dev 也能拒绝明显错误的 URL(localhost / metadata),
 * 这里**不依赖 isDevEnv**,而是用同一套规则做轻量校验。
 */
export const checkUrlSafety = async (url: string, fieldName = 'URL'): Promise<void> => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return Promise.reject(new Error(`${fieldName} must be a valid URL`));
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return Promise.reject(new Error(`${fieldName} must use http or https protocol`));
  }

  if (parsed.username || parsed.password) {
    return Promise.reject(new Error(`${fieldName} must not include credentials`));
  }

  if (await isStrictInternalAddress(url)) {
    return Promise.reject(new Error(`${fieldName}: ${PRIVATE_URL_TEXT}`));
  }
};

export type SafeFetchOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  headers?: HeadersInit;
};

export type SafeFetchResult = {
  response: Response;
  url: string;
  text: string;
};

/**
 * 抓取外部资料时手动处理跳转，并在每一跳重新执行 SSRF 校验。
 * 使用流式读取限制响应体，避免恶意站点通过超大 sitemap/HTML 消耗服务内存。
 */
export const fetchUrlSafely = async (
  inputUrl: string,
  {
    timeoutMs = 15_000,
    maxBytes = 2 * 1024 * 1024,
    maxRedirects = 3,
    headers
  }: SafeFetchOptions = {}
): Promise<SafeFetchResult> => {
  let currentUrl = inputUrl;

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
    await checkUrlSafety(currentUrl, 'URL');

    const response = await fetch(currentUrl, {
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs)
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error(`URL redirect missing location (${response.status})`);
      if (redirectCount >= maxRedirects) {
        throw new Error(`URL redirect limit exceeded (${maxRedirects})`);
      }
      currentUrl = new URL(location, currentUrl).href;
      continue;
    }

    if (!response.ok) {
      throw new Error(`URL request failed: ${response.status} ${response.statusText}`);
    }

    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > maxBytes) {
      throw new Error(`URL response exceeds ${maxBytes} bytes`);
    }

    if (!response.body) {
      return { response, url: currentUrl, text: '' };
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          await reader.cancel();
          throw new Error(`URL response exceeds ${maxBytes} bytes`);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    const buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
    return { response, url: currentUrl, text: buffer.toString('utf8') };
  }

  throw new Error(`URL redirect limit exceeded (${maxRedirects})`);
};
