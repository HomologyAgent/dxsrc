/* global dxplay */
(() => {
  'use strict';

  const DEFAULT_ENDPOINT = 'http://www.xn--ihq545aq7p.com/api/2026/fishhxq.php';
  const KEY = 'FishHxq@Transit!';
  const IV = 'Hxqfish20260000!';
  const CLIENT_MARKER = 'Fish!HxqFish2026@';
  const QUALITIES = [
    {id: '11', name: '蓝光HDR'}, {id: '10', name: '蓝光1080P'},
    {id: '2', name: '高清'}, {id: '1', name: '标清'},
  ];
  let sourceKey = '';
  let endpoint = DEFAULT_ENDPOINT;
  let sourceHeaders = {};
  const rewardTokens = {};

  const text = value => value === undefined || value === null ? '' : String(value);
  const list = value => Array.isArray(value) ? value : [];
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const basePayload = () => ({v7m: CLIENT_MARKER});
  const parseJson = value => {
    try { return JSON.parse(text(value)); } catch (_) { throw new Error('hxq.response-invalid'); }
  };
  const encrypt = value => dxplay.crypto.aesEncrypt({
    mode: 'cbc', text: JSON.stringify(value), key: KEY, iv: IV,
  });
  const decrypt = value => parseJson(dxplay.crypto.aesDecrypt({
    mode: 'cbc', base64: text(value), key: KEY, iv: IV,
  }));
  const requestJson = async request => {
    const response = await dxplay.fetch(request);
    if (response.status < 200 || response.status >= 300) throw new Error('hxq.request-failed');
    return parseJson(response.body);
  };
  const php = async (operation, payload) => {
    const envelope = await requestJson({
      url: endpoint + '?do=' + encodeURIComponent(operation), method: 'POST',
      headers: Object.assign({'content-type': 'application/json'}, sourceHeaders),
      body: JSON.stringify({moyufucking: encrypt(payload)}),
    });
    if (!envelope.moyufucking) throw new Error('hxq.response-invalid');
    const value = decrypt(envelope.moyufucking);
    if (value.error) throw new Error('hxq.upstream-rejected');
    return value;
  };
  const requestDescriptor = async (path, params, headerType) => {
    const descriptor = await php('fishhxq2', Object.assign(basePayload(), {
      path, params: object(params), htype: headerType || 'sign',
    }));
    if (!/^https?:\/\//i.test(text(descriptor.url))) throw new Error('hxq.response-invalid');
    return {url: text(descriptor.url), headers: object(descriptor.headers)};
  };
  const callDescriptor = async (descriptor, method, body) => requestJson({
    url: descriptor.url, method: method || 'GET', headers: descriptor.headers,
    ...(body === undefined ? {} : {body: text(body)}),
  });
  const decodePayload = async value => {
    if (!value || text(value.data).length <= 20) throw new Error('hxq.response-invalid');
    const decoded = await php('fishhxq4', Object.assign(basePayload(), {
      data: text(value.data), ts: text(value.ts),
    }));
    return object(decoded.result);
  };
  const signedCall = async (path, params) => {
    const response = await callDescriptor(await requestDescriptor(path, params, 'sign'));
    if (Number(response.rescode) !== 0) throw new Error('hxq.upstream-rejected');
    return response;
  };
  const catalogCall = async (path, params) => decodePayload(await signedCall(path, params));
  const posterOf = value => {
    const image = value && value.image;
    if (image && typeof image === 'object') return text(image.url || image.thumb);
    return text(image || value && (value.poster || value.thumb));
  };
  const mapItem = value => ({
    id: text(value && value.sid), sourceKey,
    name: text(value && value.name) || text(value && value.sid),
    ...(posterOf(value) ? {poster: posterOf(value)} : {}),
    ...(text(value && (value.conerMemo || value.detailMemo || value.shorthand))
      ? {remark: text(value.conerMemo || value.detailMemo || value.shorthand)} : {}),
  });
  const mapItems = values => list(values).map(mapItem).filter(value => value.id && value.name);
  const filtersOf = value => {
    const filters = [];
    const mapFilter = (key, name, values) => {
      const options = list(values).map(entry => ({name: text(entry && entry.name), value: text(entry && entry.value)}))
        .filter(entry => entry.name && entry.value);
      if (options.length) filters.push({key, name, initialValue: options[0].value, options});
    };
    mapFilter('sort', '排序', value.sorts);
    mapFilter('year', '年份', value.years);
    return filters;
  };
  const categoriesOf = (value, includeFilters) => {
    const filters = includeFilters ? filtersOf(value) : [];
    const categories = [];
    for (const group of list(value.groups)) {
      const groupId = text(group && group.stype);
      if (!groupId) continue;
      categories.push({id: groupId, name: text(group.name) + '全部', ...(filters.length ? {filters} : {})});
      let added = 0;
      for (const category of list(group.cates)) {
        const id = text(category && category.value), name = text(category && category.name);
        if (!id || id === '-1' || !name || name === '全部' || name === '伦理') continue;
        categories.push({id: groupId + '_' + id, name, ...(filters.length ? {filters} : {})});
        added += 1;
        if (added >= 5) break;
      }
    }
    return categories;
  };
  const categoryParams = input => {
    const categoryId = text(input.categoryId), split = categoryId.indexOf('_');
    const filters = object(input.filters);
    return {
      stype: split < 0 ? categoryId : categoryId.slice(0, split), page: String(Math.max(1, Number(input.page) || 1)),
      ...(split < 0 ? {} : {cid: categoryId.slice(split + 1)}),
      ...(text(filters.sort) ? {sort: text(filters.sort)} : {}),
      ...(text(filters.year) ? {year: text(filters.year)} : {}),
    };
  };
  const searchCall = async (keyword, page) => {
    const descriptor = await php('fishhxq2', Object.assign(basePayload(), {
      keyword, type: '0', page: String(page),
    }));
    const rawUrl = text(descriptor.url), query = rawUrl.indexOf('?');
    if (query < 0) throw new Error('hxq.response-invalid');
    const url = rawUrl.slice(0, query) + '/api/search/s4' + rawUrl.slice(query)
      + '&srefer=search&type=0&page=' + page + '&k=' + encodeURIComponent(keyword);
    const response = await requestJson({url, headers: object(descriptor.headers)});
    if (Number(response.rescode) !== 0) throw new Error('hxq.upstream-rejected');
    return decodePayload(response);
  };
  const episodeSources = async pid => {
    const value = await catalogCall('/api/series2/episode/detail', {pid, refer: ''});
    const playItem = object(value.playItem);
    const rawSources = playItem.sources;
    if (Array.isArray(rawSources)) return rawSources;
    if (typeof rawSources === 'string') {
      try { return list(JSON.parse(rawSources)); } catch (_) { return []; }
    }
    return [];
  };
  const rewardToken = async pid => {
    const cached = rewardTokens[pid];
    if (cached && Date.now() < cached.expiresAt) return cached.value;
    const scene = 'ad_series_play';
    const challenge = await callDescriptor(await requestDescriptor('/api/carp/reward/v2', {scene}, 'login'));
    if (Number(challenge.rescode) !== 0) return '';
    let traceId = text(challenge.traceId);
    if (!traceId && text(challenge.data).length > 20) traceId = text((await decodePayload(challenge)).traceId);
    if (!traceId) return '';
    const descriptor = await php('fishhxq6', Object.assign(basePayload(), {traceId, scene, pid}));
    if (!/^https?:\/\//i.test(text(descriptor.url))) return '';
    const response = await requestJson({
      url: text(descriptor.url), method: 'POST', headers: object(descriptor.headers), body: text(descriptor.body),
    });
    if (Number(response.rescode) !== 0) return '';
    const result = text(response.data).length > 20 ? await decodePayload(response) : object(response);
    const info = object(result.rewardTokenInfo), token = text(info.token);
    if (!token) return '';
    const seconds = Math.max(60, Number(info.expireTime || info.expires) || 21600);
    rewardTokens[pid] = {value: token, expiresAt: Date.now() + seconds * 1000 - 60000};
    return token;
  };
  const resolveEpisode = async descriptor => {
    let scid = text(descriptor.scid);
    if (!scid) scid = text((await episodeSources(text(descriptor.pid)))[0]?.scid);
    if (!scid) throw new Error('hxq.play-source-unavailable');
    const params = {pid: text(descriptor.pid), scid, sq: text(descriptor.quality), re: '1'};
    let response = await callDescriptor(await requestDescriptor('/api/series/rslvV4', params, 'sign'));
    if (Number(response.rescode) === 10401) {
      const token = await rewardToken(text(descriptor.pid));
      if (token) response = await callDescriptor(await requestDescriptor('/api/series/rslvV4', Object.assign(params, {ttk: token}), 'sign'));
    }
    if (Number(response.rescode) !== 0) throw new Error('hxq.play-unavailable');
    const urls = [];
    for (const part of list(response.datas)) {
      if (!text(part && part.data)) continue;
      const decoded = await php('fishhxq5', Object.assign(basePayload(), {data: text(part.data)}));
      const url = text(decoded.result && decoded.result.playUrl);
      if (/^https?:\/\//i.test(url)) urls.push(url);
    }
    if (urls.length !== 1) {
      throw new Error(urls.length ? 'hxq.segmented-playlist-unsupported' : 'hxq.play-unavailable');
    }
    return urls[0];
  };
  const cleanHtml = value => text(value).split('</p>')[0]
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&hellip;/g, '…')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();

  dxplay.register({
    id: 'org.dxsrc.qist.hxq',
    name: 'Hxq catalog family',
    description: 'Readable rewrite of the FishHxq PHP-mediated Korean catalog and playback protocol.',
    version: '1.0.0',
    protocol: 'catalog@1',

    async init(input) {
      sourceKey = text(input.sourceKey) || 'hxq';
      sourceHeaders = object(input.headers);
      const extension = input.extension;
      endpoint = (typeof extension === 'string' ? extension : text(extension && (extension.url || extension.endpoint))).trim() || DEFAULT_ENDPOINT;
      endpoint = endpoint.replace('www.小不点.com', 'www.xn--ihq545aq7p.com').replace(/\/+$/, '');
      if (!/^https?:\/\//i.test(endpoint)) throw new Error('hxq.configuration-invalid');
      await php('fishhxq1', basePayload());
      return {ready: true};
    },
    async home(input) {
      const value = await catalogCall('/api/series2/arrange/cate', {stype: '1', page: '1'});
      return {categories: categoriesOf(value, Boolean(input.includeFilters)), featured: mapItems(value.seriesList).slice(0, 20)};
    },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1), value = await catalogCall('/api/series2/arrange/cate', categoryParams(input));
      return {page, pageCount: Number(value.more) > 0 ? page + 1 : page, items: mapItems(value.seriesList)};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1), value = await searchCall(text(input.keyword), page);
      const items = mapItems(value.seriesList);
      return {page, ...(items.length ? {pageCount: page + 1} : {pageCount: page}), items};
    },
    async detail(input) {
      const response = await signedCall('/api/series/detail', {sid: text(input.id)});
      const series = object(response.series), playItems = list(response.playItems);
      if (!series.sid || !series.name || !playItems.length) throw new Error('hxq.item-not-found');
      const playGroups = QUALITIES.map(quality => ({
        id: quality.id, name: quality.name,
        episodes: playItems.map((episode, index) => ({
          id: text(episode.pid) || String(index + 1),
          name: text(episode.title) || '第' + (Number(episode.serialNo) || index + 1) + '集',
          playId: JSON.stringify({pid: text(episode.pid), quality: quality.id}),
        })).filter(episode => parseJson(episode.playId).pid),
      })).filter(group => group.episodes.length);
      const categoryNames = {1: '韩剧', 2: '综艺', 3: '电影'};
      const count = Number(series.count) || 0;
      const progress = count > 0 ? (series.isFinished ? count + '集全' : '更新至' + count + '集') : '';
      const shorthand = text(series.shorthand);
      return Object.assign(mapItem(series), {
        category: categoryNames[Number(series.category)] || '', area: '韩国',
        actors: text(series.crew).replace(/^(主演[：:]\s*)/, ''),
        year: Number(series.publishTime) > 0 ? String(new Date(Number(series.publishTime)).getFullYear()) : '',
        remark: [progress, shorthand].filter(Boolean).join(' · '), description: cleanHtml(series.intro), playGroups,
      });
    },
    async play(input) {
      let descriptor;
      try { descriptor = parseJson(input.playId); } catch (_) { throw new Error('hxq.play-id-invalid'); }
      const rawUrl = await resolveEpisode(descriptor);
      return {
        sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl,
        headers: {'User-Agent': 'tdc.8260'}, parse: false,
      };
    },
    async destroy() {
      sourceKey = ''; endpoint = DEFAULT_ENDPOINT; sourceHeaders = {};
      for (const key of Object.keys(rewardTokens)) delete rewardTokens[key];
    },
  });
})();
