import { Types } from '@fastgpt/service/common/mongo';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { collectionTagsToTagLabel } from '@fastgpt/service/core/dataset/collection/utils';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  CollectionSourceListBodySchema,
  CollectionSourceListResponseSchema,
  type CollectionSourceListResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/api';

async function handler(req: ApiRequestProps): Promise<CollectionSourceListResponseType> {
  const {
    datasetId,
    searchText: rawSearchText,
    pageSize: rawPageSize,
    offset: rawOffset,
    pageNum: rawPageNum
  } = parseApiInput({ req, bodySchema: CollectionSourceListBodySchema }).body;

  const pageSize = Math.min(Number(rawPageSize ?? 20), 100);
  const offset =
    rawOffset !== undefined ? Number(rawOffset) : (Number(rawPageNum ?? 1) - 1) * pageSize;
  const searchText = rawSearchText?.replace(/'/g, '');

  const { teamId } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: ReadPermissionVal
  });

  const match = {
    teamId: new Types.ObjectId(teamId),
    datasetId: new Types.ObjectId(datasetId),
    type: { $ne: DatasetCollectionTypeEnum.folder },
    ...(searchText
      ? {
          $or: [
            { name: new RegExp(replaceRegChars(searchText), 'i') },
            { rawLink: new RegExp(replaceRegChars(searchText), 'i') },
            { externalFileUrl: new RegExp(replaceRegChars(searchText), 'i') }
          ]
        }
      : {})
  };

  const selectField = {
    _id: 1,
    parentId: 1,
    name: 1,
    type: 1,
    createTime: 1,
    updateTime: 1,
    fileId: 1,
    rawLink: 1,
    tags: 1,
    externalFileId: 1,
    externalFileUrl: 1
  };

  const [collections, total] = await Promise.all([
    MongoDatasetCollection.find(match, undefined, { ...readFromSecondary })
      .select(selectField)
      .sort({ updateTime: -1 })
      .skip(offset)
      .limit(pageSize)
      .lean(),
    MongoDatasetCollection.countDocuments(match, { ...readFromSecondary })
  ]);

  const collectionIds = collections.map((item) => new Types.ObjectId(item._id));

  const [trainingAmount, dataAmount] = await Promise.all([
    MongoDatasetTraining.aggregate(
      [
        {
          $match: {
            teamId: new Types.ObjectId(teamId),
            datasetId: new Types.ObjectId(datasetId),
            collectionId: { $in: collectionIds }
          }
        },
        {
          $group: {
            _id: '$collectionId',
            count: { $sum: 1 },
            hasError: { $max: { $cond: [{ $ifNull: ['$errorMsg', false] }, true, false] } }
          }
        }
      ],
      { ...readFromSecondary }
    ),
    MongoDatasetData.aggregate(
      [
        {
          $match: {
            teamId: new Types.ObjectId(teamId),
            datasetId: new Types.ObjectId(datasetId),
            collectionId: { $in: collectionIds }
          }
        },
        {
          $group: {
            _id: '$collectionId',
            count: { $sum: 1 }
          }
        }
      ],
      { ...readFromSecondary }
    )
  ]);

  const list = await Promise.all(
    collections.map(async (item) => ({
      ...item,
      sourceUrl: item.rawLink || item.externalFileUrl,
      tags: await collectionTagsToTagLabel({
        datasetId,
        tags: item.tags
      }),
      trainingAmount:
        trainingAmount.find((amount) => String(amount._id) === String(item._id))?.count || 0,
      dataAmount: dataAmount.find((amount) => String(amount._id) === String(item._id))?.count || 0,
      hasError: trainingAmount.find((amount) => String(amount._id) === String(item._id))?.hasError
    }))
  );

  return CollectionSourceListResponseSchema.parse({
    total,
    list
  });
}

export default NextAPI(handler);
