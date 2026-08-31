/* global dxplay */
(() => {
  'use strict';

  const DEFAULT_SITE = 'https://123.666291.xyz';
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
    + 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
  let sourceKey = '';
  let sourceHeaders = {};
  let baseUrl = '';

  const text = value => value === undefined || value === null ? '' : String(value);
  const decodeEntities = value => text(value)
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
  const absoluteUrl = value => {
    const candidate = decodeEntities(value).trim();
    if (!candidate) return '';
    if (/^https?:\/\//i.test(candidate)) return candidate;
    return baseUrl + (candidate.startsWith('/') ? candidate : '/' + candidate);
  };
  const request = async (url, method) => {
    const response = await dxplay.fetch({
      url,
      method: method || 'GET',
      headers: Object.assign({'User-Agent': USER_AGENT, Referer: baseUrl + '/'}, sourceHeaders),
    });
    if (response.status < 200 || response.status >= 400) throw new Error('panweb.request-failed');
    return response;
  };
  const fragmentStarts = (body, className, limit) => {
    const escaped = className.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const pattern = new RegExp('<div[^>]*class=["\'][^"\']*\\b'
      + escaped + '\\b(?!-)[^"\']*["\'][^>]*>', 'gi');
    const starts = [];
    let match;
    while ((match = pattern.exec(body)) !== null && starts.length < limit + 1) starts.push(match.index);
    return starts;
  };
  const fragments = (body, className, limit) => {
    const starts = fragmentStarts(body, className, limit);
    const values = [];
    for (let index = 0; index < starts.length && values.length < limit; index += 1) {
      values.push(body.slice(starts[index], starts[index + 1] || body.length));
    }
    return values;
  };
  const posterUrl = value => {
    const candidate = decodeEntities(value);
    const nested = candidate.lastIndexOf('http');
    return absoluteUrl(nested >= 0 ? candidate.slice(nested) : candidate);
  };
  const card = block => {
    const anchor = /<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/i.exec(block);
    const href = anchor && anchor[1];
    if (!href) return null;
    const title = /\btitle=["']([^"']+)["']/i.exec(anchor[0]);
    const image = /<img\b[^>]*>/i.exec(block);
    const imageSource = image && /\b(?:data-src|data-original|src)=["']([^"']+)/i.exec(image[0]);
    const poster = posterUrl(imageSource && imageSource[1]);
    const name = plainText(title && title[1]);
    const remark = matchContent(block, 'module-item-text', 'div')
      || matchContent(block, 'video-serial', 'a');
    return {
      id: absoluteUrl(href),
      sourceKey,
      name: name || '\u7f51\u76d8\u8d44\u6e90',
      ...(poster ? {poster} : {}),
      ...(remark ? {remark} : {}),
    };
  };
  const cards = (body, className, limit) => fragments(body, className, limit).map(block => {
    try { return card(block); } catch (_error) { return null; }
  }).filter(Boolean);
  const categories = body => {
    const pattern = /<span[^>]*class=["'][^"']*module-tab-item[^"']*["'][^>]*>/gi;
    const values = [];
    let match;
    while ((match = pattern.exec(body)) !== null && values.length < 7) {
      const idMatch = /\bdata-id=["']([^"']+)/i.exec(match[0]);
      const nameMatch = /\bdata-name=["']([^"']+)/i.exec(match[0]);
      const id = text(idMatch && idMatch[1]).trim();
      const name = plainText(nameMatch && nameMatch[1]);
      if (id && id !== '0' && name && !name.includes('115')) values.push({id, name});
    }
    if (values.length === 0) {
      const seen = {};
      const links = /<a\b[^>]*\bhref=["'][^"']*\/vod\/type\/id\/(\d+)\.html["'][^>]*>([\s\S]*?)<\/a>/gi;
      while ((match = links.exec(body)) !== null && values.length < 12) {
        const id = text(match[1]).trim();
        const name = plainText(match[2]).replace(/^更多/, '');
        if (!id || !name || seen[id] || name.includes('115')) continue;
        seen[id] = true;
        values.push({id, name});
      }
    }
    return values;
  };
  const shareTarget = raw => {
    const value = decodeEntities(raw).trim();
    const urlMatch = /https?:\/\/[^\s<>"']+/i.exec(value);
    if (!urlMatch) return null;
    let url = urlMatch[0].replace(/[，,。；;]+$/, '');
    const codeMatch = /(?:\u63d0\u53d6\u7801|\u8bbf\u95ee\u7801)[\s\uff1a:]*([A-Za-z0-9]+)/i.exec(value);
    const queryCode = /[?&](?:pwd|code)=([^&#\s]+)/i.exec(url);
    let accessCode = codeMatch && codeMatch[1] || queryCode && queryCode[1] || '';
    try { accessCode = decodeURIComponent(accessCode); } catch (_error) {}
    return {url, accessCode};
  };
  const providerName = url => {
    if (/pan\.baidu\.com/i.test(url)) return '\u767e\u5ea6\u7f51\u76d8';
    if (/pan\.quark\.cn/i.test(url)) return '\u5938\u514b\u7f51\u76d8';
    if (/aliyundrive\.com|alipan\.com/i.test(url)) return '\u963f\u91cc\u4e91\u76d8';
    if (/drive\.uc\.cn/i.test(url)) return 'UC\u7f51\u76d8';
    if (/123(?:pan|[a-z0-9]{3})\.(?:com|cn)/i.test(url)) return '123\u4e91\u76d8';
    if (/cloud\.189\./i.test(url)) return '\u5929\u7ffc\u4e91\u76d8';
    if (/pan\.xunlei\.com/i.test(url)) return '\u8fc5\u96f7\u4e91\u76d8';
    return '\u7f51\u76d8';
  };
  const plainText = value => decodeEntities(text(value).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
  const matchContent = (body, className, tag) => {
    const pattern = new RegExp('<' + tag + '[^>]*class=["\'][^"\']*\\b' + className
      + '\\b[^"\']*["\'][^>]*>([\\s\\S]*?)<\\/' + tag + '>', 'i');
    const match = pattern.exec(body);
    return match ? plainText(match[1]) : '';
  };
  const detailPoster = body => {
    const start = body.search(/<[^>]*class=["'][^"']*\bmodule-item-pic\b[^"']*["'][^>]*>/i);
    const area = start >= 0 ? body.slice(start, start + 4000) : body;
    const tag = /<img\b[^>]*>/i.exec(area);
    if (!tag) return '';
    const source = /\b(?:data-src|data-original|src)=["']([^"']+)/i.exec(tag[0]);
    return posterUrl(source && source[1]);
  };

  dxplay.register({
    id: 'org.dxsrc.jsm.pan-web-share',
    name: 'Pan Web Share',
    description: 'Semantic rewrite of the shared jsm.json PanWebShare catalog family.',
    version: '1.0.0',
    protocol: 'catalog@1',

    async init(input) {
      sourceKey = text(input.sourceKey);
      sourceHeaders = input.headers && typeof input.headers === 'object' ? input.headers : {};
      const extension = input.extension && typeof input.extension === 'object' ? input.extension : {};
      const candidates = Array.isArray(extension.site) ? extension.site : [DEFAULT_SITE];
      if (!sourceKey) throw new Error('panweb.source-key-missing');
      for (const candidate of candidates) {
        const normalized = text(candidate).replace(/\/$/, '');
        if (!/^https?:\/\//i.test(normalized)) continue;
        try {
          baseUrl = normalized;
          await request(baseUrl, 'HEAD');
          return {ready: true};
        } catch (_error) {}
      }
      baseUrl = '';
      throw new Error('panweb.site-unavailable');
    },
    async home() {
      const body = (await request(baseUrl)).body;
      return {categories: categories(body), featured: cards(body, 'module-item', 20)};
    },
    async category(input) {
      const page = Number(input.page) || 1;
      const filters = input.filters && typeof input.filters === 'object' ? input.filters : {};
      const categoryId = text(filters.cateId || input.categoryId);
      const segment = key => filters[key] ? '/' + key + '/' + encodeURIComponent(filters[key]) : '';
      const url = baseUrl + '/index.php/vod/show/id/' + encodeURIComponent(categoryId)
        + '/page/' + page + segment('class') + segment('area') + segment('lang')
        + segment('year') + segment('by') + '.html';
      const items = cards((await request(url)).body, 'module-item', 60);
      return {page, pageCount: items.length < 20 ? page : page + 1, items};
    },
    async search(input) {
      const page = Number(input.page) || 1;
      const url = baseUrl + '/index.php/vod/search/wd/' + encodeURIComponent(text(input.keyword).trim()) + '.html';
      const items = cards((await request(url)).body, 'module-search-item', 60);
      return {page, pageCount: 1, items};
    },
    async detail(input) {
      const body = (await request(absoluteUrl(input.id))).body;
      const rawLinks = [];
      const linkPattern = /\bdata-clipboard-text=["']([^"']+)/gi;
      let linkMatch;
      while ((linkMatch = linkPattern.exec(body)) !== null && rawLinks.length < 100) rawLinks.push(linkMatch[1]);
      const seen = {};
      const shares = rawLinks.map(shareTarget).filter(value => {
        if (!value || seen[value.url]) return false;
        seen[value.url] = true;
        return true;
      });
      if (shares.length === 0) throw new Error('panweb.share-unavailable');
      const poster = detailPoster(body);
      return {
        id: text(input.id),
        sourceKey,
        name: matchContent(body, 'page-title', 'h1')
          || matchContent(body, 'page-title', 'div') || '\u7f51\u76d8\u8d44\u6e90',
        ...(poster ? {poster} : {}),
        description: matchContent(body, 'sqjj_a', 'p'),
        playGroups: [{
          id: 'pan-share',
          name: '\u7f51\u76d8\u5206\u4eab',
          episodes: shares.map((share, index) => ({
            id: String(index),
            name: providerName(share.url) + ' ' + String(index + 1),
            playId: share.url,
            drive: {
              kind: 'drive-share',
              url: share.url,
              ...(share.accessCode ? {accessCode: share.accessCode} : {}),
            },
          })),
        }],
      };
    },
    async play(input) {
      if (!/^https?:\/\//i.test(text(input.playId))) throw new Error('panweb.play-id-invalid');
      return {
        sourceKey,
        flag: input.flag,
        episodeId: input.episodeId,
        rawUrl: text(input.playId),
        headers: {},
        parse: false,
        drive: {kind: 'drive-share', url: text(input.playId)},
      };
    },
    async destroy() {
      sourceKey = '';
      sourceHeaders = {};
      baseUrl = '';
    },
  });
})();
