import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import {
  defaultMarketSources,
  type MarketSourceListResponseType
} from '@fastgpt/global/core/market/source';
import type { ApiRequestProps } from '@fastgpt/service/type/next';

async function handler(req: ApiRequestProps): Promise<MarketSourceListResponseType> {
  await authCert({ req, authToken: true });

  return defaultMarketSources.filter((source) => source.enabled);
}

export default NextAPI(handler);
