/* global dxplay */
(() => {
  'use strict';

  const DEFAULT_DISCOVERY = 'https://app-site.ecoliving168.com/domain_v5.json';
  const PUBLIC_KEY = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA02F/kPg5A2NX4qZ5JSns+bjhVMCC6JbTiTKpbgNgiXU+Kkorg6Dj76gS68gB8llhbUKCXjIdygnHPrxVHWfzmzisq9P9awmXBkCk74Skglx2LKHa/mNz9ivg6YzQ5pQFUEWS0DfomGBXVtqvBlOXMCRxp69oWaMsnfjnBV+0J7vHbXzUIkqBLdXSNfM9Ag5qdRDrJC3CqB65EJ3ARWVzZTTcXSdMW9i3qzEZPawPNPe5yPYbMZIoXLcrqvEZnRK1oak67/ihf7iwPJqdc+68ZYEmmdqwunOvRdjq89fQMVelmqcRD9RYe08v+xDxG9Co9z7hcXGTsUquMxkh29uNawIDAQAB';
  const SIGNING_KEY_BASE64 = 'NjM1YTU4MGZjYjVkYzZlNjBjYWEzOWMzMWE3YmRlNDg=';
  const CONFIG_KEY = 'e6d5de5fcc51f53d';
  const CONFIG_IV = '2f13eef7dfc6c613';
  const mediaPattern = /\.(?:m3u8|mp4)(?:$|[?#])/i;
  const filterNames = {sort: '排序', class: '类型', area: '地区', year: '年份'};
  let sourceKey = '';
  let sourceHeaders = {};
  let origin = '';
  let deviceId = '';
  let pureMode = 1;
  let screenConfiguration = null;

  const text = value => value === undefined || value === null ? '' : String(value);
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const list = value => Array.isArray(value) ? value : [];
  const clean = value => text(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const trimSlash = value => text(value).trim().replace(/\/+$/, '');
  const randomId = length => {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let value = '';
    while (value.length < length) value += alphabet[Math.floor(Math.random() * alphabet.length)];
    return value;
  };
  const parseJson = (value, code) => {
    try { return JSON.parse(text(value)); }
    catch (_) { throw new Error(code); }
  };
  const protocolHeaders = timestamp => Object.assign({}, sourceHeaders, {
    'User-Agent': 'Android',
    Accept: 'application/prs.55App.v2+json',
    timestamp,
    'x-client-setting': JSON.stringify({'pure-mode': pureMode}),
    'x-client-uuid': '{"device_id":' + deviceId
      + '}, "type":1,"brand":"DXPlay", "model":"TV", "system_version":30, "sdk_version":"3.1.0.7"}',
    'x-client-version': '3096 ',
  });
  const requestJson = async (path, values) => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const payload = Object.assign({}, object(values), {timestamp});
    const pack = dxplay.crypto.rsaEncrypt({
      padding: 'pkcs1',
      text: JSON.stringify(payload),
      publicKeyBase64: PUBLIC_KEY,
    }).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const signature = dxplay.crypto.hmacMd5({keyBase64: SIGNING_KEY_BASE64, text: pack});
    const response = await dxplay.fetch({
      url: origin + path + '?pack=' + pack + '&signature=' + signature,
      headers: protocolHeaders(timestamp),
    });
    if (response.status < 200 || response.status >= 300) throw new Error('hunter.request-failed');
    return parseJson(response.body, 'hunter.response-invalid');
  };
  const requestConfiguration = async () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const payload = {timestamp};
    const pack = dxplay.crypto.rsaEncrypt({
      padding: 'pkcs1', text: JSON.stringify(payload), publicKeyBase64: PUBLIC_KEY,
    }).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const signature = dxplay.crypto.hmacMd5({keyBase64: SIGNING_KEY_BASE64, text: pack});
    const response = await dxplay.fetch({
      url: origin + '/api/v1/app/config?pack=' + pack + '&signature=' + signature,
      headers: protocolHeaders(timestamp),
    });
    if (response.status < 200 || response.status >= 300) throw new Error('hunter.configuration-failed');
    const encoded = text(response.body).replace(/-/g, '+').replace(/_/g, '/');
    const padded = encoded + '='.repeat((4 - encoded.length % 4) % 4);
    const decrypted = dxplay.crypto.aesDecrypt({
      mode: 'cbc', base64: padded, key: CONFIG_KEY, iv: CONFIG_IV,
    });
    return object(object(parseJson(decrypted, 'hunter.configuration-invalid')).data).movie_screen;
  };
  const ensureConfiguration = async () => {
    if (!screenConfiguration) screenConfiguration = object(await requestConfiguration());
    return screenConfiguration;
  };
  const item = value => {
    const data = object(value);
    const id = text(data.id || data.click).trim();
    const name = clean(data.name || data.title);
    if (!id || !name) return null;
    const poster = text(data.cover || data.image).trim();
    const remark = clean(data.dynamic || data.sub_title || data.label || data.year);
    return {
      id,
      sourceKey,
      name,
      ...(poster ? {poster} : {}),
      ...(remark ? {remark} : {}),
    };
  };
  const mapItems = values => list(values).map(item).filter(Boolean);
  const mapFilters = (type, configuration) => {
    const result = [];
    const sortOptions = list(configuration.sort).slice(1).map(value => ({
      name: clean(object(value).name), value: text(object(value).value),
    })).filter(value => value.name && value.value);
    if (sortOptions.length) result.push({key: 'sort', name: filterNames.sort, options: sortOptions});
    for (const key of ['class', 'area', 'year']) {
      const options = list(type[key]).slice(1).map(value => ({name: clean(value), value: text(value)}))
        .filter(value => value.name);
      if (options.length) result.push({key, name: filterNames[key], options});
    }
    return result;
  };
  const episodeDescriptor = episode => {
    const value = object(episode);
    const playUrl = text(value.play_url).trim();
    if (mediaPattern.test(playUrl)) return {url: playUrl};
    return {
      fromCode: text(value.from_code),
      playUrl,
      episodeId: text(value.episode_id),
    };
  };

  dxplay.register({
    id: 'org.dxsrc.python.hunter-video',
    name: 'Hunter video',
    description: 'Readable shared rewrite of the Hunter and Train Python catalog family with native playback.',
    version: '1.0.0',
    protocol: 'catalog@1',

    async init(input) {
      sourceKey = text(input.sourceKey).trim();
      sourceHeaders = object(input.headers);
      const extension = object(input.extension);
      pureMode = Number(extension.pureMode) === 0 ? 0 : 1;
      deviceId = randomId(32);
      origin = trimSlash(extension.host);
      if (!origin) {
        const discoveryUrl = text(extension.discoveryUrl).trim() || DEFAULT_DISCOVERY;
        const response = await dxplay.fetch({
          url: discoveryUrl,
          headers: {'User-Agent': 'okhttp/4.9.2'},
        });
        if (response.status < 200 || response.status >= 300) throw new Error('hunter.discovery-failed');
        const discovered = trimSlash(object(parseJson(response.body, 'hunter.discovery-invalid')).api_service)
          .replace(/\/api$/, '');
        if (/^https?:\/\//i.test(discovered)) origin = discovered;
      }
      if (!sourceKey || !/^https?:\/\//i.test(origin)
        || !dxplay.crypto || typeof dxplay.crypto.rsaEncrypt !== 'function'
        || typeof dxplay.crypto.hmacMd5 !== 'function') {
        throw new Error('hunter.configuration-invalid');
      }
      screenConfiguration = null;
      return {ready: true};
    },
    async home() {
      const [configuration, home] = await Promise.all([
        ensureConfiguration(), requestJson('/api/v1/movie/index_recommend'),
      ]);
      const categories = list(configuration.filter).map(value => {
        const data = object(value);
        const filters = mapFilters(data, configuration);
        return {
          id: text(data.id),
          name: clean(data.name),
          ...(filters.length ? {filters} : {}),
        };
      }).filter(value => value.id && value.name);
      const featured = list(object(home).data).flatMap(value => mapItems(object(value).list));
      if (!categories.length || !featured.length) throw new Error('hunter.home-unavailable');
      return {categories, featured};
    },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const selected = object(input.filters);
      const result = object(await requestJson('/api/v1/movie/screen/list', {
        type_id: text(input.categoryId),
        sort: text(selected.sort) || 'by_default',
        class: text(selected.class) || '类型',
        area: text(selected.area) || '地区',
        year: text(selected.year) || '年份',
        page: String(page),
        pageSize: '21',
      })).data;
      const items = mapItems(object(result).list);
      return {page, pageCount: items.length ? page + 1 : page, items};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const keyword = text(input.keyword).trim();
      if (!keyword) return {page, pageCount: page, items: []};
      const result = object(await requestJson('/api/v1/movie/search', {
        keyword,
        sort: '',
        type_id: '0',
        page: String(page),
        pageSize: '10',
        res_type: 'by_movie_name',
      })).data;
      const items = mapItems(object(result).list);
      return {page, pageCount: items.length ? page + 1 : page, items};
    },
    async detail(input) {
      const id = text(input.id).trim();
      const data = object(object(await requestJson('/api/v1/movie/detail', {id})).data);
      const lines = await Promise.all(list(data.play_from).map(async (value, lineIndex) => {
        const line = object(value);
        let episodes = list(line.list);
        if (!episodes.length && line.code) {
          episodes = list(object(await requestJson('/api/v1/movie_addr/list', {
            movie_id: id, from_code: text(line.code),
          })).data);
        }
        const mapped = episodes.map((episode, episodeIndex) => {
          const entry = object(episode);
          const descriptor = episodeDescriptor(entry);
          if (!descriptor.url && (!descriptor.fromCode || !descriptor.playUrl || !descriptor.episodeId)) return null;
          return {
            id: text(entry.episode_id) || String(episodeIndex + 1),
            name: clean(entry.episode_name) || String(episodeIndex + 1),
            playId: JSON.stringify(descriptor),
          };
        }).filter(Boolean);
        return mapped.length ? {
          id: text(line.code) || String(lineIndex + 1),
          name: clean(line.name) || String(lineIndex + 1),
          episodes: mapped,
        } : null;
      }));
      const playGroups = lines.filter(Boolean);
      if (!clean(data.name) || !playGroups.length) throw new Error('hunter.detail-unavailable');
      const poster = text(data.cover || data.image).trim();
      return {
        id,
        sourceKey,
        name: clean(data.name),
        ...(poster ? {poster} : {}),
        ...(data.year ? {year: text(data.year)} : {}),
        ...(data.area ? {area: clean(data.area)} : {}),
        ...(data.type_name ? {category: clean(data.type_name)} : {}),
        ...(data.actor ? {actors: clean(data.actor)} : {}),
        ...(data.director ? {director: clean(data.director)} : {}),
        ...(data.dynamic ? {remark: clean(data.dynamic)} : {}),
        description: clean(data.content),
        playGroups,
      };
    },
    async play(input) {
      let descriptor;
      try { descriptor = object(JSON.parse(text(input.playId))); }
      catch (_) { throw new Error('hunter.play-id-invalid'); }
      let rawUrl = text(descriptor.url).trim();
      if (!rawUrl && descriptor.fromCode && descriptor.playUrl && descriptor.episodeId) {
        const data = object(object(await requestJson('/api/v1/movie_addr/parse_url', {
          from_code: text(descriptor.fromCode),
          play_url: text(descriptor.playUrl),
          episode_id: text(descriptor.episodeId),
          type: 'play',
        })).data);
        rawUrl = text(data.play_url || data.download_url).trim();
      }
      if (!/^https?:\/\//i.test(rawUrl) || /\.(?:jpg|jpeg|png)(?:$|[?#])/i.test(rawUrl)) {
        throw new Error('hunter.play-unavailable');
      }
      return {
        sourceKey,
        flag: text(input.flag),
        episodeId: text(input.episodeId),
        rawUrl,
        headers: {'User-Agent': 'okhttp/4.9.2'},
        parse: false,
      };
    },
    async destroy() {
      sourceKey = '';
      sourceHeaders = {};
      origin = '';
      deviceId = '';
      pureMode = 1;
      screenConfiguration = null;
    },
  });
})();
