/* global dxplay */
(() => {
  'use strict';

  const DEFAULT_RELEASE_PAGE = 'https://cz01.vip';
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
    + 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
  let sourceKey = '';
  let baseUrl = '';
  let releasePage = DEFAULT_RELEASE_PAGE;
  let sourceHeaders = {};

  const text = value => value === undefined || value === null ? '' : String(value);
  const decodeEntities = value => text(value).replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
  const plainText = value => decodeEntities(text(value).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
  const absoluteUrl = value => {
    const candidate = decodeEntities(value).trim();
    if (!candidate) return '';
    if (/^https?:\/\//i.test(candidate)) return candidate;
    return baseUrl + (candidate.startsWith('/') ? candidate : '/' + candidate);
  };
  const request = async (url, headers) => {
    const response = await dxplay.fetch({
      url, headers: Object.assign({'User-Agent': USER_AGENT, Referer: baseUrl || releasePage}, sourceHeaders, headers || {}),
    });
    if (response.status < 200 || response.status >= 400) throw new Error('czs.request-failed');
    return response.body;
  };
  const classContent = (body, className, tag) => {
    const pattern = new RegExp('<' + (tag || '[a-z0-9]+') + '[^>]*class=["\'][^"\']*\\b'
      + className + '\\b[^"\']*["\'][^>]*>([\\s\\S]*?)<\\/' + (tag || '[a-z0-9]+') + '>', 'i');
    const match = pattern.exec(body);
    return match ? plainText(match[1]) : '';
  };
  const cards = body => {
    const result = [], seen = {};
    const pattern = /<li\b[^>]*>([\s\S]*?<h3\b[^>]*class=["'][^"']*dytit[^"']*["'][^>]*>[\s\S]*?)<\/li>/gi;
    let match;
    while ((match = pattern.exec(body)) !== null && result.length < 80) {
      const block = match[1];
      const title = /<h3\b[^>]*class=["'][^"']*dytit[^"']*["'][^>]*>\s*<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i.exec(block);
      if (!title) continue;
      const id = absoluteUrl(title[1]), name = plainText(title[2]);
      if (!id || !name || seen[id]) continue;
      seen[id] = true;
      const image = /<img\b[^>]*(?:data-original|data-src|src)=["']([^"']+)/i.exec(block);
      const remark = /class=["'][^"']*jidi[^"']*["'][^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i.exec(block);
      result.push({
        id, sourceKey, name,
        ...(image ? {poster: absoluteUrl(image[1])} : {}),
        ...(remark && plainText(remark[1]) ? {remark: plainText(remark[1])} : {}),
      });
    }
    return result;
  };
  const categories = body => {
    const start = body.search(/class=["'][^"']*navlist[^"']*["']/i);
    const area = start < 0 ? '' : body.slice(start, start + 12000);
    const result = [], seen = {};
    const pattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = pattern.exec(area)) !== null && result.length < 20) {
      const name = plainText(match[2]), rawId = text(match[1]);
      const id = rawId.replace(/^https?:\/\/[^/]+/i, '').replace(/^\/+|\/+$/g, '');
      if (!id || !name || name === '首页' || seen[id]) continue;
      seen[id] = true;
      result.push({id, name});
    }
    return result;
  };
  const hexDecode = value => {
    const hex = text(value).replace(/^0x/i, '');
    if (!hex || hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) return '';
    const bytes = new Uint8Array(hex.length / 2);
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = parseInt(hex.slice(index * 2, index * 2 + 2), 16);
    try { return dxplay.codec.utf8Decode(bytes); } catch (_) { return ''; }
  };
  const mediaFromPlayPage = async body => {
    const encrypted = /"([^"]+)";var [\d\w]+=function dncry[\s\S]*?md5\.enc\.Utf8\.parse\("([\d\w]+)"[\s\S]*?md5\.enc\.Utf8\.parse\(([\d]+)\)/.exec(body);
    if (encrypted) {
      try {
        const plain = dxplay.crypto.aesDecrypt({mode: 'cbc', base64: encrypted[1], key: encrypted[2], iv: encrypted[3]});
        const media = /video:\s*\{url:\s*"([^"]+)"/i.exec(plain);
        if (media && /^https?:\/\//i.test(media[1])) return media[1];
      } catch (_) {}
    }
    const iframe = /<iframe\b[^>]*src=["']([^"']+)/i.exec(body);
    if (!iframe) return '';
    const iframeUrl = absoluteUrl(iframe[1]);
    const embeddedMatch = /[?&]url=([^&#]+)/i.exec(iframeUrl);
    if (embeddedMatch) {
      let embedded = embeddedMatch[1];
      try { embedded = decodeURIComponent(embedded); } catch (_) {}
      if (/^https?:\/\//i.test(embedded)) return embedded;
    }
    const frame = await request(iframeUrl, {
      'Upgrade-Insecure-Requests': '1', 'Sec-Fetch-Dest': 'iframe', 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'navigate',
    });
    const result = /var result_v2 = (\{.*?\});/s.exec(frame);
    if (!result) return '';
    try {
      const encoded = text(JSON.parse(result[1]).data).split('').reverse().join('');
      const decoded = hexDecode(encoded);
      return /^https?:\/\//i.test(decoded) ? decoded : '';
    } catch (_) { return ''; }
  };

  dxplay.register({
    id: 'org.dxsrc.qist.czsapp',
    name: 'Czsapp catalog family',
    description: 'Readable rewrite of the Czsapp release-page, HTML catalog and direct playback flow.',
    version: '1.0.0',
    protocol: 'catalog@1',

    async init(input) {
      sourceKey = text(input.sourceKey) || 'czsapp';
      sourceHeaders = input.headers && typeof input.headers === 'object' ? input.headers : {};
      releasePage = (typeof input.extension === 'string' ? input.extension : text(input.extension && input.extension.url)).trim()
        || DEFAULT_RELEASE_PAGE;
      if (!/^https?:\/\//i.test(releasePage)) throw new Error('czs.configuration-invalid');
      const release = await request(releasePage);
      const recommended = /推荐访问<a\b[^>]*href=["']([^"']+)/i.exec(release);
      if (!recommended) throw new Error('czs.site-unavailable');
      const value = recommended[1].startsWith('//') ? 'https:' + recommended[1] : recommended[1];
      baseUrl = text(value).replace(/\/+$/, '');
      if (!/^https?:\/\//i.test(baseUrl)) throw new Error('czs.site-unavailable');
      return {ready: true};
    },
    async home() {
      const body = await request(baseUrl);
      return {categories: categories(body), featured: cards(body).slice(0, 30)};
    },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1), id = text(input.categoryId).replace(/^\/+|\/+$/g, '');
      const result = cards(await request(baseUrl + '/' + id + '/page/' + page));
      return {page, pageCount: result.length ? page + 1 : page, items: result};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      try {
        const result = cards(await request(baseUrl + '/boss1O1?q=' + encodeURIComponent(text(input.keyword))));
        return {page, pageCount: 1, items: result};
      } catch (_) {
        return {page, pageCount: 1, items: []};
      }
    },
    async detail(input) {
      const url = absoluteUrl(input.id), body = await request(url);
      const name = classContent(body, 'moviedteail_tt', 'div') || classContent(body, 'moviedteail_tt', 'h1');
      const posterArea = /<div\b[^>]*class=["'][^"']*dyimg[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(body);
      const poster = posterArea && /<img\b[^>]*src=["']([^"']+)/i.exec(posterArea[1]);
      const episodes = [], seen = {};
      const pattern = /<a\b[^>]*href=["']([^"']*\/v_play\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let match;
      while ((match = pattern.exec(body)) !== null && episodes.length < 500) {
        const playId = absoluteUrl(match[1]);
        if (!playId || seen[playId]) continue;
        seen[playId] = true;
        episodes.push({id: String(episodes.length + 1), name: plainText(match[2]) || String(episodes.length + 1), playId});
      }
      if (!name || !episodes.length) throw new Error('czs.item-not-found');
      return {
        id: url, sourceKey, name,
        ...(poster ? {poster: absoluteUrl(poster[1])} : {}),
        description: classContent(body, 'yp_context', 'div'),
        playGroups: [{id: 'czs', name: '厂长资源', episodes}],
      };
    },
    async play(input) {
      const page = text(input.playId);
      if (!/^https?:\/\//i.test(page)) throw new Error('czs.play-id-invalid');
      const rawUrl = await mediaFromPlayPage(await request(page));
      if (!/^https?:\/\//i.test(rawUrl)) throw new Error('czs.play-unavailable');
      return {
        sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl,
        headers: {'User-Agent': USER_AGENT, Referer: baseUrl}, parse: false,
      };
    },
    async destroy() {
      sourceKey = ''; baseUrl = ''; releasePage = DEFAULT_RELEASE_PAGE; sourceHeaders = {};
    },
  });
})();
