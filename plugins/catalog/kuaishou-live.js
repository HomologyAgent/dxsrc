/* global dxplay */
(() => {
  'use strict';

  const HOST = 'https://live.kuaishou.com';
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36';
  let sourceKey = '';

  const text = value => value === undefined || value === null ? '' : String(value);
  const list = value => Array.isArray(value) ? value : [];
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const headers = () => ({'User-Agent': USER_AGENT, Referer: HOST + '/'});
  const get = async path => {
    const response = await dxplay.fetch({url: HOST + path, headers: headers()});
    if (response.status < 200 || response.status >= 300) throw new Error('kuaishou-live.request-failed');
    try { return JSON.parse(response.body); } catch (_) { throw new Error('kuaishou-live.response-invalid'); }
  };
  const representations = value => {
    const unique = new Map();
    for (const play of list(value.playUrls)) {
      for (const entry of list(object(object(play).adaptationSet).representation)) {
        const url = text(entry.url);
        if (!/^https?:\/\//i.test(url) || unique.has(url)) continue;
        unique.set(url, {
          name: text(entry.name || entry.shortName || entry.qualityType) || '直播',
          url,
          bitrate: Number(entry.bitrate) || 0,
          preferred: entry.defaultSelect === true,
        });
      }
    }
    return [...unique.values()].sort((left, right) => Number(right.preferred) - Number(left.preferred) || right.bitrate - left.bitrate);
  };
  const room = (value, categoryId) => {
    const author = object(value.author);
    const streams = representations(value);
    const id = text(value.id);
    const name = text(value.caption) || text(author.name) || id;
    if (!id || !name || !streams.length) return null;
    const poster = text(value.poster || author.avatar);
    const descriptor = JSON.stringify({id, categoryId: text(categoryId), name, poster, author: text(author.name), description: text(author.description), streams});
    return {id: descriptor, sourceKey, name, ...(poster ? {poster} : {}), remark: text(author.name || value.watchingCount)};
  };
  const rooms = async (categoryId, page) => {
    const query = '?pageSize=20&page=' + page + '&filterType=0&gameId=' + encodeURIComponent(categoryId);
    let payload = await get('/live_api/gameboard/list' + query);
    let data = object(payload.data);
    if (!list(data.list).length) {
      payload = await get('/live_api/non-gameboard/list' + query);
      data = object(payload.data);
    }
    return {items: list(data.list).map(value => room(value, categoryId)).filter(Boolean), hasMore: data.hasMore === true};
  };

  dxplay.register({
    id: 'org.dxsrc.jsm.kuaishou-live',
    name: 'Kuaishou live catalog',
    description: 'Readable rewrite of the public Kuaishou live category, room and direct FLV playback flow.',
    version: '1.0.0',
    protocol: 'catalog@1',

    async init(input) {
      sourceKey = text(input.sourceKey) || 'kuaishou-live';
      return {ready: true};
    },
    async home() {
      const payload = await get('/live_api/category/data?type=1&page=1&pageSize=30');
      const categories = list(object(payload.data).list).map(value => ({id: text(value.id), name: text(value.name)})).filter(value => value.id && value.name);
      if (!categories.length) throw new Error('kuaishou-live.categories-unavailable');
      return {categories, featured: []};
    },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const result = await rooms(text(input.categoryId), page);
      return {page, pageCount: result.hasMore ? page + 1 : page, items: result.items};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      return {page, pageCount: page, items: []};
    },
    async detail(input) {
      let value;
      try { value = JSON.parse(text(input.id)); } catch (_) { throw new Error('kuaishou-live.room-invalid'); }
      const streams = list(value.streams).filter(entry => /^https?:\/\//i.test(text(entry.url)));
      if (!streams.length) throw new Error('kuaishou-live.stream-unavailable');
      return {
        id: text(input.id), sourceKey, name: text(value.name) || text(value.id),
        ...(value.poster ? {poster: text(value.poster)} : {}),
        remark: text(value.author), description: text(value.description),
        playGroups: [{
          id: 'kuaishou-live', name: '快手直播',
          episodes: streams.map((entry, index) => ({
            id: text(value.id) + '-' + index,
            name: text(entry.name) || ('线路 ' + (index + 1)),
            playId: JSON.stringify({roomId: text(value.id), url: text(entry.url)}),
          })),
        }],
      };
    },
    async play(input) {
      let value;
      try { value = JSON.parse(text(input.playId)); } catch (_) { throw new Error('kuaishou-live.play-invalid'); }
      const url = text(value.url);
      if (!/^https?:\/\//i.test(url)) throw new Error('kuaishou-live.play-unavailable');
      return {sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl: url, headers: headers(), parse: false};
    },
    async destroy() { sourceKey = ''; },
  });
})();
