import React from 'react';
import {
  Box,
  Button,
  Flex,
  Link,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import {
  getCollectionClassificationRecommendations,
  putDatasetCollectionById
} from '@/web/core/dataset/api/collection';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { useContextSelector } from 'use-context-selector';

const Classification = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const datasetId = useContextSelector(DatasetPageContext, (v) => v.datasetId);

  const {
    data,
    loading,
    runAsync: reloadRecommendations
  } = useRequest(
    () =>
      getCollectionClassificationRecommendations({
        datasetId,
        limit: 100
      }),
    {
      manual: true,
      refreshDeps: [datasetId]
    }
  );

  const { runAsync: confirmMove, loading: isMoving } = useRequest(
    async ({
      collectionId,
      parentId
    }: {
      collectionId: string;
      parentId: string;
    }) => {
      await putDatasetCollectionById({
        id: collectionId,
        parentId
      });
      await reloadRecommendations();
    },
    {
      manual: true,
      onSuccess() {
        toast({
          title: '分类已确认',
          status: 'success'
        });
      },
      errorToast: '分类确认失败'
    }
  );

  const list = data?.list || [];

  return (
    <MyBox isLoading={loading} h={'100%'} py={[2, 4]} overflow={'hidden'}>
      <Flex flexDirection={'column'} h={'100%'} px={[2, 6]}>
        <Flex alignItems={'center'} justifyContent={'space-between'} gap={3}>
          <Box color={'myGray.600'} fontSize={'sm'}>
            优先使用知识库配置的 AI 模型推荐分类；模型不可用或无有效推荐时使用规则兜底。确认后会移动到对应目录。
          </Box>
          <Button variant={'whiteBase'} size={'sm'} onClick={reloadRecommendations}>
            {list.length > 0 ? '刷新推荐' : '生成推荐'}
          </Button>
        </Flex>

        <TableContainer mt={3} overflowY={'auto'} fontSize={'sm'} flex={'1 0 0'} h={0}>
          <Table variant={'simple'} draggable={false}>
            <Thead draggable={false}>
              <Tr>
                <Th py={4}>资料</Th>
                <Th py={4}>推荐分类</Th>
                <Th py={4}>方式</Th>
                <Th py={4}>置信度</Th>
                <Th py={4}>原因</Th>
                <Th py={4}>操作</Th>
              </Tr>
            </Thead>
            <Tbody>
              {list.map((item) => (
                <Tr key={`${item.collectionId}-${item.recommendedParentId}`}>
                  <Td maxW={'320px'}>
                    <Box className={'textEllipsis'}>{item.collectionName}</Box>
                    {item.sourceUrl && (
                      <Link
                        href={item.sourceUrl}
                        target={'_blank'}
                        color={'primary.600'}
                        fontSize={'xs'}
                        className={'textEllipsis'}
                        display={'block'}
                      >
                        {item.sourceUrl}
                      </Link>
                    )}
                  </Td>
                  <Td>{item.recommendedParentName}</Td>
                  <Td>
                    <MyTag colorSchema={item.method === 'ai' ? 'blue' : 'gray'}>
                      {item.method === 'ai' ? 'AI' : '规则'}
                    </MyTag>
                  </Td>
                  <Td>
                    <MyTag colorSchema={item.confidence >= 0.75 ? 'green' : 'gray'}>
                      {Math.round(item.confidence * 100)}%
                    </MyTag>
                  </Td>
                  <Td maxW={'320px'}>
                    <Box className={'textEllipsis'}>{item.reason}</Box>
                  </Td>
                  <Td>
                    <Button
                      size={'sm'}
                      isLoading={isMoving}
                      onClick={() =>
                        confirmMove({
                          collectionId: item.collectionId,
                          parentId: item.recommendedParentId
                        })
                      }
                    >
                      确认移动
                    </Button>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          {list.length === 0 && !loading && <EmptyTip text={'点击生成推荐后查看可分类资料'} />}
        </TableContainer>
      </Flex>
    </MyBox>
  );
};

export default Classification;
