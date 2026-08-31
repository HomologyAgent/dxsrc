/* global dxplay */
(() => {
  'use strict';

  const API = 'https://api.agedm.io';
  const SITE = 'https://www.agedm.io';
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
    + 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
  let sourceKey = '';

  const text = value => value === undefined || value === null ? '' : String(value);
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const list = value => Array.isArray(value) ? value : [];
  const request = async path => {
    const response = await dxplay.fetch({
      url: /^https?:\/\//i.test(path) ? path : API + path,
      headers: {'User-Agent': USER_AGENT, Referer: SITE + '/', Origin: SITE},
    });
    if (response.status < 200 || response.status >= 300) throw new Error('age.request-failed');
    try { return JSON.parse(response.body); } catch (_) { throw new Error('age.response-invalid'); }
  };
  const item = value => ({
    id: text(value.id),
    sourceKey,
    name: text(value.name || value.id),
    ...(value.cover ? {poster: text(value.cover)} : {}),
    ...(value.uptodate || value.status ? {remark: text(value.uptodate || value.status)} : {}),
  });
  const catalogPath = (page, keyword) => keyword
    ? '/v2/search?query=' + encodeURIComponent(keyword) + '&page=' + page
    : '/v2/catalog?genre=all&label=all&letter=all&order=time&region=all'
      + '&resource=all&season=all&status=all&year=all&size=20&page=' + page;
  const catalogItems = (payload, search) => {
    const root = search ? object(payload.data) : payload;
    return list(root.videos).map(item).filter(value => value.id && value.name);
  };

  dxplay.register({
    id: 'org.dxsrc.xptv.age-anime',
    name: 'AGE anime',
    description: 'Readable DXPlay rewrite of the XPTV AGE JSON catalog and its playback resolver.',
    version: '1.0.0',
    protocol: 'catalog@1',

    async init(input) {
      sourceKey = text(input.sourceKey) || 'age-anime';
      return {ready: true};
    },

    async home() {
      const featured = catalogItems(await request(catalogPath(1, '')), false);
      return {categories: [{id: 'latest', name: '最近更新'}], featured};
    },

    async category(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const items = catalogItems(await request(catalogPath(page, '')), false);
      return {page, pageCount: items.length ? page + 1 : page, items};
    },

    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const keyword = text(input.keyword).trim();
      const items = keyword ? catalogItems(await request(catalogPath(page, keyword)), true) : [];
      return {page, pageCount: items.length ? page + 1 : page, items};
    },

    async detail(input) {
      const id = text(input.id);
      const payload = await request('/v2/detail/' + encodeURIComponent(id));
      const video = object(payload.video);
      const labels = object(payload.player_label_arr);
      const vipKeys = text(payload.player_vip).split(',').map(value => value.trim()).filter(Boolean);
      const vip = object(payload.player_jx).vip;
      const direct = object(payload.player_jx).zj;
      const playGroups = [];
      for (const key of Object.keys(object(video.playlists))) {
        if (!/m3u8/i.test(key)) continue;
        const prefix = vipKeys.includes(key) ? vip : direct;
        const episodes = list(video.playlists[key]).map((entry, index) => {
          if (!Array.isArray(entry) || entry.length < 2 || !prefix) return null;
          return {
            id: String(index + 1),
            name: text(entry[0]) || String(index + 1),
            playId: text(prefix) + text(entry[1]),
          };
        }).filter(Boolean);
        if (episodes.length) playGroups.push({id: key, name: text(labels[key]) || key, episodes});
      }
      if (!video.name || !playGroups.length) throw new Error('age.item-not-found');
      return {
        id,
        sourceKey,
        name: text(video.name),
        ...(video.cover ? {poster: text(video.cover)} : {}),
        year: text(video.year),
        area: text(video.region),
        category: text(video.tags),
        remark: text(video.uptodate || video.status),
        description: text(video.intro_clean || video.intro),
        playGroups,
      };
    },

    async play(input) {
      const pageUrl = text(input.playId);
      if (!/^https?:\/\//i.test(pageUrl)) throw new Error('age.play-invalid');
      const response = await dxplay.fetch({
        url: pageUrl,
        headers: {'User-Agent': USER_AGENT, Referer: SITE + '/', Origin: SITE},
      });
      if (response.status < 200 || response.status >= 300) throw new Error('age.play-failed');
      const rawUrl = (response.body.match(/Vurl\s*=\s*['"]([^'"]+)/i) || [])[1] || '';
      if (!/^https?:\/\//i.test(rawUrl)) throw new Error('age.play-unavailable');
      return {
        sourceKey,
        flag: text(input.flag),
        episodeId: text(input.episodeId),
        rawUrl,
        headers: {'User-Agent': USER_AGENT, Referer: pageUrl},
        parse: false,
      };
    },

    async destroy() { sourceKey = ''; },
  });
})();
