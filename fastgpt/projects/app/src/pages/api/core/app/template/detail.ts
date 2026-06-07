import type { NextApiRequest } from 'next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { NextAPI } from '@/service/middleware/entry';
import { getAppTemplatesAndLoadThem } from '@fastgpt/service/core/app/templates/register';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  GetAppTemplateDetailQuerySchema,
  GetAppTemplateDetailResponseSchema,
  type GetAppTemplateDetailResponseType
} from '@fastgpt/global/openapi/core/app/template/api';
import { type AppTemplateSchemaType } from '@fastgpt/global/core/app/type';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';

async function handler(req: NextApiRequest): Promise<GetAppTemplateDetailResponseType> {
  await authCert({ req, authToken: true });
  const { templateId } = parseApiInput({
    req,
    querySchema: GetAppTemplateDetailQuerySchema
  }).query;

  const templateMarketItems: AppTemplateSchemaType[] = await getAppTemplatesAndLoadThem();
  const template = templateMarketItems.find((item) => item.templateId === templateId);

  if (template?.templateId.startsWith(`${AppToolSourceEnum.commercial}-`)) {
    return Promise.reject('Template not found');
  }

  return GetAppTemplateDetailResponseSchema.parse(template);
}

export default NextAPI(handler);
