import { Types } from '@fastgpt/service/common/mongo';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { getLLMModel } from '@fastgpt/service/core/ai/model';
import { createLLMResponse } from '@fastgpt/service/core/ai/llm/request';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import {
  RecommendCollectionClassificationsBodySchema,
  RecommendCollectionClassificationsResponseSchema,
  type RecommendCollectionClassificationsResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/api';
import { buildClassificationRecommendations } from '@/service/core/dataset/collection/classification';

const logger = getLogger(LogCategories.MODULE.DATASET.COLLECTION);

async function handler(
  req: ApiRequestProps
): Promise<RecommendCollectionClassificationsResponseType> {
  const { datasetId, limit } = parseApiInput({
    req,
    bodySchema: RecommendCollectionClassificationsBodySchema
  }).body;

  const { teamId, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: WritePermissionVal
  });

  const baseMatch = {
    teamId: new Types.ObjectId(teamId),
    datasetId: new Types.ObjectId(datasetId)
  };

  const [folders, collections] = await Promise.all([
    MongoDatasetCollection.find(
      {
        ...baseMatch,
        type: DatasetCollectionTypeEnum.folder
      },
      undefined,
      { ...readFromSecondary }
    )
      .select({ _id: 1, name: 1 })
      .sort({ updateTime: -1 })
      .lean(),
    MongoDatasetCollection.find(
      {
        ...baseMatch,
        type: { $ne: DatasetCollectionTypeEnum.folder }
      },
      undefined,
      { ...readFromSecondary }
    )
      .select({ _id: 1, name: 1, parentId: 1, rawLink: 1, externalFileUrl: 1 })
      .sort({ updateTime: -1 })
      .limit(limit)
      .lean()
  ]);

  const model = dataset?.agentModel ? getLLMModel(dataset.agentModel)?.model : undefined;
  const list = await buildClassificationRecommendations({
    model,
    folders,
    collections,
    runLLM: async (messages) => {
      const { answerText } = await createLLMResponse({
        body: {
          model: model!,
          messages,
          temperature: 0.1,
          max_tokens: 1800,
          stream: false
        },
        maxContinuations: 1
      });

      return answerText;
    },
    onAiError: (error) => {
      logger.warn('AI collection classification failed, fallback to rule', { error });
    }
  });

  return RecommendCollectionClassificationsResponseSchema.parse({
    list
  });
}

export default NextAPI(handler);
