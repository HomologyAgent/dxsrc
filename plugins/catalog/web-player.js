/* global dxplay */
(() => {
  'use strict';

  const PRESETS = Object.freeze({
    duoduo: Object.freeze({
      baseUrl: 'https://duoduosdf12223234334.top',
      webSign: 'ddtvf65f3a83d6d9ad6f',
      xClient: '8f3d2a1c7b6e5d4c9a0b1f2e3d4c5b6a',
      device: 'com.web.player',
      finger: 'WF-2c064bc5b3400788f31b848849bc3a60f835423ba2dfe69d7ea93974c216e4f2',
      signingKey: 'WEB-50a8e9c84a1dc05669a692ded99a2dac46527229e607a7be15db88dbc59059d1',
      typeNames: Object.freeze({'1': '电影', '2': '剧集', '3': '动漫', '4': '综艺'}),
    }),
  });
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  let sourceKey = '';
  let preset = PRESETS.duoduo;
  let apiBase = '';

  const text = value => value === undefined || value === null ? '' : String(value);
  const list = value => Array.isArray(value) ? value : [];
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const mapItem = value => {
    const item = object(value);
    const id = text(item.vod_id);
    const name = text(item.vod_name || id);
    if (!id || !name) return null;
    const poster = text(item.vod_pic);
    const remark = text(item.vod_remarks);
    return {id, sourceKey, name, ...(poster ? {poster} : {}), ...(remark ? {remark} : {})};
  };
  const mapItems = values => list(values).map(mapItem).filter(Boolean);
  const requestJson = async path => {
    const response = await dxplay.fetch({
      url: apiBase + path,
      headers: {'User-Agent': USER_AGENT, Accept: 'application/json', 'X-Client': preset.xClient, 'web-sign': preset.webSign},
    });
    if (response.status < 200 || response.status >= 300) throw new Error('webplayer.request-failed');
    let payload;
    try { payload = JSON.parse(response.body); } catch (_) { throw new Error('webplayer.response-invalid'); }
    if (!payload || Number(payload.code) !== 200 || payload.data === undefined) throw new Error('webplayer.remote-failed');
    return payload;
  };
  const filters = () => {
    const options = values => values.map(value => ({name: value || '全部', value}));
    const years = [''].concat(Array.from({length: 11}, (_, index) => String(new Date().getFullYear() - index)));
    const areas = ['', '大陆', '港台', '美国', '日本', '韩国', '泰国', '其他'];
    const sorts = [{name: '时间', value: 'time'}, {name: '人气', value: 'hits'}, {name: '评分', value: 'score'}];
    const classes = {
      '1': ['', '动作', '喜剧', '爱情', '科幻', '恐怖', '剧情', '战争', '犯罪', '奇幻', '冒险', '悬疑', '动画'],
      '2': ['', '剧情', '喜剧', '爱情', '科幻', '悬疑', '恐怖', '古装', '都市', '家庭', '战争', '犯罪', '历史'],
      '3': ['', '国产动漫', '日本动漫', '欧美动漫', '海外动漫'],
      '4': [],
    };
    const result = Object.create(null);
    for (const id of Object.keys(preset.typeNames)) {
      result[id] = [
        ...(classes[id].length ? [{key: 'class', name: '类型', initialValue: '', options: options(classes[id])}] : []),
        {key: 'area', name: '地区', initialValue: '', options: options(areas)},
        {key: 'sort', name: '排序', initialValue: 'hits', options: sorts},
        {key: 'year', name: '年份', initialValue: '', options: options(years)},
      ];
    }
    return result;
  };
  const encodeVarint = raw => {
    let value = Math.max(0, Math.floor(Number(raw) || 0));
    const output = [];
    while (value >= 128) { output.push((value % 128) + 128); value = Math.floor(value / 128); }
    output.push(value);
    return output;
  };
  const fieldBytes = (field, value) => {
    const bytes = dxplay.codec.utf8Encode(text(value));
    return encodeVarint(field * 8 + 2).concat(encodeVarint(bytes.length), Array.from(bytes));
  };
  const fieldNumber = (field, value) => encodeVarint(field * 8).concat(encodeVarint(value));
  const nonce = () => {
    const hex = '0123456789abcdef';
    let value = '';
    for (let index = 0; index < 32; index += 1) value += hex[Math.floor(Math.random() * 16)];
    return value;
  };
  const decodeFields = bytes => {
    let offset = 0;
    const fields = Object.create(null);
    const readVarint = () => {
      let value = 0, multiplier = 1;
      while (offset < bytes.length) {
        const current = bytes[offset++];
        value += (current % 128) * multiplier;
        if (current < 128) return value;
        multiplier *= 128;
        if (multiplier > Number.MAX_SAFE_INTEGER) throw new Error('webplayer.protobuf-invalid');
      }
      throw new Error('webplayer.protobuf-invalid');
    };
    while (offset < bytes.length) {
      const key = readVarint();
      const field = Math.floor(key / 8), wire = key % 8;
      if (wire === 0) fields[field] = readVarint();
      else if (wire === 2) {
        const length = readVarint();
        if (length < 0 || offset + length > bytes.length) throw new Error('webplayer.protobuf-invalid');
        fields[field] = bytes.slice(offset, offset + length);
        offset += length;
      } else if (wire === 1) offset += 8;
      else if (wire === 5) offset += 4;
      else throw new Error('webplayer.protobuf-invalid');
      if (offset > bytes.length) throw new Error('webplayer.protobuf-invalid');
    }
    return fields;
  };
  const resolveToken = async (token, playFrom) => {
    const timestamp = Date.now();
    const random = nonce();
    const canonical = 'finger=' + preset.finger + '&id=' + preset.device + '&nonce=' + random
      + '&sk=' + preset.signingKey + '&time=' + timestamp + '&v=1';
    const signature = dxplay.crypto.sha256(canonical).toUpperCase();
    const values = [].concat(
      fieldBytes(1, token), fieldBytes(2, playFrom), fieldNumber(3, timestamp),
      fieldBytes(4, random), fieldBytes(5, signature), fieldBytes(6, preset.device), fieldNumber(7, 1),
    );
    const response = await dxplay.fetch({
      url: apiBase + '/decode/url', method: 'POST',
      headers: {'Content-Type': 'application/x-protobuf', Accept: 'application/x-protobuf', 'User-Agent': USER_AGENT, 'X-Client': preset.xClient, 'web-sign': preset.webSign},
      bodyBase64: dxplay.codec.base64Encode(Uint8Array.from(values)), responseType: 'base64',
    });
    if (response.status < 200 || response.status >= 300 || !response.bodyBase64) throw new Error('webplayer.decode-failed');
    const fields = decodeFields(dxplay.codec.base64Decode(response.bodyBase64));
    const url = fields[3] ? dxplay.codec.utf8Decode(fields[3]) : '';
    if (!/^https?:\/\//i.test(url)) throw new Error('webplayer.play-unavailable');
    return url;
  };
  const stripHtml = value => text(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  dxplay.register({
    id: 'org.dxsrc.cluntop.web-player',
    name: 'Web Player catalog',
    description: 'Semantic rewrite of the public Web Player catalog API and its bounded protobuf native-playback resolver.',
    version: '1.0.0',
    protocol: 'catalog@1',

    async init(input) {
      sourceKey = text(input.sourceKey) || 'webplayer';
      const extension = object(input.extension);
      preset = PRESETS[text(extension.preset)] || PRESETS.duoduo;
      const base = text(extension.baseUrl || preset.baseUrl).replace(/\/+$/, '');
      if (!/^https?:\/\//i.test(base)) throw new Error('webplayer.base-invalid');
      apiBase = base + '/api.php/web';
      return {ready: true};
    },

    async home() {
      const payload = await requestJson('/index/home');
      const data = object(payload.data);
      const byType = filters();
      const categories = list(data.categories).map(value => {
        const id = text(value.type_id);
        const name = text(value.type_name);
        return id && name ? {id, name, ...(byType[id] ? {filters: byType[id]} : {})} : null;
      }).filter(Boolean);
      const seen = Object.create(null), featured = [];
      const append = value => {
        const item = mapItem(value);
        if (item && !seen[item.id]) { seen[item.id] = true; featured.push(item); }
      };
      for (const category of list(data.categories)) for (const value of list(category.videos)) append(value);
      for (const value of list(data.recommend)) append(value);
      return {categories, featured};
    },

    async category(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const selected = object(input.filters);
      const typeName = preset.typeNames[text(input.categoryId)] || text(input.categoryId);
      const params = [['type_name', typeName], ['page', String(page)], ['sort', text(selected.sort) || 'hits']];
      for (const key of ['area', 'class', 'year']) if (text(selected[key])) params.push([key, text(selected[key])]);
      const path = '/filter/vod?' + params.map(([key, value]) => encodeURIComponent(key) + '=' + encodeURIComponent(value)).join('&');
      const payload = await requestJson(path);
      const items = mapItems(payload.data);
      const limit = Math.max(1, Number(payload.limit) || 24);
      return {page, pageCount: items.length >= limit ? page + 1 : page, items};
    },

    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const payload = await requestJson('/search/index?wd=' + encodeURIComponent(text(input.keyword)) + '&page=' + page);
      return {page, items: mapItems(payload.data)};
    },

    async detail(input) {
      const id = text(input.id);
      if (!id) throw new Error('webplayer.item-invalid');
      const payload = await requestJson('/vod/get_detail?vod_id=' + encodeURIComponent(id));
      const values = list(payload.data);
      const vod = object(values.length ? values[0] : payload.data);
      if (!text(vod.vod_id)) throw new Error('webplayer.item-not-found');
      const showNames = Object.create(null);
      for (const player of list(payload.vodplayer)) if (text(player.from)) showNames[text(player.from)] = text(player.show || player.from);
      const froms = text(vod.vod_play_from).split('$$$');
      const urls = text(vod.vod_play_url).split('$$$');
      const playGroups = froms.map((from, groupIndex) => {
        const episodes = text(urls[groupIndex]).split('#').map((entry, episodeIndex) => {
          const split = entry.indexOf('$');
          if (split < 1) return null;
          const name = entry.slice(0, split), token = entry.slice(split + 1);
          return token ? {id: String(episodeIndex + 1), name: name || String(episodeIndex + 1), playId: JSON.stringify({token, playFrom: from})} : null;
        }).filter(Boolean);
        return episodes.length ? {id: from || 'line-' + (groupIndex + 1), name: showNames[from] || from || '线路 ' + (groupIndex + 1), episodes} : null;
      }).filter(Boolean);
      if (!playGroups.length) throw new Error('webplayer.episodes-unavailable');
      const poster = text(vod.vod_pic);
      return {
        id: text(vod.vod_id), sourceKey, name: text(vod.vod_name) || id, ...(poster ? {poster} : {}),
        remark: text(vod.vod_remarks), year: text(vod.vod_year), area: text(vod.vod_area),
        actors: text(vod.vod_actor), director: text(vod.vod_director), description: stripHtml(vod.vod_content), playGroups,
      };
    },

    async play(input) {
      let descriptor;
      try { descriptor = JSON.parse(text(input.playId)); } catch (_) { throw new Error('webplayer.play-invalid'); }
      const token = text(descriptor.token), playFrom = text(descriptor.playFrom);
      if (!token || !playFrom) throw new Error('webplayer.play-invalid');
      const url = await resolveToken(token, playFrom);
      const match = url.match(/^(https?:\/\/[^/]+)/i);
      return {
        sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl: url,
        headers: {'User-Agent': USER_AGENT, Referer: match ? match[1] : preset.baseUrl}, parse: false,
      };
    },

    async destroy() { sourceKey = ''; preset = PRESETS.duoduo; apiBase = ''; },
  });
})();
