/* global dxplay */
(() => {
  'use strict';

  const BASE = 'https://www.9hanju.com';
  const USER_AGENT = 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 '
    + '(KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
  const PLAYER_KEY = 'my-to-newhan-2025'.padEnd(32, '\0');
  const YEARS = ['', '2026', '2025', '2024', '2023', '2022', '2021', '2020', '2010__2019', '2000__2009', '1990__1999'];
  let sourceKey = '';
  let sourceHeaders = {};

  const text = value => value === undefined || value === null ? '' : String(value);
  const decode = value => text(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(parseInt(code, 10)))
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&nbsp;/gi, ' ');
  const strip = value => decode(text(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
  const attr = (attributes, name) => decode(text(attributes)
    .match(new RegExp('\\b' + name + '=["\\\']([^"\\\']*)["\\\']', 'i'))?.[1] || '');
  const absolute = value => {
    const raw = decode(value).trim();
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('//')) return 'https:' + raw;
    return raw ? BASE + (raw.startsWith('/') ? raw : '/' + raw) : '';
  };
  const headers = referer => Object.assign({
    'User-Agent': USER_AGENT,
    Referer: referer || BASE + '/',
    'Accept-Language': 'zh-CN,zh;q=0.9',
  }, sourceHeaders);
  const request = async (path, options) => {
    const url = /^https?:\/\//i.test(text(path)) ? text(path) : absolute(path);
    const values = options || {};
    const response = await dxplay.fetch({
      url,
      method: values.method || 'GET',
      headers: Object.assign(headers(values.referer), values.headers || {}),
      ...(values.body === undefined ? {} : {body: values.body}),
    });
    if (response.status < 200 || response.status >= 300) throw new Error('hanju-video.request-failed');
    return response.body;
  };
  const items = html => {
    const output = [], seen = Object.create(null), input = text(html);
    for (const match of input.matchAll(/<a\b([^>]*href=["'][^"']*\/detail\/\d+\.html[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi)) {
      const href = attr(match[1], 'href'), id = href.match(/\/detail\/(\d+)\.html/i)?.[1];
      if (!id || seen[id]) continue;
      const name = strip(attr(match[1], 'title') || match[2]).replace(/\s*\(\d{4}\)\s*$/, '');
      if (!name) continue;
      seen[id] = true;
      const poster = absolute(attr(match[1], 'data-original') || attr(match[1], 'data-src'));
      output.push({id, sourceKey, name, ...(poster ? {poster} : {})});
    }
    return output;
  };
  const detailText = (html, label) => strip(text(html).match(new RegExp('<dt[^>]*>\\s*' + label + '[：:]?\\s*<\\/dt>\\s*<dd[^>]*>([\\s\\S]*?)<\\/dd>', 'i'))?.[1]);
  const categories = () => ['1', '3', '4'].map((id, index) => ({
    id,
    name: ['韩剧', '韩国电影', '韩国综艺'][index],
    filters: [{
      key: 'year', name: '年份', initialValue: '',
      options: YEARS.map(value => ({name: value || '全部', value})),
    }, {
      key: 'sort', name: '排序', initialValue: 'newstime',
      options: [{name: '最新', value: 'newstime'}, {name: '热门', value: 'onclick'}],
    }],
  }));
  const decryptMedia = encrypted => {
    const bytes = dxplay.codec.base64Decode(text(encrypted).trim());
    if (bytes.length <= 32) throw new Error('hanju-video.player-response-invalid');
    return dxplay.crypto.aesDecrypt({
      mode: 'cbc',
      base64: dxplay.codec.base64Encode(bytes.subarray(16)),
      key: PLAYER_KEY,
      ivBase64: dxplay.codec.base64Encode(bytes.subarray(0, 16)),
    }).trim();
  };

  dxplay.register({
    id: 'org.dxsrc.cluntop.hanju-video',
    name: 'Korean drama catalog',
    description: 'Readable rewrite of the public Korean drama catalog and its page-declared AES-CBC HLS handoff.',
    version: '1.0.0',
    protocol: 'catalog@1',
    async init(input) {
      sourceKey = text(input.sourceKey) || 'hanju-video';
      sourceHeaders = input.headers && typeof input.headers === 'object' ? input.headers : {};
      return {ready: true};
    },
    async home() {
      const featured = items(await request('/'));
      if (!featured.length) throw new Error('hanju-video.home-unavailable');
      return {categories: categories(), featured: featured.slice(0, 60)};
    },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1), selected = input.filters || {};
      const id = /^(1|3|4)$/.test(text(input.categoryId)) ? text(input.categoryId) : '1';
      const year = text(selected.year), sort = text(selected.sort) || 'newstime';
      const found = items(await request('/list/' + id + '-' + encodeURIComponent(year) + '-' + encodeURIComponent(sort) + '-' + (page - 1) + '.html'));
      return {page, pageCount: found.length ? page + 1 : page, items: found};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1), keyword = text(input.keyword).trim();
      if (!keyword || page > 1) return {page, pageCount: page, items: []};
      const body = 'show=searchkey&keyboard=' + encodeURIComponent(keyword);
      const found = items(await request('/search/', {
        method: 'POST', body,
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      }));
      return {page, pageCount: page, items: found};
    },
    async detail(input) {
      const id = text(input.id).replace(/\D/g, '');
      if (!id) throw new Error('hanju-video.item-invalid');
      const html = await request('/detail/' + id + '.html'), episodes = [], seen = Object.create(null);
      for (const match of html.matchAll(/bb_a\(['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/g)) {
        const playId = text(match[1]), name = decode(match[2]).trim();
        if (!playId || seen[playId]) continue;
        seen[playId] = true;
        episodes.push({id: String(episodes.length + 1), name: name || String(episodes.length + 1), playId});
      }
      if (!episodes.length) throw new Error('hanju-video.episodes-unavailable');
      const pageName = text(html).match(/var\s+korcms\s*=\s*\{[^}]*["']title["']\s*:\s*["']([^"']+)/i)?.[1];
      const name = decode(pageName || detailText(html, '片名')) || id;
      const imageTag = text(html).match(/<img\b([^>]*(?:pics\/|detail)[^>]*)>/i)?.[1] || '';
      const poster = absolute(attr(imageTag, 'data-original') || attr(imageTag, 'src'));
      const description = strip(text(html).match(/<div\b[^>]*class=["'][^"']*juqing[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]).slice(0, 2000);
      return {
        id, sourceKey, name,
        ...(poster ? {poster} : {}),
        ...(detailText(html, '上映') ? {year: detailText(html, '上映').slice(0, 4)} : {}),
        ...(detailText(html, '主演') ? {actors: detailText(html, '主演')} : {}),
        ...(detailText(html, '状态') ? {remark: detailText(html, '状态')} : {}),
        ...(description ? {description} : {}),
        playGroups: [{id: 'hls', name: '在线云播', episodes}],
      };
    },
    async play(input) {
      const playId = text(input.playId);
      if (!/^\d+_\d+_\d+$/.test(playId)) throw new Error('hanju-video.play-id-invalid');
      const itemId = playId.split('_')[0], referer = BASE + '/detail/' + itemId + '.html';
      const rawUrl = decryptMedia(await request('/u/u1.php?ud=' + encodeURIComponent(playId), {referer}));
      if (!/^https?:\/\//i.test(rawUrl)) throw new Error('hanju-video.play-unavailable');
      return {
        sourceKey,
        flag: text(input.flag),
        episodeId: text(input.episodeId),
        rawUrl,
        headers: {'User-Agent': USER_AGENT, Referer: referer},
        parse: false,
      };
    },
    async destroy() { sourceKey = ''; sourceHeaders = {}; },
  });
})();
