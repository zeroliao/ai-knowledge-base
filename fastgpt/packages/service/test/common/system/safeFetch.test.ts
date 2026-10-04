import { afterEach, describe, expect, test, vi } from 'vitest';
import { checkUrlSafety, fetchUrlSafely } from '@fastgpt/service/common/system/utils';

describe('fetchUrlSafely', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('keeps import URL validation strict in development', async () => {
    await expect(checkUrlSafety('http://localhost:3000/health')).rejects.toThrow('private network');
    await expect(checkUrlSafety('http://10.0.0.1/private')).rejects.toThrow('private network');
  });

  test('re-checks every redirect target before requesting it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: 'http://127.0.0.1/private' }
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchUrlSafely('https://public.example/article', { maxRedirects: 3 })
    ).rejects.toThrow('private network');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('stops reading a response after the configured byte limit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('123456789', {
          status: 200,
          headers: { 'content-type': 'text/plain' }
        })
      )
    );

    await expect(fetchUrlSafely('https://public.example/article', { maxBytes: 4 })).rejects.toThrow(
      'exceeds 4 bytes'
    );
  });

  test('enforces the redirect count', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: 'https://public.example/next' }
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchUrlSafely('https://public.example/start', { maxRedirects: 1 })
    ).rejects.toThrow('redirect limit exceeded');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
