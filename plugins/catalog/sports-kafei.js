/* global dxplay */
(() => {
  'use strict';

  const BASE = 'https://kafeizhibo.cc';
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    Accept: 'application/json',
  };
  const categoryValues = [['hot', '热门'], ['1', '足球'], ['2', '篮球']];
  let sourceKey = '';
  let sourceHeaders = {};

  const text = value => value === undefined || value === null ? '' : String(value);
  const requestJson = async path => {
    const response = await dxplay.fetch({
      url: BASE + path,
      headers: Object.assign({}, headers, sourceHeaders),
    });
    if (response.status < 200 || response.status >= 300) throw new Error('kafei.request-failed');
    try { return JSON.parse(response.body); } catch (_error) { throw new Error('kafei.response-invalid'); }
  };
  const room = async roomId => {
    const response = await requestJson('/api/v1/room/' + encodeURIComponent(roomId));
    if (Number(response.code) !== 200 || !response.data) throw new Error('kafei.item-not-found');
    return response.data;
  };

  dxplay.register({
    id: 'org.dxsrc.jsm.sports-kafei',
    name: 'Kafei Sports',
    description: 'Semantic rewrite of the jsm.json SportsKafei event catalog.',
    version: '1.0.0',
    protocol: 'catalog@1',

    async init(input) {
      sourceKey = text(input.sourceKey);
      sourceHeaders = input.headers && typeof input.headers === 'object' ? input.headers : {};
      if (!sourceKey) throw new Error('kafei.source-key-missing');
      return {ready: true};
    },
    async home() {
      return {categories: categoryValues.map(([id, name]) => ({id, name})), featured: []};
    },
    async category(input) {
      const page = Number(input.page) || 1;
      const response = await requestJson('/api/v1/schedule?type='
        + encodeURIComponent(input.categoryId) + '&page=' + page + '&size=30');
      const values = Number(response.code) === 200 && Array.isArray(response.data) ? response.data : [];
      const items = values.map(value => {
        const anchor = value && (value.archor || Array.isArray(value.archors) && value.archors[0]);
        return {
          id: text(anchor && anchor.room_id),
          sourceKey,
          name: text(value.home_team) + ' VS ' + text(value.away_team),
          ...(value.home_team_logo ? {poster: text(value.home_team_logo)} : {}),
          ...(value.league_name ? {remark: text(value.league_name)} : {}),
        };
      }).filter(value => value.id);
      return {page, pageCount: items.length < 30 ? page : page + 1, items};
    },
    async search(input) {
      return {page: Number(input.page) || 1, pageCount: 1, items: []};
    },
    async detail(input) {
      const data = await room(input.id);
      const info = data.room_info || {};
      const signals = Array.isArray(data.signals) ? data.signals : [];
      return {
        id: text(info.room_id || input.id),
        sourceKey,
        name: text(info.title || input.id),
        actors: text(info.home_team) + ' VS ' + text(info.away_team),
        director: text(info.league),
        playGroups: [{
          id: 'kafei',
          name: '咖啡体育',
          episodes: signals.map((signal, index) => ({
            id: String(index),
            name: text(signal.name || '线路 ' + String(index + 1)),
            playId: text(info.room_id || input.id) + '@' + String(index),
          })),
        }],
      };
    },
    async play(input) {
      const parts = text(input.playId).split('@');
      const data = await room(parts[0]);
      const signals = Array.isArray(data.signals) ? data.signals : [];
      const selected = signals[Number(parts[1]) || 0];
      if (!selected || !selected.stream_url) throw new Error('kafei.play-unavailable');
      return {
        sourceKey,
        flag: input.flag,
        episodeId: input.episodeId,
        rawUrl: text(selected.stream_url),
        headers: {},
        parse: false,
      };
    },
    async destroy() {
      sourceKey = '';
      sourceHeaders = {};
    },
  });
})();

