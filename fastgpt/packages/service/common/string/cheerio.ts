import { type UrlFetchParams, type UrlFetchResponse } from '@fastgpt/global/common/file/api';
import * as cheerio from 'cheerio';
import { axios } from '../api/axios';
import { htmlToMarkdown } from './utils';
import { isInternalAddress } from '../system/utils';
import { getLogger, LogCategories } from '../logger';

const logger = getLogger(LogCategories.HTTP.ERROR);

const defaultContentSelectors = [
  'article',
  'main article',
  'main',
  '.post-content',
  '.entry-content',
  '.article-content',
  '.article-body',
  '.post-body',
  '.markdown-body'
];

const noiseSelectors = [
  'script',
  'style',
  'noscript',
  'nav',
  'header',
  'footer',
  'aside',
  'form',
  'button',
  'input',
  'select',
  'textarea',
  'canvas',
  'svg',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="complementary"]',
  '[role="contentinfo"]',
  '[aria-label*="导航"]',
  '[aria-label*="菜单"]',
  '[aria-label*="分享"]',
  '[aria-label*="广告"]',
  '.nav',
  '.navbar',
  '.menu',
  '.header',
  '.footer',
  '.sidebar',
  '.side-bar',
  '.breadcrumb',
  '.breadcrumbs',
  '.pagination',
  '.pager',
  '.post-nav',
  '.post-navigation',
  '.prev-next',
  '.related',
  '.recommend',
  '.recommended',
  '.share',
  '.social',
  '.ad',
  '.ads',
  '.advert',
  '.advertisement',
  '.banner',
  '.widget',
  '.comment',
  '.comments',
  '.toc'
];

const noisyShortTextPattern =
  /^(首页|主页|分类|目录|归档|标签|上一页|下一页|上一篇|下一篇|前一篇|后一篇|分享|分享到|相关推荐|相关文章|随机文章|返回顶部|登录|注册|搜索|广告|赞助|友情链接|评论|阅读更多|home|categories|tags|archives|previous|next|share|related posts?|read more)$/i;

const noisySectionHeadingPattern =
  /^(账号购买与充值|相关专辑|关注我不迷路|eSIM推荐|相关推荐|相关文章|推荐阅读|延伸阅读|广告|赞助|推广|福利推荐|友情链接|评论区?|share|related posts?|recommended|sponsored)$/i;

const normalizeNodeText = (text: string) => text.replace(/\s+/g, ' ').trim();

const findDefaultContentSelector = ($: cheerio.CheerioAPI) =>
  defaultContentSelectors.find((item) => $(item).text().trim().length > 0);

const removeSectionFromHeading = ($: cheerio.CheerioAPI, heading: cheerio.Element) => {
  const headingLevel = Number(heading.tagName.replace(/^h/i, ''));
  const nodesToRemove: cheerio.Element[] = [heading];

  let sibling = $(heading).next();
  while (sibling.length > 0) {
    const el = sibling.get(0);
    if (!el) break;

    if (/^h[1-6]$/i.test(el.tagName)) {
      const level = Number(el.tagName.replace(/^h/i, ''));
      if (level <= headingLevel) break;
    }

    nodesToRemove.push(el);
    sibling = sibling.next();
  }

  nodesToRemove.forEach((item) => $(item).remove());
};

const cleanWebPageDom = ($: cheerio.CheerioAPI, selectDom: cheerio.Cheerio<cheerio.AnyNode>) => {
  selectDom.find(noiseSelectors.join(',')).remove();

  selectDom.find('h1,h2,h3,h4,h5,h6').each((i, el) => {
    const text = normalizeNodeText($(el).text()).replace(/[：:|-].*$/, '');
    if (noisySectionHeadingPattern.test(text)) {
      removeSectionFromHeading($, el);
    }
  });

  selectDom
    .find('p,li,div')
    .filter((i, el) => {
      const text = normalizeNodeText($(el).text());
      const hasOnlyLinks = $(el).find('a').length > 0 && $(el).children().not('a').length === 0;

      return (
        text.length > 0 &&
        text.length <= 80 &&
        noisyShortTextPattern.test(text.replace(/[：:|-].*$/, '')) &&
        (hasOnlyLinks || $(el).find('a').length > 0)
      );
    })
    .remove();

  selectDom
    .find('a')
    .filter((i, el) => {
      const text = normalizeNodeText($(el).text());
      return text.length > 0 && text.length <= 30 && noisyShortTextPattern.test(text);
    })
    .remove();

  selectDom
    .find('*')
    .not('img,video,source,audio,iframe,br,hr')
    .filter((i, el) => normalizeNodeText($(el).text()) === '' && $(el).children().length === 0)
    .remove();
};

export const cheerioToHtml = ({
  fetchUrl,
  $,
  selector
}: {
  fetchUrl: string;
  $: cheerio.CheerioAPI;
  selector?: string;
}) => {
  // get origin url
  const originUrl = new URL(fetchUrl).origin;
  const protocol = new URL(fetchUrl).protocol; // http: or https:

  const selectorList = selector
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const matchedSelector = selectorList?.find((item) => $(item).length > 0);
  const usedSelector = matchedSelector || selector || findDefaultContentSelector($) || 'body';
  const selectDom = $(usedSelector);

  cleanWebPageDom($, selectDom);

  // remove i element
  selectDom.find('i').remove();

  // remove empty a element
  selectDom
    .find('a')
    .filter((i, el) => {
      return $(el).text().trim() === '' && $(el).children().length === 0;
    })
    .remove();

  // if link,img startWith /, add origin url
  selectDom.find('a').each((i, el) => {
    const href = $(el).attr('href');
    if (href) {
      if (href.startsWith('//')) {
        $(el).attr('href', protocol + href);
      } else if (href.startsWith('/')) {
        $(el).attr('href', originUrl + href);
      }
    }
  });
  selectDom.find('img, video, source, audio, iframe').each((i, el) => {
    const src = $(el).attr('src');
    if (src) {
      if (src.startsWith('//')) {
        $(el).attr('src', protocol + src);
      } else if (src.startsWith('/')) {
        $(el).attr('src', originUrl + src);
      }
    }
  });

  const html = selectDom
    .map((item, dom) => {
      return $(dom).html();
    })
    .get()
    .join('\n');

  const title = $('head title').text() || $('h1:first').text() || fetchUrl;

  return {
    html,
    title,
    usedSelector
  };
};
export const urlsFetch = async ({
  urlList,
  selector
}: UrlFetchParams): Promise<UrlFetchResponse> => {
  urlList = urlList.filter((url) => /^(http|https):\/\/[^ "]+$/.test(url));

  const response = await Promise.all(
    urlList.map(async (url) => {
      const isInternal = await isInternalAddress(url);
      if (isInternal) {
        return {
          url,
          title: '',
          content: 'Cannot fetch internal url',
          selector: ''
        };
      }

      try {
        const fetchRes = await axios.get(url, {
          timeout: 30000
        });

        const $ = cheerio.load(fetchRes.data);
        const { title, html, usedSelector } = cheerioToHtml({
          fetchUrl: url,
          $,
          selector
        });

        const md = await htmlToMarkdown(html);

        return {
          url,
          title,
          content: md,
          selector: usedSelector
        };
      } catch (error) {
        logger.warn('Failed to fetch url content', { url, error });

        return {
          url,
          title: '',
          content: '',
          selector: ''
        };
      }
    })
  );

  return response;
};

export const loadContentByCheerio = async (content: string) => cheerio.load(content);
