import { GET } from '@/web/common/api/request';
import type { MarketSourceListResponseType } from '@fastgpt/global/core/market/source';

export const getMarketSources = () => GET<MarketSourceListResponseType>('/core/market/source/list');
