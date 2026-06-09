import { describe, expect, it, vi } from 'vitest';
import {
  buildAiRecommendations,
  buildClassificationRecommendations,
  buildRuleRecommendations,
  extractJsonObject,
  type CollectionItem,
  type FolderItem
} from '@/service/core/dataset/collection/classification';

const folders: FolderItem[] = [
  { _id: 'folder-policy', name: '政策法规' },
  { _id: 'folder-product', name: '产品手册' }
];

const collections: CollectionItem[] = [
  {
    _id: 'collection-policy',
    name: '政策法规 劳动合同解读',
    rawLink: 'https://example.com/policy-regulation/labor-contract'
  },
  {
    _id: 'collection-product',
    name: '产品手册安装说明',
    parentId: 'folder-policy',
    externalFileUrl: 'https://example.com/docs/install'
  }
];

describe('collection classification utils', () => {
  it('builds rule recommendations from folder keywords and source text', () => {
    const list = buildRuleRecommendations({ folders, collections });

    expect(list).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          collectionId: 'collection-policy',
          recommendedParentId: 'folder-policy',
          recommendedParentName: '政策法规',
          method: 'rule'
        }),
        expect.objectContaining({
          collectionId: 'collection-product',
          recommendedParentId: 'folder-product',
          recommendedParentName: '产品手册',
          method: 'rule'
        })
      ])
    );
  });

  it('extracts JSON even when the model wraps it in a markdown fence', () => {
    expect(extractJsonObject('```json\n{"recommendations":[]}\n```')).toEqual({
      recommendations: []
    });
  });

  it('builds AI recommendations and filters hallucinated ids', async () => {
    const runLLM = vi.fn().mockResolvedValue(
      JSON.stringify({
        recommendations: [
          {
            collectionId: 'collection-policy',
            recommendedParentId: 'folder-policy',
            confidence: 0.88,
            reason: '资料主题是政策解读'
          },
          {
            collectionId: 'collection-missing',
            recommendedParentId: 'folder-policy',
            confidence: 0.9,
            reason: 'invalid collection'
          },
          {
            collectionId: 'collection-product',
            recommendedParentId: 'folder-missing',
            confidence: 0.9,
            reason: 'invalid folder'
          }
        ]
      })
    );

    const list = await buildAiRecommendations({ folders, collections, runLLM });

    expect(runLLM).toHaveBeenCalledTimes(1);
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual(
      expect.objectContaining({
        collectionId: 'collection-policy',
        recommendedParentId: 'folder-policy',
        confidence: 0.88,
        method: 'ai',
        reason: '资料主题是政策解读'
      })
    );
  });

  it('falls back to rule recommendations when AI fails', async () => {
    const runLLM = vi.fn().mockRejectedValue(new Error('model unavailable'));
    const onAiError = vi.fn();

    const list = await buildClassificationRecommendations({
      model: 'test-llm',
      folders,
      collections,
      runLLM,
      onAiError
    });

    expect(runLLM).toHaveBeenCalledTimes(1);
    expect(onAiError).toHaveBeenCalledTimes(1);
    expect(list.some((item) => item.method === 'rule')).toBe(true);
  });
});
