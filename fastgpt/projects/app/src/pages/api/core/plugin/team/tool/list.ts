import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import {
  type GetTeamSystemPluginListQueryType,
  type GetTeamPluginListResponseType
} from '@fastgpt/global/openapi/core/plugin/team/tool/dto';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { SystemToolRepo } from '@fastgpt/service/core/app/tool/systemTool/systemTool.repo';
import { getUserDetail } from '@fastgpt/service/support/user/controller';
import type { UserTagsType } from '@fastgpt/global/support/user/type';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import { splitCombineToolId } from '@fastgpt/global/core/app/tool/utils';

export type listQuery = GetTeamSystemPluginListQueryType;

export type listBody = {};

export type listResponse = GetTeamPluginListResponseType;

const hasMatchedUserTag = ({
  userTags,
  targetTags
}: {
  userTags: UserTagsType[];
  targetTags?: UserTagsType[] | null;
}) => {
  return !!targetTags?.some((tag) => userTags.includes(tag));
};

const isCommercialTool = (toolId: string) => {
  try {
    return splitCombineToolId(toolId).source === AppToolSourceEnum.commercial;
  } catch {
    return toolId.startsWith(`${AppToolSourceEnum.commercial}-`);
  }
};

async function handler(
  req: ApiRequestProps<listBody, listQuery>,
  res: ApiResponseType<any>
): Promise<listResponse> {
  const lang = getLocale(req);

  const { teamId, tmbId } = await authCert({ req, authToken: true });

  const systemToolRepo = SystemToolRepo.getInstance();
  const [tools, userDetail] = await Promise.all([
    systemToolRepo.getSystemToolList({
      op: 'or',
      sources: ['system', teamId],
      lang
    }),
    getUserDetail({ tmbId })
  ]);
  const userTags = userDetail.tags || [];

  return tools
    .filter((tool) => {
      if (isCommercialTool(tool.id)) return false;
      if (hasMatchedUserTag({ userTags, targetTags: tool.hideTags })) return false;
      return true;
    })
    .map((tool) => ({
      ...tool,
      isPromoted: hasMatchedUserTag({ userTags, targetTags: tool.promoteTags })
    }));
}

export default NextAPI(handler);
