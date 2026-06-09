import { Types } from '@fastgpt/service/common/mongo';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';
import type { CollectionClassificationRecommendationType } from '@fastgpt/global/openapi/core/dataset/collection/api';

export const AI_CLASSIFICATION_LIMIT = 30;

type IdLike = string | Types.ObjectId;

export type FolderItem = {
  _id: IdLike;
  name: string;
};

export type CollectionItem = {
  _id: IdLike;
  name: string;
  parentId?: IdLike | null;
  rawLink?: string;
  externalFileUrl?: string;
};

type AiRecommendationItem = {
  collectionId?: unknown;
  recommendedParentId?: unknown;
  confidence?: unknown;
  reason?: unknown;
};

type RunLLM = (messages: ChatCompletionMessageParam[]) => Promise<string>;

const splitText = (text: string) =>
  Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .split(/[^\p{L}\p{N}]+/u)
        .map((item) => item.trim())
        .filter((item) => item.length >= 2)
    )
  );

const scoreFolder = ({
  folderName,
  collectionText
}: {
  folderName: string;
  collectionText: string;
}) => {
  const folderTokens = splitText(folderName);
  const collectionTokens = splitText(collectionText);
  const normalizedFolder = folderName.toLowerCase();
  const normalizedCollection = collectionText.toLowerCase();

  let score = 0;
  const matched: string[] = [];

  if (normalizedCollection.includes(normalizedFolder) && normalizedFolder.length >= 2) {
    score += 4;
    matched.push(folderName);
  }

  for (const token of folderTokens) {
    if (collectionTokens.includes(token) || normalizedCollection.includes(token)) {
      score += token.length >= 4 ? 2 : 1;
      matched.push(token);
    }
  }

  return {
    score,
    matched: Array.from(new Set(matched))
  };
};

const getCollectionSourceUrl = (collection: CollectionItem) =>
  collection.rawLink || collection.externalFileUrl;

export const buildRuleRecommendations = ({
  folders,
  collections
}: {
  folders: FolderItem[];
  collections: CollectionItem[];
}): CollectionClassificationRecommendationType[] =>
  collections
    .map((collection) => {
      const collectionText = [collection.name, collection.rawLink, collection.externalFileUrl]
        .filter(Boolean)
        .join(' ');

      const best = folders
        .filter((folder) => String(folder._id) !== String(collection.parentId))
        .map((folder) => ({
          folder,
          ...scoreFolder({
            folderName: folder.name,
            collectionText
          })
        }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)[0];

      if (!best) return;

      return {
        collectionId: String(collection._id),
        collectionName: collection.name,
        sourceUrl: getCollectionSourceUrl(collection),
        currentParentId: collection.parentId ? String(collection.parentId) : null,
        recommendedParentId: String(best.folder._id),
        recommendedParentName: best.folder.name,
        confidence: Math.min(0.95, 0.45 + best.score * 0.1),
        method: 'rule' as const,
        reason: best.matched.length
          ? `命中目录关键词：${best.matched.join('、')}`
          : `资料标题和目录「${best.folder.name}」相关`
      };
    })
    .filter(Boolean) as CollectionClassificationRecommendationType[];

export const extractJsonObject = (text: string) => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const raw = fenced || text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');

  if (start < 0 || end < start) {
    throw new Error('AI classification response is not JSON');
  }

  return JSON.parse(raw.slice(start, end + 1));
};

export const buildAiMessages = ({
  folders,
  collections
}: {
  folders: FolderItem[];
  collections: CollectionItem[];
}): ChatCompletionMessageParam[] => [
  {
    role: 'system',
    content:
      '你是知识库资料分类助手。请根据资料标题、来源 URL 和目录名称，把资料推荐移动到最合适的已有目录。只能使用输入中给出的 folder id 和 collection id。只输出 JSON，不要输出解释性文本。'
  },
  {
    role: 'user',
    content: JSON.stringify({
      outputSchema: {
        recommendations: [
          {
            collectionId: 'collection id',
            recommendedParentId: 'folder id',
            confidence: '0-1 number',
            reason: 'short Chinese reason'
          }
        ]
      },
      folders: folders.map((folder) => ({
        id: String(folder._id),
        name: folder.name
      })),
      collections: collections.map((collection) => ({
        id: String(collection._id),
        name: collection.name,
        sourceUrl: getCollectionSourceUrl(collection),
        currentParentId: collection.parentId ? String(collection.parentId) : null
      }))
    })
  }
];

export const buildAiRecommendations = async ({
  folders,
  collections,
  runLLM
}: {
  folders: FolderItem[];
  collections: CollectionItem[];
  runLLM: RunLLM;
}): Promise<CollectionClassificationRecommendationType[]> => {
  const folderMap = new Map(folders.map((folder) => [String(folder._id), folder]));
  const collectionMap = new Map(collections.map((collection) => [String(collection._id), collection]));
  const answerText = await runLLM(buildAiMessages({ folders, collections }));
  const parsed = extractJsonObject(answerText);
  const recommendations = Array.isArray(parsed?.recommendations) ? parsed.recommendations : [];

  return recommendations
    .map((item: AiRecommendationItem) => {
      const collection = collectionMap.get(String(item?.collectionId));
      const folder = folderMap.get(String(item?.recommendedParentId));
      const confidence = Number(item?.confidence);

      if (!collection || !folder) return;
      if (String(collection.parentId) === String(folder._id)) return;
      if (!Number.isFinite(confidence) || confidence <= 0) return;

      return {
        collectionId: String(collection._id),
        collectionName: collection.name,
        sourceUrl: getCollectionSourceUrl(collection),
        currentParentId: collection.parentId ? String(collection.parentId) : null,
        recommendedParentId: String(folder._id),
        recommendedParentName: folder.name,
        confidence: Math.max(0, Math.min(1, confidence)),
        method: 'ai' as const,
        reason:
          typeof item?.reason === 'string' && item.reason.trim()
            ? item.reason.trim().slice(0, 120)
            : `AI 判断资料与目录「${folder.name}」更相关`
      };
    })
    .filter(Boolean) as CollectionClassificationRecommendationType[];
};

export const buildClassificationRecommendations = async ({
  model,
  folders,
  collections,
  runLLM,
  onAiError
}: {
  model?: string;
  folders: FolderItem[];
  collections: CollectionItem[];
  runLLM?: RunLLM;
  onAiError?: (error: unknown) => void;
}): Promise<CollectionClassificationRecommendationType[]> => {
  if (model && runLLM && folders.length > 0 && collections.length > 0) {
    try {
      const aiList = await buildAiRecommendations({
        folders,
        collections: collections.slice(0, AI_CLASSIFICATION_LIMIT),
        runLLM
      });

      if (aiList.length > 0) return aiList;
    } catch (error) {
      onAiError?.(error);
    }
  }

  return buildRuleRecommendations({ folders, collections });
};
