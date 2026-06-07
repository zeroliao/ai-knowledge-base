import { Box, Button, Flex, ModalBody, ModalFooter, SimpleGrid } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getMarketSources } from '@/web/core/market/api';
import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import type { MarketSourceListItemType } from '@fastgpt/global/core/market/source';
import { useRouter } from 'next/router';

const modeLabelMap: Record<MarketSourceListItemType['installMode'], string> = {
  'built-in': '内置',
  'direct-import': '直接导入',
  'manual-url': 'URL 导入',
  'manual-package': '插件包导入',
  reference: '参考源'
};

const capabilityLabelMap: Record<MarketSourceListItemType['capabilities'][number], string> = {
  tool: '工具',
  workflow: '工作流',
  template: '模板',
  mcp: 'MCP',
  openapi: 'OpenAPI',
  prompt: '提示词'
};

const SourceCard = ({
  source,
  onImportResource
}: {
  source: MarketSourceListItemType;
  onImportResource: () => void;
}) => {
  const { copyData } = useCopyData();
  const router = useRouter();

  const openHomepage = () => {
    if (source.homepage.startsWith('/')) {
      window.location.href = source.homepage;
      return;
    }
    window.open(source.homepage, '_blank', 'noopener,noreferrer');
  };

  const openRoute = () => {
    if (!source.route) return;
    if (source.id === 'fastgpt-local-plugin') {
      onImportResource();
      return;
    }
    router.push(source.route);
  };

  return (
    <Flex
      flexDirection={'column'}
      border={'1px solid'}
      borderColor={'myGray.200'}
      borderRadius={'md'}
      bg={'white'}
      p={4}
      minH={'250px'}
    >
      <Flex alignItems={'flex-start'} gap={3}>
        <Flex
          alignItems={'center'}
          justifyContent={'center'}
          flex={'0 0 36px'}
          h={'36px'}
          borderRadius={'md'}
          bg={'primary.50'}
          color={'primary.600'}
        >
          <MyIcon name={'common/toolkit'} w={'18px'} />
        </Flex>
        <Box flex={1} minW={0}>
          <Box fontWeight={'semibold'} color={'myGray.900'} wordBreak={'break-word'}>
            {source.name}
          </Box>
          <Box mt={1} color={'myGray.500'} fontSize={'xs'} wordBreak={'break-word'}>
            {modeLabelMap[source.installMode]}
          </Box>
        </Box>
      </Flex>

      <Box mt={3} color={'myGray.600'} fontSize={'sm'} lineHeight={'1.6'}>
        {source.description}
      </Box>

      <Flex mt={3} flexWrap={'wrap'} gap={2}>
        {source.capabilities.map((item) => (
          <Box
            key={item}
            px={2}
            py={1}
            borderRadius={'sm'}
            bg={'myGray.50'}
            color={'myGray.700'}
            fontSize={'xs'}
          >
            {capabilityLabelMap[item]}
          </Box>
        ))}
      </Flex>

      <Box mt={3} color={'myGray.700'} fontSize={'sm'} lineHeight={'1.6'} flex={1}>
        {source.usage}
      </Box>

      {source.requiresManualConfig && (
        <Box mt={2} color={'orange.600'} fontSize={'xs'}>
          Requires manual endpoint, schema, auth, or workflow configuration.
        </Box>
      )}

      <Flex mt={4} gap={2} flexWrap={'wrap'}>
        {source.route && (
          <Button size={'sm'} variant={'primary'} onClick={openRoute}>
            {source.actionLabel || 'Use'}
          </Button>
        )}
        <Button size={'sm'} variant={'whiteBase'} onClick={openHomepage}>
          打开来源
        </Button>
        <Button size={'sm'} variant={'whiteBase'} onClick={() => copyData(source.homepage)}>
          复制 URL
        </Button>
      </Flex>
    </Flex>
  );
};

const MarketSourceModal = ({
  onClose,
  onImportResource
}: {
  onClose: () => void;
  onImportResource: () => void;
}) => {
  const { data: sources = [], loading } = useRequest(getMarketSources, {
    manual: false
  });

  return (
    <MyModal
      isOpen
      isLoading={loading}
      title={'市场源'}
      iconSrc={'common/toolkit'}
      iconColor={'primary.600'}
      onClose={onClose}
      maxW={['92vw', '980px']}
      w={'980px'}
    >
      <ModalBody px={[4, 8]} py={6}>
        <Box color={'myGray.600'} fontSize={'sm'} lineHeight={'1.7'}>
          这些市场源已为当前私有部署初始化。MCP 和 OpenAPI 来源可以通过 FastGPT 现有创建流程使用；
          模板类来源当前作为参考源，后续实现专用适配器后再支持自动转换。
        </Box>

        <SimpleGrid mt={5} columns={[1, 1, 2]} spacing={4}>
          {sources.map((source) => (
            <SourceCard key={source.id} source={source} onImportResource={onImportResource} />
          ))}
        </SimpleGrid>
      </ModalBody>
      <ModalFooter>
        <Button onClick={onClose}>关闭</Button>
      </ModalFooter>
    </MyModal>
  );
};

export default MarketSourceModal;
