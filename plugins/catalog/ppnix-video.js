/* global dxplay */
(() => {
  'use strict';

  const BASE = 'https://www.ppnix.com';
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
    + 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
  const CATEGORIES = [{id: 'movie', name: '电影'}, {id: 'tv', name: '电视剧'}];
  const FILTER_VALUES = {
    movie: {
      type: '剧情,喜剧,动作,惊悚,爱情,犯罪,冒险,恐怖,悬疑,奇幻,科幻,动画,战争,历史,传记,家庭,音乐,同性,纪录片,歌舞,古装,运动,武侠'.split(','),
      country: '美国,英国,日本,中国大陆,法国,中国香港,韩国,德国,加拿大,意大利,西班牙,澳大利亚,台湾,印度,泰国'.split(','),
    },
    tv: {
      type: '剧情,犯罪,爱情,悬疑,喜剧,惊悚,奇幻,动作,科幻,古装,冒险,恐怖,动画,历史,战争,家庭,真人秀,纪录片'.split(','),
      country: '美国,中国大陆,韩国,英国,日本,台湾,中国香港,泰国,法国,新加坡,澳大利亚'.split(','),
    },
  };
  let sourceKey = '';

  const text = value => value === undefined || value === null ? '' : String(value);
  const clean = value => text(value).replace(/<[^>]*>/g, ' ').replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/\s+/g, ' ').trim();
  const request = async path => {
    const url = /^https?:\/\//i.test(path) ? path : BASE + path;
    const response = await dxplay.fetch({url, headers: {'User-Agent': USER_AGENT, Referer: BASE + '/cn/'}});
    if (response.status < 200 || response.status >= 300) throw new Error('ppnix.request-failed');
    return response.body;
  };
  const filter = category => {
    const values = FILTER_VALUES[category] || FILTER_VALUES.movie;
    const years = Array.from({length: 36}, (_, index) => String(2026 - index));
    const make = (key, name, entries) => ({
      key, name, initialValue: '',
      options: [{name: '全部', value: ''}, ...entries.map(value => ({name: value, value}))],
    });
    return [make('type', '类型', values.type), make('country', '国家', values.country), make('year', '年代', years)];
  };
  const items = html => {
    const output = [], seen = Object.create(null);
    const pattern = /<a\b([^>]*class=["'][^"']*thumbnail[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = pattern.exec(html)) !== null && output.length < 100) {
      const href = (match[1].match(/href=["']([^"']+)/i) || [])[1] || '';
      const parsed = href.match(/\/cn\/(movie|tv)\/(\d+)\.html/i);
      if (!parsed || seen[parsed[2]]) continue;
      const image = (match[2].match(/<img\b([^>]*)>/i) || [])[1] || '';
      const name = clean((image.match(/alt=["']([^"']+)/i) || [])[1]) || parsed[2];
      const poster = (image.match(/(?:data-src|src)=["']([^"']+)/i) || [])[1] || '';
      seen[parsed[2]] = true;
      output.push({id: parsed[1] + ':' + parsed[2], sourceKey, name, ...(poster ? {poster} : {})});
    }
    return output;
  };
  const detailPath = id => {
    const match = text(id).match(/^(movie|tv):(\d+)$/);
    if (!match) throw new Error('ppnix.item-invalid');
    return {kind: match[1], id: match[2], path: '/cn/' + match[1] + '/' + match[2] + '.html'};
  };

  dxplay.register({
    id: 'org.dxsrc.xptv.ppnix-video',
    name: 'PPnix catalog',
    description: 'Readable DXPlay rewrite of the XPTV PPnix filter catalog, direct episode playlists and subtitle endpoints.',
    version: '1.0.0',
    protocol: 'catalog@1',

    async init(input) { sourceKey = text(input.sourceKey) || 'ppnix-video'; return {ready: true}; },

    async home() {
      return {categories: CATEGORIES.map(value => ({...value, filters: filter(value.id)})), featured: items(await request('/cn/movie/'))};
    },

    async category(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const category = text(input.categoryId) === 'tv' ? 'tv' : 'movie';
      const filters = input.filters || {};
      const parts = [text(filters.type), text(filters.country), text(filters.year), page > 1 ? String(page - 1) : ''];
      const suffix = parts.join('-') === '---' ? '' : parts.join('-') + '-.html';
      const found = items(await request('/cn/' + category + '/' + suffix));
      return {page, pageCount: found.length ? page + 1 : page, items: found};
    },

    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      if (page > 1) return {page, pageCount: page, items: []};
      const keyword = text(input.keyword).trim();
      const found = keyword ? items(await request('/cn/search/' + encodeURIComponent(keyword) + '--.html')) : [];
      return {page, pageCount: 1, items: found};
    },

    async detail(input) {
      const reference = detailPath(input.id);
      const html = await request(reference.path);
      const encoded = (html.match(/m3u8\s*=\s*\[([^\]]+)\]/i) || [])[1] || '';
      const episodes = encoded.replace(/['"]/g, '').split(',').map(value => value.trim()).filter(Boolean).map((value, index) => ({
        id: String(index + 1),
        name: reference.kind === 'tv' ? '第' + value + '集' : value,
        playId: JSON.stringify({id: reference.id, value}),
      }));
      if (!episodes.length) throw new Error('ppnix.item-not-found');
      const name = clean((html.match(/<h1[^>]*class=["'][^"']*product-title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i) || [])[1]) || reference.id;
      const poster = (html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i) || [])[1] || '';
      return {
        id: text(input.id), sourceKey, name, ...(poster ? {poster} : {}),
        playGroups: [{id: 'main', name: '正片', episodes}],
      };
    },

    async play(input) {
      let value;
      try { value = JSON.parse(text(input.playId)); } catch (_) { throw new Error('ppnix.play-invalid'); }
      if (!value || !/^\d+$/.test(text(value.id)) || !text(value.value)) throw new Error('ppnix.play-invalid');
      const rawUrl = BASE + '/info/m3u8/' + encodeURIComponent(text(value.id)) + '/' + encodeURIComponent(text(value.value)) + '.m3u8';
      return {
        sourceKey,
        flag: text(input.flag),
        episodeId: text(input.episodeId),
        rawUrl,
        headers: {'User-Agent': USER_AGENT, Referer: BASE + '/'},
        parse: false,
      };
    },

    async destroy() { sourceKey = ''; },
  });
})();
