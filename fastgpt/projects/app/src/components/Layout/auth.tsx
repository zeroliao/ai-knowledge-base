import { useRouter } from 'next/router';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'next-i18next';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { getUnavailableFeatureRedirect } from '@/web/common/system/featureFlags';

const unAuthPage: { [key: string]: boolean } = {
  '/': true,
  '/login': true,
  '/login/provider': true,
  '/login/fastlogin': true,
  '/login/sso': true,
  '/appStore': true,
  '/chat': true,
  '/chat/share': true,
  '/tools/price': true,
  '/price': true
};

const Auth = ({ children }: { children: JSX.Element | React.ReactNode }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const { userInfo, initUserInfo } = useUserStore();
  const { feConfigs } = useSystemStore();
  const unavailableFeatureRedirect = getUnavailableFeatureRedirect(router.pathname, feConfigs);

  useQuery(
    [router.pathname],
    () => {
      if (unavailableFeatureRedirect) {
        router.replace(unavailableFeatureRedirect);
        return null;
      }

      if (unAuthPage[router.pathname] === true) {
        return null;
      } else {
        return initUserInfo();
      }
    },
    {
      refetchInterval: 10 * 60 * 1000,
      onError(error) {
        toast({
          status: 'warning',
          title: t('common:support.user.Need to login')
        });
      }
    }
  );

  return unavailableFeatureRedirect
    ? null
    : !!userInfo || unAuthPage[router.pathname] === true
      ? children
      : null;
};

export default Auth;
