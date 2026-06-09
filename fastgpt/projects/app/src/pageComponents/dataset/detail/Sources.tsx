import React, { useMemo, useState } from 'react';
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
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyInput from '@/components/MyInput';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { getDatasetCollectionSources } from '@/web/core/dataset/api/collection';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { useContextSelector } from 'use-context-selector';
import { getCollectionIcon } from '@fastgpt/global/core/dataset/utils';
import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';
import { useRouter } from 'next/router';
import { TabEnum } from '@/pages/dataset/detail';

const Sources = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const datasetId = useContextSelector(DatasetPageContext, (v) => v.datasetId);
  const [searchText, setSearchText] = useState('');

  const params = useMemo(
    () => ({
      datasetId,
      searchText
    }),
    [datasetId, searchText]
  );

  const { data, ScrollData, total, isLoading } = useScrollPagination(
    getDatasetCollectionSources,
    {
      pageSize: 20,
      params,
      refreshDeps: [datasetId, searchText],
      EmptyTip: <EmptyTip text={'暂无内容来源'} />
    }
  );

  return (
    <MyBox isLoading={isLoading} h={'100%'} py={[2, 4]} overflow={'hidden'}>
      <Flex flexDirection={'column'} h={'100%'} px={[2, 6]}>
        <Flex alignItems={'center'} gap={3}>
          <MyInput
            flex={1}
            bg={'myGray.50'}
            placeholder={'搜索标题或来源 URL'}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
          <Box color={'myGray.500'} fontSize={'sm'} whiteSpace={'nowrap'}>
            共 {total} 条
          </Box>
        </Flex>

        <ScrollData mt={3} fontSize={'sm'} flex={'1 0 0'} h={0}>
          <TableContainer>
            <Table variant={'simple'} draggable={false}>
              <Thead draggable={false}>
                <Tr>
                  <Th py={4}>来源标题</Th>
                  <Th py={4}>来源</Th>
                  <Th py={4}>类型</Th>
                  <Th py={4}>数据</Th>
                  <Th py={4}>更新时间</Th>
                  <Th py={4}>操作</Th>
                </Tr>
              </Thead>
              <Tbody>
                {data.map((item) => {
                  const icon = getCollectionIcon({
                    type: item.type,
                    name: item.name,
                    sourceId: item.sourceUrl || item.fileId
                  });

                  return (
                    <Tr key={item._id}>
                      <Td maxW={'280px'}>
                        <Flex alignItems={'center'} gap={2}>
                          <MyIcon name={icon as any} w={'16px'} flexShrink={0} />
                          <Box className={'textEllipsis'}>{item.name}</Box>
                        </Flex>
                      </Td>
                      <Td maxW={'360px'}>
                        {item.sourceUrl ? (
                          <Link
                            href={item.sourceUrl}
                            target={'_blank'}
                            color={'primary.600'}
                            className={'textEllipsis'}
                            display={'block'}
                          >
                            {item.sourceUrl}
                          </Link>
                        ) : (
                          <Box color={'myGray.500'} className={'textEllipsis'}>
                            {item.fileId || item.externalFileId || '-'}
                          </Box>
                        )}
                      </Td>
                      <Td>
                        <MyTag colorSchema={'gray'}>{item.type}</MyTag>
                      </Td>
                      <Td>
                        {item.dataAmount}
                        {item.trainingAmount > 0 ? ` / 训练中 ${item.trainingAmount}` : ''}
                        {item.hasError ? ' / 异常' : ''}
                      </Td>
                      <Td whiteSpace={'nowrap'}>{formatTime2YMDHM(item.updateTime)}</Td>
                      <Td>
                        <Button
                          size={'sm'}
                          variant={'whiteBase'}
                          onClick={() =>
                            router.push({
                              query: {
                                datasetId,
                                currentTab: TabEnum.dataCard,
                                collectionId: item._id
                              }
                            })
                          }
                        >
                          查看
                        </Button>
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          </TableContainer>
        </ScrollData>
      </Flex>
    </MyBox>
  );
};

export default Sources;
