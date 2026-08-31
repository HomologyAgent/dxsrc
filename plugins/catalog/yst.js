/* global dxplay */
(() => {
  'use strict';

  const API = 'https://app.api.btime.com/video/play?id=';
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
    + 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
  const years = ['2026', '2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018'];
  let sourceKey = '';
  let sourceHeaders = {};

  const text = value => value === undefined || value === null ? '' : String(value);
  const headers = () => Object.assign({
    'User-Agent': USER_AGENT,
    Referer: 'https://www.btime.com/',
  }, sourceHeaders);
  const requestJson = async url => {
    const response = await dxplay.fetch({url, headers: headers()});
    if (response.status < 200 || response.status >= 300) throw new Error('yst.request-failed');
    try { return JSON.parse(response.body); } catch (_error) { throw new Error('yst.response-invalid'); }
  };
  const playable = async id => {
    const response = await requestJson(API + encodeURIComponent(id));
    if (Number(response.errno) !== 0 || !response.data) throw new Error('yst.item-not-found');
    const streams = Array.isArray(response.data.video_stream) ? response.data.video_stream : [];
    const stream = streams.find(value => value && value.stream_url) || {};
    return {data: response.data, url: text(stream.stream_url)};
  };

  dxplay.register({
    id: 'org.dxsrc.jsm.yst',
    name: 'Yang Sheng Tang',
    description: 'Semantic rewrite of the jsm.json YST health-video catalog.',
    version: '1.0.0',
    protocol: 'catalog@1',

    async init(input) {
      sourceKey = text(input.sourceKey);
      sourceHeaders = input.headers && typeof input.headers === 'object' ? input.headers : {};
      if (!sourceKey) throw new Error('yst.source-key-missing');
      return {ready: true};
    },
    async home() {
      return {
        categories: years.map(year => ({
          id: 'btv_08da67cea600bf3c78973427bfaba12d_s0_' + year,
          name: year,
        })),
        featured: [],
      };
    },
    async category(input) {
      const url = 'https://pc.api.btime.com/btimeweb/infoFlow?list_id='
        + encodeURIComponent(input.categoryId) + '&refresh=1&count=2000&expands=pageinfo';
      const response = await requestJson(url);
      const values = Number(response.errno) === 0 && response.data && Array.isArray(response.data.list)
        ? response.data.list : [];
      const items = values.map(value => {
        const data = value && value.data || {};
        const covers = Array.isArray(data.covers) ? data.covers : [];
        const corners = Array.isArray(data.corner) ? data.corner : [];
        return {
          id: text(value && value.gid),
          sourceKey,
          name: text(data.title || value && value.gid),
          ...(covers[0] ? {poster: text(covers[0])} : {}),
          ...(corners[0] && corners[0].text ? {remark: text(corners[0].text)} : {}),
        };
      }).filter(value => value.id && value.name);
      return {page: Number(input.page) || 1, pageCount: 1, items};
    },
    async search(input) {
      return {page: Number(input.page) || 1, pageCount: 1, items: []};
    },
    async detail(input) {
      const selected = await playable(input.id);
      const data = selected.data;
      return {
        id: text(input.id),
        sourceKey,
        name: text(data.video_title || data.title || input.id),
        ...(data.video_covers ? {poster: text(data.video_covers)} : {}),
        description: text(data.summary || data.description),
        playGroups: [{
          id: 'yst',
          name: '养生堂',
          episodes: [{id: text(input.id), name: text(data.video_title || data.title || '养生堂'), playId: text(input.id)}],
        }],
      };
    },
    async play(input) {
      const selected = await playable(input.playId);
      if (!selected.url) throw new Error('yst.play-unavailable');
      return {
        sourceKey,
        flag: input.flag,
        episodeId: input.episodeId,
        rawUrl: selected.url,
        headers: headers(),
        parse: false,
      };
    },
    async destroy() {
      sourceKey = '';
      sourceHeaders = {};
    },
  });
})();

