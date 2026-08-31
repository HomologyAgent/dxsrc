/* global dxplay */
(() => {
  'use strict';

  const BASE = 'https://www.tuxiaobei.com';
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
    + 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
  const SECTIONS = [
    ['animate', '动画视频'],
    ['erge', '儿歌'],
    ['gushi', '故事'],
    ['english', '英语'],
    ['guoxue', '国学'],
    ['shuzi', '学数字'],
  ];
  let sourceKey = '';

  const text = value => value === undefined || value === null ? '' : String(value);
  const decode = value => text(value).replace(/&amp;|&#38;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code))).replace(/\s+/g, ' ').trim();
  const plain = value => decode(text(value).replace(/<[^>]*>/g, ' '));
  const request = async path => {
    const response = await dxplay.fetch({
      url: BASE + (path.startsWith('/') ? path : '/' + path),
      headers: {'User-Agent': USER_AGENT, Referer: BASE + '/'},
    });
    if (response.status < 200 || response.status >= 300) throw new Error('tuxiaobei.request-failed');
    return response.body;
  };
  const cards = body => {
    const output = [], seen = Object.create(null);
    const pattern = /<a\b[^>]*href=["']\/play\/(\d+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = pattern.exec(body)) !== null && output.length < 160) {
      const id = match[1];
      if (seen[id]) continue;
      const block = match[2];
      const image = /<img\b[^>]*src=["']([^"']+)/i.exec(block);
      const title = /<p\b[^>]*class=["'][^"']*\btit\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i.exec(block);
      const remark = /<p\b[^>]*class=["'][^"']*\bnum\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i.exec(block);
      const name = plain(title && title[1]);
      if (!name) continue;
      seen[id] = true;
      output.push({
        id, sourceKey, name,
        ...(image && /^https?:\/\//i.test(image[1]) ? {poster: decode(image[1])} : {}),
        ...(plain(remark && remark[1]) ? {remark: plain(remark[1])} : {}),
      });
    }
    return output;
  };
  const searchSections = async keyword => {
    const needle = text(keyword).trim().toLowerCase();
    if (!needle) return [];
    const output = [], seen = Object.create(null);
    for (let index = 0; index < SECTIONS.length && output.length < 60; index += 2) {
      const batch = SECTIONS.slice(index, index + 2);
      const pages = await Promise.all(batch.map(section => request('/' + section[0])));
      for (const body of pages) {
        for (const item of cards(body)) {
          if (!item.name.toLowerCase().includes(needle) || seen[item.id]) continue;
          seen[item.id] = true;
          output.push(item);
          if (output.length >= 60) break;
        }
      }
    }
    return output;
  };

  dxplay.register({
    id: 'org.dxsrc.qist.tuxiaobei',
    name: 'Tuxiaobei catalog',
    description: 'Readable rewrite of the current Tuxiaobei children catalog and direct CDN video pages.',
    version: '1.0.0',
    protocol: 'catalog@1',

    async init(input) {
      sourceKey = text(input.sourceKey) || 'tuxiaobei';
      return {ready: true};
    },
    async home() {
      const featured = cards(await request('/animate')).slice(0, 40);
      return {categories: SECTIONS.map(section => ({id: section[0], name: section[1]})), featured};
    },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1), id = text(input.categoryId);
      if (page > 1 || !SECTIONS.some(section => section[0] === id)) return {page, pageCount: 1, items: []};
      return {page, pageCount: 1, items: cards(await request('/' + id))};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      return {page, pageCount: 1, items: page === 1 ? await searchSections(input.keyword) : []};
    },
    async detail(input) {
      const id = text(input.id);
      if (!/^\d+$/.test(id)) throw new Error('tuxiaobei.item-not-found');
      const body = await request('/play/' + id);
      const title = /<title>([^<]+)<\/title>/i.exec(body);
      const media = /https:\/\/resource-cdn\.tuxiaobei\.com\/video\/[^"'\s<>]+\.mp4(?:\?[^"'\s<>]*)?/i.exec(body);
      const poster = /https:\/\/resource-cdn\.tuxiaobei\.com\/video\/[^"'\s<>]+\.(?:png|jpe?g|webp)(?:\?[^"'\s<>]*)?/i.exec(body);
      const name = plain(title && title[1]).split('-')[0].trim();
      if (!name || !media) throw new Error('tuxiaobei.item-not-found');
      return {
        id, sourceKey, name,
        ...(poster ? {poster: poster[0]} : {}),
        playGroups: [{id: 'direct', name: '兔小贝', episodes: [{id, name: '播放', playId: media[0]}]}],
      };
    },
    async play(input) {
      const rawUrl = text(input.playId);
      if (!/^https:\/\/resource-cdn\.tuxiaobei\.com\/[^\s]+\.mp4(?:[?#]|$)/i.test(rawUrl)) {
        throw new Error('tuxiaobei.play-unavailable');
      }
      return {
        sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl,
        headers: {'User-Agent': USER_AGENT, Referer: BASE + '/'}, parse: false,
      };
    },
    async destroy() { sourceKey = ''; },
  });
})();
