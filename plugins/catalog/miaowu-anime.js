/* global dxplay */
(() => {
  'use strict';

  const DOMAIN_RECORD = 'https://doh.pub/resolve?name=doh.catw.moe&type=txt';
  const DEFAULT_ORIGIN = 'https://app.nyafun.vip';
  const DATA_KEY = 'c55c019c59a9fbe196ef9fc7d2a0b351';
  const DOMAIN_KEY = '6516c20a87257caa418c721caf6a8c12';
  const PAGE_SIZE = 12;
  let sourceKey = '';
  let sourceHeaders = {};
  let apiBase = '';
  let catalogConfig;

  const text = value => value === undefined || value === null ? '' : String(value);
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const list = value => Array.isArray(value) ? value : [];
  const clean = value => text(value).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ').trim();
  const headers = () => Object.assign({
    'User-Agent': 'Dart/3.5 (dart:io)',
    'Content-Type': 'application/json',
  }, sourceHeaders);
  const parseJson = (value, code) => {
    try { return JSON.parse(text(value).replace(/^\uFEFF/, '')); }
    catch (_) { throw new Error(code); }
  };
  const decrypt = (value, key) => dxplay.crypto.aesDecrypt({
    mode: 'ecb', base64: text(value), key,
  });
  const unpack = response => {
    const envelope = parseJson(response.body, 'miaowu.response-invalid');
    if (Number(envelope.code) && Number(envelope.code) !== 200) throw new Error('miaowu.request-rejected');
    const data = envelope.data;
    if (typeof data !== 'string' || data.length <= 16 || /^[\[{]/.test(data.trim())) return envelope;
    return parseJson(decrypt(data, DATA_KEY), 'miaowu.payload-invalid');
  };
  const fetchJson = async (url, body) => {
    const response = await dxplay.fetch({
      url,
      method: body === undefined ? 'GET' : 'POST',
      headers: headers(),
      ...(body === undefined ? {} : {body: JSON.stringify(body)}),
    });
    if (response.status < 200 || response.status >= 300) throw new Error('miaowu.request-failed');
    return unpack(response);
  };
  const api = (path, body) => fetchJson(apiBase + path, body);
  const normalizeOrigin = value => {
    const candidate = text(value).trim().replace(/\/+$/, '').replace(/\/app\/api$/i, '');
    if (!/^https?:\/\//i.test(candidate)) return '';
    return candidate.replace(/^http:\/\//i, 'https://');
  };
  const discoverOrigin = async () => {
    try {
      const response = await dxplay.fetch({url: DOMAIN_RECORD, headers: headers()});
      if (response.status < 200 || response.status >= 300) return '';
      const payload = parseJson(response.body, 'miaowu.domain-invalid');
      const record = text(list(payload.Answer)[0]?.data).trim().replace(/^"|"$/g, '');
      return normalizeOrigin(decrypt(record, DOMAIN_KEY));
    } catch (_) {
      return '';
    }
  };
  const item = value => {
    const data = object(value);
    const id = text(data.id || data.vod_id).trim();
    const name = clean(data.vod_name);
    if (!id || !name) return null;
    const poster = text(data.vod_pic).trim();
    const remark = clean(data.vod_remarks);
    return {
      id, sourceKey, name,
      ...(poster ? {poster} : {}),
      ...(remark ? {remark} : {}),
    };
  };
  const items = payload => list(payload.filter_vods || payload.search_full).map(item).filter(Boolean);
  const filter = (key, name, values) => {
    const options = [{name: '\u5168\u90e8', value: ''}];
    for (const value of text(values).split(',')) {
      const label = value.trim();
      if (label) options.push({name: label, value: label});
    }
    return options.length > 1 ? {key, name, initialValue: '', options} : null;
  };
  const category = value => {
    const data = object(value);
    const id = text(data.type_id).trim();
    const name = clean(data.type_name);
    const extension = object(data.type_extend);
    const filters = [
      filter('class', '\u7c7b\u578b', extension.class),
      filter('year', '\u5e74\u4efd', extension.year),
    ].filter(Boolean);
    return id && name ? {id, name, ...(filters.length ? {filters} : {})} : null;
  };
  const loadConfig = async () => {
    if (!catalogConfig) catalogConfig = await api('config?platform=android');
    return catalogConfig;
  };
  const categoryPage = async (categoryId, page, filters) => {
    const query = {
      page: String(page),
      sort: text(filters.sort || '0'),
      type: text(categoryId),
      class: text(filters.class),
      year: text(filters.year),
    };
    const path = 'content/filter?' + Object.keys(query)
      .filter(key => query[key] !== '')
      .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(query[key])).join('&');
    return items(await api(path));
  };
  const splitEpisode = (value, index, player) => {
    const raw = text(value).trim();
    if (!raw || raw === 'null') return null;
    const separator = raw.indexOf('$');
    const name = separator >= 0 ? clean(raw.slice(0, separator)) : '\u7b2c' + String(index + 1) + '\u96c6';
    const playId = (separator >= 0 ? raw.slice(separator + 1) : raw).trim();
    return playId ? {id: String(index + 1), name, playId: playId + '|||' + player} : null;
  };

  dxplay.register({
    id: 'org.dxsrc.spider.miaowu-anime',
    name: 'MiaoWu anime',
    description: 'Readable rewrite of the MiaoWu catalog with DNS discovery, encrypted JSON and direct media playback.',
    version: '1.0.0',
    protocol: 'catalog@1',

    async init(input) {
      sourceKey = text(input.sourceKey).trim();
      sourceHeaders = object(input.headers);
      if (!sourceKey) throw new Error('miaowu.source-key-missing');
      if (!dxplay.crypto || typeof dxplay.crypto.aesDecrypt !== 'function') {
        throw new Error('miaowu.crypto-unavailable');
      }
      const extension = object(input.extension);
      const configured = normalizeOrigin(extension.url || (typeof input.extension === 'string' ? input.extension : ''));
      const origin = configured || await discoverOrigin() || DEFAULT_ORIGIN;
      apiBase = origin + '/app/api/';
      catalogConfig = undefined;
      await loadConfig();
      return {ready: true};
    },
    async home() {
      const categories = list((await loadConfig()).ac_vod_type).map(category).filter(Boolean);
      if (!categories.length) throw new Error('miaowu.home-unavailable');
      const featured = await categoryPage(categories[0].id, 1, {});
      return {categories, featured};
    },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const result = await categoryPage(input.categoryId, page, object(input.filters));
      return {page, pageCount: result.length < PAGE_SIZE ? page : page + 1, items: result};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const keyword = text(input.keyword).trim();
      if (!keyword) return {page, pageCount: page, items: []};
      const result = items(await api('search/full?q=' + encodeURIComponent(keyword)));
      return {page, pageCount: page, items: result};
    },
    async detail(input) {
      const id = text(input.id).trim();
      const data = object(await api('vod/' + encodeURIComponent(id)));
      const playGroups = list(data.playerData).map((value, groupIndex) => {
        const group = object(value);
        const player = text(group.player).trim();
        const episodes = list(group.vids).map((episode, index) => splitEpisode(episode, index, player)).filter(Boolean);
        if (!episodes.length) return null;
        return {id: player || String(groupIndex + 1), name: clean(group.name) || '\u7ebf\u8def' + String(groupIndex + 1), episodes};
      }).filter(Boolean);
      if (!playGroups.length) throw new Error('miaowu.detail-unavailable');
      const poster = text(data.vod_pic).trim();
      return {
        id, sourceKey, name: clean(data.vod_name) || id,
        ...(poster ? {poster} : {}),
        ...(data.vod_remarks ? {remark: clean(data.vod_remarks)} : {}),
        ...(data.vod_year ? {year: text(data.vod_year)} : {}),
        ...(data.vod_author ? {director: clean(data.vod_author)} : {}),
        description: clean(data.vod_content),
        playGroups,
      };
    },
    async play(input) {
      const parts = text(input.playId).split('|||');
      let rawUrl = text(parts[0]).replace(/^.*\$/, '').trim();
      const player = text(parts.slice(1).join('|||')).trim();
      if (!/^https?:\/\//i.test(rawUrl) || /mwvod/i.test(rawUrl)) {
        const resolved = object(await api('vod/parse', {vid: rawUrl, player}));
        rawUrl = text(resolved.play_url).trim();
      }
      if (!/^https?:\/\//i.test(rawUrl)) throw new Error('miaowu.play-unavailable');
      return {
        sourceKey,
        flag: text(input.flag),
        episodeId: text(input.episodeId),
        rawUrl,
        headers: headers(),
        parse: false,
      };
    },
    async destroy() {
      sourceKey = '';
      sourceHeaders = {};
      apiBase = '';
      catalogConfig = undefined;
    },
  });
})();
