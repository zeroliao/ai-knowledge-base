import React, { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Box, Button, Flex, HStack, Text, Textarea } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { DatasetImportContext } from '../Context';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { postPreviewGithubProjectCards } from '@/web/core/dataset/api/collection';
import Loading from '@fastgpt/web/components/common/MyLoading';

const DataProcess = dynamic(() => import('../commonProgress/DataProcess'), {
  loading: () => <Loading fixed={false} />
});
const Upload = dynamic(() => import('../commonProgress/Upload'));
const PreviewData = dynamic(() => import('../commonProgress/PreviewData'));

type GithubProjectCardsFormType = {
  urlsText: string;
};

const ICON = 'file/fill/txt';

const GithubProjectCards = () => {
  const activeStep = useContextSelector(DatasetImportContext, (v) => v.activeStep);

  return (
    <>
      {activeStep === 0 && <GithubProjectCardsImport />}
      {activeStep === 1 && <DataProcess />}
      {activeStep === 2 && <PreviewData />}
      {activeStep === 3 && <Upload />}
    </>
  );
};

export default React.memo(GithubProjectCards);

function parseUrls(value: string) {
  return value
    .split(/\r?\n|,|\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

const GithubProjectCardsImport = () => {
  const { t } = useTranslation();
  const datasetId = useContextSelector(DatasetPageContext, (v) => v.datasetId);
  const { goToNext, setSources } = useContextSelector(DatasetImportContext, (v) => v);

  const { register, handleSubmit, watch } = useForm<GithubProjectCardsFormType>({
    defaultValues: {
      urlsText: ''
    }
  });

  const urlsText = watch('urlsText') || '';
  const urls = useMemo(() => parseUrls(urlsText), [urlsText]);

  const { data, runAsync: previewGithubProjectCards, loading } = useRequest(
    async (form: GithubProjectCardsFormType) => {
      return postPreviewGithubProjectCards({
        datasetId,
        urls: parseUrls(form.urlsText)
      });
    },
    {
      manual: true
    }
  );

  const cards = data?.cards || [];

  return (
    <Box maxW={['100%', '900px']}>
      <Box display={['block', 'flex']} alignItems={'flex-start'} mt={1}>
        <Box flex={'0 0 120px'} fontSize={'sm'} pt={2}>
          GitHub 链接
        </Box>
        <Box flex={'1 0 0'}>
          <Textarea
            rows={8}
            bg={'myGray.50'}
            placeholder={'https://github.com/ChatGPTNextWeb/NextChat\nhttps://github.com/owner/repo/tree/main/path'}
            {...register('urlsText', {
              required: true
            })}
          />
          <Text mt={2} color={'myGray.500'} fontSize={'sm'}>
            支持 GitHub 仓库或目录链接，每行一个；会生成中文项目卡片，再作为文本导入当前知识库。
          </Text>
        </Box>
      </Box>

      <Flex mt={5} justifyContent={'flex-end'}>
        <Button
          isLoading={loading}
          isDisabled={urls.length === 0}
          onClick={handleSubmit(previewGithubProjectCards)}
        >
          生成预览
        </Button>
      </Flex>

      {data && (
        <Box mt={5} pl={[0, '120px']}>
          <Text fontSize={'sm'} color={'myGray.600'}>
            已生成 {cards.length} 张项目卡片
          </Text>
          <Box mt={3} maxH={'360px'} overflowY={'auto'}>
            {cards.map((card, i) => (
              <HStack
                key={`${card.sourceUrl}-${i}`}
                bg={'myGray.50'}
                p={3}
                borderRadius={'md'}
                _notLast={{ mb: 2 }}
                alignItems={'flex-start'}
              >
                <MyIcon name={ICON as any} w={'16px'} mt={0.5} />
                <Box flex={'1 0 0'} minW={0}>
                  <Text fontWeight={500} fontSize={'sm'}>
                    {card.name}
                  </Text>
                  <Text color={'myGray.600'} fontSize={'sm'}>
                    {card.category}
                  </Text>
                  <Text wordBreak={'break-all'} color={'myGray.500'} fontSize={'xs'}>
                    {card.sourceUrl}
                  </Text>
                </Box>
              </HStack>
            ))}
          </Box>

          <Flex mt={5} justifyContent={'flex-end'}>
            <Button
              isDisabled={cards.length === 0}
              onClick={() => {
                setSources(
                  cards.map((card) => ({
                    id: getNanoid(32),
                    createStatus: 'waiting',
                    rawText: card.text,
                    sourceName: `${card.name}.txt`,
                    icon: ICON,
                    metadata: {
                      source: 'github-project-card',
                      card_version: 'v2-high-signal',
                      owner: card.owner,
                      repo: card.repo,
                      sourceUrl: card.sourceUrl,
                      sourcePath: card.sourcePath
                    }
                  }))
                );
                goToNext();
              }}
            >
              {t('common:next_step')}
            </Button>
          </Flex>
        </Box>
      )}
    </Box>
  );
};
