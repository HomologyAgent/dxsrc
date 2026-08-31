/* global dxplay */
(() => {
  'use strict';

  const DEFAULT_HOST = 'http://app.tuxianimg.com';
  const KEY = 'MickwrKuMickwrKu';
  const API_HEADERS = {
    'App-Device-Id': '2c84565e46955353d875e3d964d87e1c6',
    'App-Os-Type': 'android',
    'App-Ui-Mode': 'light',
    'App-Version-Code': '100',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'User-Agent': 'okhttp/3.14.9',
  };
  const PLAY_HEADERS = {
    'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 15; ZXV10S100V7 Build/b5cc949.1)',
  };
  const FILTER_LABELS = {
    class: '类型', area: '地区', lang: '语言', year: '年份', sort: '排序',
    star: '明星', director: '导演', state: '状态', version: '版本',
  };
  const LINE_NAMES = {
    mp4: 'MP4 高清', YYNB: '优优牛播', wsym3u8: '微视云 M3U8',
    bfzym3u8: '暴风影视 M3U8', lzm3u8: '量子 M3U8', hkm3u8: '港剧 M3U8',
    '1080zyk': '1080 自愈库',
  };

  let sourceKey = '';
  let baseUrl = DEFAULT_HOST;
  let sourceHeaders = {};

  const text = value => value === undefined || value === null ? '' : String(value);
  const list = value => Array.isArray(value) ? value : [];
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const absolute = value => {
    const url = text(value);
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith('//')) return 'http:' + url;
    return url ? baseUrl + (url.startsWith('/') ? url : '/' + url) : '';
  };
  const form = values => Object.keys(values).filter(key => text(values[key])).map(key => (
    encodeURIComponent(key) + '=' + encodeURIComponent(text(values[key]))
  )).join('&');
  const decrypt = value => {
    try {
      return JSON.parse(dxplay.crypto.aesDecrypt({
        mode: 'cbc', base64: text(value), key: KEY, iv: KEY,
      }));
    } catch (_) { throw new Error('tvbcloud.response-invalid'); }
  };
  const request = async (endpoint, parameters) => {
    const response = await dxplay.fetch({
      url: baseUrl + '/api/vod/' + endpoint,
      method: 'POST',
      headers: Object.assign({}, API_HEADERS, sourceHeaders),
      body: form(parameters || {}),
    });
    if (response.status < 200 || response.status >= 300) throw new Error('tvbcloud.request-failed');
    let envelope;
    try { envelope = JSON.parse(response.body); }
    catch (_) { throw new Error('tvbcloud.envelope-invalid'); }
    if (!text(envelope.data)) throw new Error('tvbcloud.response-empty');
    return decrypt(envelope.data);
  };
  const item = value => ({
    id: text(value.vod_id),
    sourceKey,
    name: text(value.vod_name) || text(value.vod_id),
    ...(text(value.vod_pic || value.vod_pic_slide) ? {poster: absolute(value.vod_pic || value.vod_pic_slide)} : {}),
    ...(text(value.vod_remarks) ? {remark: text(value.vod_remarks)} : {}),
  });
  const options = value => [{name: '全部', value: ''}].concat(text(value).split(',').map(entry => entry.trim())
    .filter(Boolean).map(entry => ({name: entry, value: entry})));
  const filters = value => {
    let extension;
    try { extension = typeof value === 'string' ? JSON.parse(value) : object(value); }
    catch (_) { return []; }
    return Object.keys(FILTER_LABELS).filter(key => text(extension[key])).map(key => ({
      key,
      name: FILTER_LABELS[key],
      initialValue: '',
      options: options(extension[key]),
    }));
  };

  dxplay.register({
    id: 'org.dxsrc.jsm.tvb-cloud',
    name: 'TVB cloud catalog',
    description: 'Semantic rewrite of the public TVB cloud App API, encrypted catalog responses, episodes and direct playback.',
    version: '1.0.0',
    protocol: 'catalog@1',

    async init(input) {
      sourceKey = text(input.sourceKey) || 'tvb-cloud';
      sourceHeaders = object(input.headers);
      const extension = input.extension;
      baseUrl = text(typeof extension === 'string' ? extension : object(extension).url) || DEFAULT_HOST;
      baseUrl = baseUrl.replace(/\/+$/, '');
      if (!/^https?:\/\//i.test(baseUrl)) throw new Error('tvbcloud.configuration-invalid');
      return {ready: true};
    },
    async home() {
      const data = await request('init');
      const categories = list(data.type_list).filter(value => (
        text(value.type_id) && text(value.type_name) && !(text(value.type_id) === '0' && text(value.type_name) === '全部')
      )).map(value => ({
        id: text(value.type_id),
        name: text(value.type_name),
        ...(filters(value.type_extend).length ? {filters: filters(value.type_extend)} : {}),
      }));
      return {
        categories,
        featured: list(data.recommend_list).map(item).filter(value => value.id && value.name),
      };
    },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const parameters = {type_id: text(input.categoryId), page};
      const selected = object(input.filters);
      for (const key of ['class', 'area', 'lang', 'year', 'sort']) {
        if (text(selected[key])) parameters[key] = text(selected[key]);
      }
      const data = await request('typeFilterVodList', parameters);
      const seen = Object.create(null);
      const items = list(data.recommend_list).map(item).filter(value => {
        if (!value.id || !value.name || seen[value.id]) return false;
        seen[value.id] = true;
        return true;
      });
      const pageCount = Number(data.page_count || data.pagecount);
      return {page, ...(pageCount > 0 ? {pageCount} : {}), items};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const data = await request('searchList', {keywords: text(input.keyword), type_id: '0', page});
      const values = list(data.search_list).length ? data.search_list : data.recommend_list;
      return {page, items: list(values).map(item).filter(value => value.id && value.name)};
    },
    async detail(input) {
      const id = text(input.id);
      if (!id) throw new Error('tvbcloud.item-invalid');
      const data = await request('vodDetail', {vod_id: id});
      const value = object(data.vod);
      if (!Object.keys(value).length) throw new Error('tvbcloud.item-not-found');
      const sourceIds = Object.create(null);
      for (const source of list(data.player_source_list)) {
        if (text(source.player_code) && text(source.id)) sourceIds[text(source.player_code)] = text(source.id);
      }
      const urls = list(data.vod_play_url_list);
      const playGroups = list(data.vod_play_from_list).map((code, groupIndex) => ({
        id: text(code) || 'line-' + (groupIndex + 1),
        name: LINE_NAMES[text(code)] || text(code) || '线路 ' + (groupIndex + 1),
        episodes: list(urls[groupIndex] && urls[groupIndex].urls).map((episode, episodeIndex) => ({
          id: text(episode.episode_index) || String(episodeIndex + 1),
          name: text(episode.name) || String(episodeIndex + 1),
          playId: JSON.stringify({
            vodId: id,
            sourceId: sourceIds[text(code)],
            episodeIndex: text(episode.episode_index),
          }),
        })).filter(episode => episode.playId),
      })).filter(group => group.episodes.length);
      if (!playGroups.length) throw new Error('tvbcloud.episodes-unavailable');
      return {
        id,
        sourceKey,
        name: text(value.vod_name) || id,
        ...(text(value.vod_pic || value.vod_pic_slide) ? {poster: absolute(value.vod_pic || value.vod_pic_slide)} : {}),
        remark: text(value.vod_remarks),
        year: text(value.vod_year),
        area: text(value.vod_area),
        actors: text(value.vod_actor),
        director: text(value.vod_director),
        description: text(value.vod_content),
        headers: PLAY_HEADERS,
        playGroups,
      };
    },
    async play(input) {
      let descriptor;
      try { descriptor = JSON.parse(text(input.playId)); }
      catch (_) { throw new Error('tvbcloud.play-invalid'); }
      if (!text(descriptor.vodId) || !text(descriptor.sourceId)) throw new Error('tvbcloud.play-invalid');
      const data = await request('vodParse', {
        vod_id: text(descriptor.vodId),
        player_source_id: text(descriptor.sourceId),
        episode_index: text(descriptor.episodeIndex),
      });
      const url = text(data.play_url);
      if (!/^https?:\/\//i.test(url)) throw new Error('tvbcloud.play-unavailable');
      return {sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl: url, headers: PLAY_HEADERS, parse: false};
    },
    async destroy() { sourceKey = ''; baseUrl = DEFAULT_HOST; sourceHeaders = {}; },
  });
})();
