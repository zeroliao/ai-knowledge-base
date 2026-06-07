import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import {
  GetTeamToolDetailQuerySchema,
  TeamToolDetailSchema,
  type GetTeamToolDetailQueryType,
  type GetTeamToolDetailResponseType
} from '@fastgpt/global/openapi/core/plugin/team/tool/dto';
import { SystemToolRepo } from '@fastgpt/service/core/app/tool/systemTool/systemTool.repo';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import { splitCombineToolId } from '@fastgpt/global/core/app/tool/utils';

export type detailQuery = GetTeamToolDetailQueryType;

export type detailBody = {};

export type detailResponse = GetTeamToolDetailResponseType;

async function handler(
  req: ApiRequestProps<detailBody, detailQuery>,
  res: ApiResponseType<any>
): Promise<detailResponse> {
  const { toolId, source, version } = GetTeamToolDetailQuerySchema.parse(req.query);
  const lang = getLocale(req);

  try {
    if (splitCombineToolId(toolId).source === AppToolSourceEnum.commercial) {
      return Promise.reject('Tool not found');
    }
  } catch {
    if (toolId.startsWith(`${AppToolSourceEnum.commercial}-`)) {
      return Promise.reject('Tool not found');
    }
  }

  const { teamId } = await authCert({ req, authToken: true });

  const systemToolRepo = SystemToolRepo.getInstance();

  const tool = await systemToolRepo.getSystemToolDetail({
    pluginId: toolId,
    lang,
    source: source === 'team' ? teamId : 'system',
    version
  });

  return TeamToolDetailSchema.parse(tool);
}

export default NextAPI(handler);
