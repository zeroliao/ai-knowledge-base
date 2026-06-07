import React, { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Box, Button, Flex, HStack, Input, Link, Text } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { LinkCollectionIcon } from '@fastgpt/global/core/dataset/constants';
import { DatasetImportContext } from '../Context';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { postPreviewUrlDirectory } from '@/web/core/dataset/api/collection';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { getDocPath } from '@/web/common/system/doc';
import Loading from '@fastgpt/web/components/common/MyLoading';

const DataProcess = dynamic(() => import('../commonProgress/DataProcess'), {
  loading: () => <Loading fixed={false} />
});
const Upload = dynamic(() => import('../commonProgress/Upload'));
const PreviewData = dynamic(() => import('../commonProgress/PreviewData'));

type UrlDirectoryFormType = {
  sitemapUrl: string;
  limit: number;
};

const DEFAULT_ARTICLE_SELECTOR = [
  'article [itemprop="articleBody"]',
  'article .article-entry',
  'article .entry-content',
  'article .post-content',
  'article .article-content',
  'article .markdown-body',
  'main article',
  'article',
  'main'
].join(', ');

const UrlDirectory = () => {
  const activeStep = useContextSelector(DatasetImportContext, (v) => v.activeStep);

  return (
    <>
      {activeStep === 0 && <UrlDirectoryImport />}
      {activeStep === 1 && <DataProcess />}
      {activeStep === 2 && <PreviewData />}
      {activeStep === 3 && <Upload />}
    </>
  );
};

export default React.memo(UrlDirectory);

const UrlDirectoryImport = () => {
  const { t } = useTranslation();
  const datasetId = useContextSelector(DatasetPageContext, (v) => v.datasetId);
  const { feConfigs } = useSystemStore();
  const { goToNext, setSources, processParamsForm } = useContextSelector(
    DatasetImportContext,
    (v) => v
  );

  React.useEffect(() => {
    if (!processParamsForm.getValues('webSelector')) {
      processParamsForm.setValue('webSelector', DEFAULT_ARTICLE_SELECTOR);
    }
  }, [processParamsForm]);

  const { register, handleSubmit, watch } = useForm<UrlDirectoryFormType>({
    defaultValues: {
      sitemapUrl: '',
      limit: 50
    }
  });

  const watchedLimit = watch('limit');

  const { data, runAsync: previewUrlDirectory, loading } = useRequest(
    async (form: UrlDirectoryFormType) => {
      return postPreviewUrlDirectory({
        datasetId,
        sitemapUrl: form.sitemapUrl.trim(),
        limit: Number(form.limit || 0)
      });
    },
    {
      manual: true
    }
  );

  const previewUrls = useMemo(() => data?.urls || [], [data?.urls]);

  return (
    <Box maxW={['100%', '800px']}>
      <Box display={['block', 'flex']} alignItems={'center'} mt={1}>
        <Box flex={'0 0 120px'} fontSize={'sm'}>
          {t('common:core.dataset.import.URL directory entry URL')}
        </Box>
        <Input
          flex={'1 0 0'}
          bg={'myGray.50'}
          placeholder={'https://example.com/ or https://example.com/sitemap.xml'}
          {...register('sitemapUrl', {
            required: true
          })}
        />
      </Box>

      <Box display={['block', 'flex']} alignItems={'center'} mt={4}>
        <Box flex={'0 0 120px'} fontSize={'sm'}>
          {t('common:core.dataset.import.URL directory limit')}
        </Box>
        <Input
          flex={'1 0 0'}
          maxW={['100%', '180px']}
          type={'number'}
          min={0}
          bg={'myGray.50'}
          {...register('limit', {
            valueAsNumber: true,
            min: 0
          })}
        />
        <Text ml={[0, 3]} mt={[2, 0]} color={'myGray.500'} fontSize={'sm'}>
          {t('common:core.dataset.import.URL directory limit tip')}
        </Text>
      </Box>

      <Box display={['block', 'flex']} alignItems={'center'} mt={4}>
        <Box flex={'0 0 120px'} fontSize={'sm'}>
          {t('common:core.dataset.website.Selector')}
          <Box color={'myGray.500'} fontSize={'sm'}>
            {feConfigs?.docUrl && (
              <Link href={getDocPath('/guide/dataset/websync')} target="_blank">
                {t('common:core.dataset.website.Selector Course')}
              </Link>
            )}
          </Box>
        </Box>
        <Input
          flex={'1 0 0'}
          maxW={['100%', '350px']}
          {...processParamsForm.register('webSelector')}
          placeholder={'body .content #document'}
          bg={'myGray.50'}
        />
      </Box>

      <Flex mt={5} justifyContent={'flex-end'}>
        <Button isLoading={loading} onClick={handleSubmit(previewUrlDirectory)}>
          {t('common:core.dataset.import.Preview URLs')}
        </Button>
      </Flex>

      {data && (
        <Box mt={5} pl={[0, '120px']}>
          <Text fontSize={'sm'} color={'myGray.600'}>
            {t('common:core.dataset.import.URL directory preview result', {
              total: data.total,
              count: previewUrls.length
            })}
          </Text>
          <Box mt={3} maxH={'300px'} overflowY={'auto'}>
            {previewUrls.map((url, i) => (
              <HStack
                key={`${url}-${i}`}
                bg={'myGray.50'}
                p={3}
                borderRadius={'md'}
                _notLast={{ mb: 2 }}
                alignItems={'flex-start'}
              >
                <MyIcon name={LinkCollectionIcon} w={'16px'} mt={0.5} />
                <Box wordBreak={'break-all'} fontSize={'sm'}>
                  {url}
                </Box>
              </HStack>
            ))}
          </Box>

          <Flex mt={5} justifyContent={'flex-end'}>
            <Button
              isDisabled={previewUrls.length === 0}
              onClick={() => {
                setSources(
                  previewUrls.map((link) => ({
                    id: getNanoid(32),
                    createStatus: 'waiting',
                    link,
                    sourceName: link,
                    icon: LinkCollectionIcon
                  }))
                );
                goToNext();
              }}
            >
              {t('common:next_step')}
            </Button>
          </Flex>

          {Number(watchedLimit || 0) > 0 && data.total > previewUrls.length && (
            <Text mt={3} color={'myGray.500'} fontSize={'sm'} textAlign={'right'}>
              {t('common:core.dataset.import.URL directory limited warning')}
            </Text>
          )}
        </Box>
      )}
    </Box>
  );
};
