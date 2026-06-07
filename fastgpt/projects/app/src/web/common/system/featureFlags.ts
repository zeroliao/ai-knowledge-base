import type { FastGPTFeConfigsType } from '@fastgpt/global/common/system/types';

export const isTemplateMarketEnabled = (feConfigs?: FastGPTFeConfigsType) =>
  feConfigs?.show_template_market === true;

export const isSystemToolEnabled = (feConfigs?: FastGPTFeConfigsType) =>
  feConfigs?.show_system_tool === true;

export const isMcpServerEnabled = (feConfigs?: FastGPTFeConfigsType) =>
  feConfigs?.show_mcp_server === true;

export const isEvaluationEnabled = (feConfigs?: FastGPTFeConfigsType) =>
  feConfigs?.show_batch_eval === true;

export const isPayEnabled = (feConfigs?: FastGPTFeConfigsType) => feConfigs?.show_pay === true;

export const isCustomDomainEnabled = (feConfigs?: FastGPTFeConfigsType) =>
  feConfigs?.customDomain?.enable === true;

export const isAppStoreEnabled = (feConfigs?: FastGPTFeConfigsType) =>
  feConfigs?.show_appStore === true;

export const getUnavailableFeatureRedirect = (
  pathname: string,
  feConfigs?: FastGPTFeConfigsType
) => {
  if (pathname === '/price' || pathname === '/tools/price') {
    return isPayEnabled(feConfigs) ? undefined : '/account/info';
  }

  if (pathname === '/appStore') {
    return isAppStoreEnabled(feConfigs) ? undefined : '/dashboard/agent';
  }

  if (pathname.startsWith('/dashboard/templateMarket')) {
    return isTemplateMarketEnabled(feConfigs) ? undefined : '/dashboard/agent';
  }

  if (pathname.startsWith('/dashboard/systemTool')) {
    return isSystemToolEnabled(feConfigs) ? undefined : '/dashboard/tool';
  }

  if (pathname.startsWith('/dashboard/mcpServer')) {
    return isMcpServerEnabled(feConfigs) ? undefined : '/dashboard/tool';
  }

  if (pathname.startsWith('/dashboard/evaluation')) {
    return isEvaluationEnabled(feConfigs) ? undefined : '/dashboard/agent';
  }

  if (pathname.startsWith('/config/tool/marketplace')) {
    return '/config/tool';
  }

  if (pathname.startsWith('/account/bill')) {
    return isPayEnabled(feConfigs) ? undefined : '/account/info';
  }

  if (pathname.startsWith('/account/customDomain')) {
    return isCustomDomainEnabled(feConfigs) ? undefined : '/account/info';
  }

  if (pathname.startsWith('/account/promotion')) {
    return feConfigs?.show_promotion === true ? undefined : '/account/info';
  }

  return undefined;
};
