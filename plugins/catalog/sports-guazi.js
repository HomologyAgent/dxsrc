/* global dxplay */
(() => {
  'use strict';

  const BASE_URL = 'https://api.46d5umpk.com';
  const KEY = 'KANGEQIU@8868!~.';
  const IV = '0200010900030207';
  const PARAMETERS = {
    hot: {frame: '0', hot: '1', tag: '0', type: '0'},
    nba: {frame: '0', hot: '0', tag: '37', type: '0'},
    football: {frame: '0', hot: '0', tag: '0', type: '1'},
    basketball: {frame: '0', hot: '0', tag: '0', type: '2'},
  };
  let sourceKey = '';
  let sourceHeaders = {};

  const text = value => value === undefined || value === null ? '' : String(value);
  const list = value => Array.isArray(value) ? value : [];
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const encrypt = value => dxplay.crypto.aesEncrypt({mode: 'cbc', text: value, key: KEY, iv: IV});
  const decrypt = value => dxplay.crypto.aesDecrypt({mode: 'cbc', base64: text(value).replace(/\\/g, ''), key: KEY, iv: IV});
  const headers = () => Object.assign({
    'User-Agent': 'okhttp/3.12.0',
    'Content-Type': 'application/x-www-form-urlencoded',
    'user-platform': 'null',
    'client-version': '3.0.1.1',
    'client-channel': '',
    token: '',
  }, sourceHeaders);
  const request = async (path, payload) => {
    const response = await dxplay.fetch({
      url: BASE_URL + path + '?parameter=key', method: 'POST', headers: headers(),
      body: 'parameter=' + encodeURIComponent(encrypt(JSON.stringify(payload))),
    });
    if (response.status < 200 || response.status >= 300) throw new Error('guazi-sports.request-failed');
    try {
      const envelope = JSON.parse(response.body);
      return JSON.parse(decrypt(envelope.data));
    } catch (_) { throw new Error('guazi-sports.response-invalid'); }
  };
  const dateLabel = seconds => {
    const value = new Date(Number(seconds) * 1000);
    const part = number => String(number).padStart(2, '0');
    return part(value.getMonth() + 1) + '-' + part(value.getDate()) + ' ' + part(value.getHours()) + ':' + part(value.getMinutes());
  };
  const score = value => {
    const home = Number(object(value.home).score) || 0;
    const visiting = Number(object(value.visiting).score) || 0;
    return home > 0 || visiting > 0 ? ' 比分 ' + home + '-' + visiting : '';
  };
  const item = value => {
    const home = object(value.home);
    const visiting = object(value.visiting);
    return {
      id: text(value.mid), sourceKey,
      name: text(home.name) + ' vs ' + text(visiting.name),
      ...(text(home.logo) ? {poster: text(home.logo)} : {}),
      remark: [text(value.event_name), dateLabel(value.match_time), text(value.match_status_info) + score(value)].filter(Boolean).join(' · '),
    };
  };

  dxplay.register({
    id: 'org.dxsrc.jsm.sports-guazi',
    name: 'Guazi sports catalog',
    description: 'Semantic rewrite of the current Guazi sports event API, encrypted event details and direct live lines.',
    version: '1.0.0',
    protocol: 'catalog@1',

    async init(input) {
      sourceKey = text(input.sourceKey) || 'guazi-sports';
      sourceHeaders = object(input.headers);
      return {ready: true};
    },
    async home() {
      return {categories: [
        {id: 'hot', name: '热门'}, {id: 'nba', name: 'NBA'},
        {id: 'football', name: '足球'}, {id: 'basketball', name: '篮球'},
      ], featured: []};
    },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1);
      if (page !== 1) return {page, pageCount: 1, items: []};
      const values = await request('/gz/live/sports', PARAMETERS[text(input.categoryId)] || PARAMETERS.hot);
      const cutoff = Date.now() - 86400000;
      const items = list(values).filter(value => Number(value.match_time) * 1000 >= cutoff && Number(value.m_status) < 2)
        .map(item).filter(value => value.id && value.name);
      return {page, pageCount: 1, items};
    },
    async search(input) { return {page: Math.max(1, Number(input.page) || 1), pageCount: 1, items: []}; },
    async detail(input) {
      const id = text(input.id);
      if (!id) throw new Error('guazi-sports.item-invalid');
      const value = await request('/gz/live/detail', {mid: id});
      const home = object(value.home);
      const visiting = object(value.visiting);
      const name = text(home.name) + ' vs ' + text(visiting.name);
      const episodes = list(value.live_line).map((line, index) => ({
        id: String(index + 1), name: text(line.name) || '线路 ' + (index + 1), playId: text(line.m3u8),
      })).filter(episode => /^https?:\/\//i.test(episode.playId));
      if (!episodes.length) throw new Error('guazi-sports.lines-unavailable');
      return {
        id, sourceKey, name,
        ...(text(home.logo) ? {poster: text(home.logo)} : {}),
        remark: text(value.match_status_info) + score(value),
        description: [text(value.event_name), text(value.match_status_info) + score(value)].filter(Boolean).join(' · '),
        playGroups: [{id: 'guazi', name: '瓜子', episodes}],
      };
    },
    async play(input) {
      const url = text(input.playId);
      if (!/^https?:\/\//i.test(url)) throw new Error('guazi-sports.play-invalid');
      return {
        sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl: url,
        headers: {'User-Agent': 'Lavf/57.83.100', Referer: 'http://WJiZxLXA2.com/'}, parse: false,
      };
    },
    async destroy() { sourceKey = ''; sourceHeaders = {}; },
  });
})();
