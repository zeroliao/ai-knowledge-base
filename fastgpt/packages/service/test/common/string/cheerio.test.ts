import { describe, expect, it } from 'vitest';
import * as cheerio from 'cheerio';
import { cheerioToHtml } from '@fastgpt/service/common/string/cheerio';

describe('cheerioToHtml', () => {
  it('prefers article content and removes page chrome from imported web pages', () => {
    const $ = cheerio.load(`
      <html>
        <head><title>Site title</title></head>
        <body>
          <header><a href="/">首页</a></header>
          <main>
            <article>
              <h1>Real article title</h1>
              <p>Real article paragraph.</p>
              <aside>Sidebar recommendation</aside>
              <div class="share"><a href="/share">分享</a></div>
              <div class="post-nav"><a href="/prev">上一篇</a><a href="/next">下一篇</a></div>
              <div class="ad">Advertisement</div>
            </article>
          </main>
          <footer>Footer links</footer>
        </body>
      </html>
    `);

    const { html, title, usedSelector } = cheerioToHtml({
      fetchUrl: 'https://example.com/post/1',
      $
    });

    expect(title).toBe('Site title');
    expect(usedSelector).toBe('article');
    expect(html).toContain('Real article title');
    expect(html).toContain('Real article paragraph.');
    expect(html).not.toContain('Sidebar recommendation');
    expect(html).not.toContain('上一篇');
    expect(html).not.toContain('下一篇');
    expect(html).not.toContain('Advertisement');
    expect(html).not.toContain('Footer links');
  });

  it('keeps explicit selector behavior while still cleaning noisy blocks', () => {
    const $ = cheerio.load(`
      <body>
        <article>Wrong article</article>
        <section class="content">
          <p>Selected content.</p>
          <aside>Sidebar should be removed</aside>
          <a href="/category">分类</a>
        </section>
      </body>
    `);

    const { html, usedSelector } = cheerioToHtml({
      fetchUrl: 'https://example.com/post/2',
      $,
      selector: '.content'
    });

    expect(usedSelector).toBe('.content');
    expect(html).toContain('Selected content.');
    expect(html).not.toContain('Wrong article');
    expect(html).not.toContain('Sidebar should be removed');
    expect(html).not.toContain('分类');
  });

  it('keeps article media nodes while removing empty noise nodes', () => {
    const $ = cheerio.load(`
      <article>
        <h1>Article with image</h1>
        <p></p>
        <img src="/image.png" alt="image" />
        <video src="/video.mp4"></video>
      </article>
    `);

    const { html } = cheerioToHtml({
      fetchUrl: 'https://example.com/post/3',
      $
    });

    expect(html).toContain('https://example.com/image.png');
    expect(html).toContain('https://example.com/video.mp4');
    expect(html).not.toContain('<p></p>');
  });

  it('removes noisy promotional sections inside article content', () => {
    const $ = cheerio.load(`
      <article>
        <h1>Useful article</h1>
        <p>Main content should stay.</p>
        <h2>账号购买与充值</h2>
        <p>Promotion link should be removed.</p>
        <h2>相关专辑</h2>
        <ul><li>Playlist link should be removed.</li></ul>
        <h2>Next real section</h2>
        <p>Another useful paragraph.</p>
      </article>
    `);

    const { html } = cheerioToHtml({
      fetchUrl: 'https://example.com/post/4',
      $
    });

    expect(html).toContain('Main content should stay.');
    expect(html).toContain('Next real section');
    expect(html).toContain('Another useful paragraph.');
    expect(html).not.toContain('账号购买与充值');
    expect(html).not.toContain('Promotion link should be removed.');
    expect(html).not.toContain('相关专辑');
    expect(html).not.toContain('Playlist link should be removed.');
  });

  it('removes common archive, sidebar and recommendation blocks from article content', () => {
    const $ = cheerio.load(`
      <article>
        <h1>Useful article</h1>
        <p>Main content should stay.</p>
        <div class="related-posts">Related post link should be removed.</div>
        <div class="popular-posts">Popular post link should be removed.</div>
        <div class="archive">Archive link should be removed.</div>
        <div id="sidebar-right">Sidebar link should be removed.</div>
        <div class="sponsored">Sponsored link should be removed.</div>
      </article>
    `);

    const { html } = cheerioToHtml({
      fetchUrl: 'https://example.com/post/5',
      $
    });

    expect(html).toContain('Main content should stay.');
    expect(html).not.toContain('Related post link should be removed.');
    expect(html).not.toContain('Popular post link should be removed.');
    expect(html).not.toContain('Archive link should be removed.');
    expect(html).not.toContain('Sidebar link should be removed.');
    expect(html).not.toContain('Sponsored link should be removed.');
  });
});
