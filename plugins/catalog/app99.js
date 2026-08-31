/* global dxplay */
(() => {
  'use strict';

  const DEFAULT_EXTENSION = {
    host: 'http://111.180.139.119:19987/app/bn',
    versionName: '6.4.9',
    name: '双子星动漫',
    package: 'com.haiwang.liangxia.my.ym',
    buildNumber: '2001',
    buildSignature: 'A40DA80A59D170CAA950CF15C18C454D47A39B26989D8B640ECD745BA71BF5DC',
    LoginPath: '/app/log',
  };
  const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
  const MEDIA = /\.(?:mp4|m3u8|flv|mkv|avi|ts|mov|mpd|m4a|wmv)(?:\?.*)?$/i;

  let sourceKey = '';
  let extension = DEFAULT_EXTENSION;
  let host = '';
  let uuid = '';
  let userAgent = DEFAULT_USER_AGENT;
  let version = '';
  let userToken = '';
  let categories = [];
  let player = {};
  let parses = [];

  const text = value => value === undefined || value === null ? '' : String(value);
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const list = value => Array.isArray(value) ? value : [];
  const trimSlash = value => text(value).replace(/\/+$/, '');
  const randomBytes = length => {
    const values = new Uint8Array(length);
    for (let index = 0; index < length; index += 1) values[index] = Math.floor(Math.random() * 256);
    return values;
  };
  const concatBytes = (first, second) => {
    const output = new Uint8Array(first.length + second.length);
    output.set(first, 0);
    output.set(second, first.length);
    return output;
  };
  const randomUuid = () => {
    const bytes = randomBytes(16);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16)
      + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
  };
  const parseJson = (value, code) => {
    try { return JSON.parse(value); } catch (_) { throw new Error(code); }
  };
  const encryptBody = value => {
    const ivBytes = randomBytes(16);
    const ivBase64 = dxplay.codec.base64Encode(ivBytes);
    const encrypted = dxplay.crypto.aesEncrypt({
      mode: 'cbc', text: JSON.stringify(value), key: uuid.replace(/-/g, ''), ivBase64,
    });
    return dxplay.codec.base64Encode(concatBytes(ivBytes, dxplay.codec.base64Decode(encrypted)));
  };
  const decryptBody = value => {
    const bytes = dxplay.codec.base64Decode(value);
    if (bytes.length <= 16) throw new Error('app99.response-invalid');
    const binary = dxplay.crypto.aesDecrypt({
      mode: 'cbc', base64: dxplay.codec.base64Encode(bytes.subarray(16)), key: uuid.replace(/-/g, ''),
      ivBase64: dxplay.codec.base64Encode(bytes.subarray(0, 16)), output: 'base64',
    });
    try {
      return dxplay.codec.inflate({format: 'zlib', base64: binary});
    } catch (_) {
      return dxplay.codec.utf8Decode(dxplay.codec.base64Decode(binary));
    }
  };
  const headers = (nonce, timestamp, body, token) => ({
    'User-Agent': userAgent,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    client_type: 'android',
    uuid,
    timestamp,
    sign: dxplay.crypto.sha256(body + ':' + timestamp + ':' + nonce + ':' + token),
    nonce,
    version,
    api_version: 'v1',
  });
  const request = async (path, payload, tokenValue) => {
    const token = tokenValue === undefined ? userToken : text(tokenValue);
    const timestamp = String(Date.now());
    const nonce = dxplay.codec.base64Encode(randomBytes(16));
    const body = encryptBody(Object.assign({}, payload, {token, timestamp, nonce}));
    const response = await dxplay.fetch({
      url: host + path, method: 'POST', headers: headers(nonce, timestamp, body, token), body,
    });
    if (response.status < 200 || response.status >= 300 || !text(response.body)) {
      throw new Error('app99.request-failed');
    }
    return parseJson(decryptBody(response.body), 'app99.response-invalid');
  };
  const item = value => ({
    id: text(value.id), sourceKey, name: text(value.name),
    ...(text(value.pic) ? {poster: text(value.pic)} : {}),
    ...(text(value.remarks) ? {remark: text(value.remarks)} : {}),
  });
  const filter = (key, name, values) => {
    const options = list(values).map(value => ({name: text(value), value: text(value)})).filter(value => value.value);
    return options.length ? {key, name, options} : null;
  };
  const category = value => {
    const extend = object(value.type_extend);
    return {
      id: text(value.id), name: text(value.name),
      filters: [
        filter('class', '类型', extend.class), filter('area', '地区', extend.areas),
        filter('lang', '语言', extend.lang), filter('year', '年份', extend.years),
      ].filter(Boolean),
    };
  };
  const firstDollar = value => {
    const index = value.indexOf('$');
    return index < 0 ? [value, value] : [value.slice(0, index), value.slice(index + 1)];
  };
  const encodePlayId = value => JSON.stringify(value);
  const decodePlayId = value => parseJson(value, 'app99.play-id-invalid');

  dxplay.register({
    id: 'org.dxsrc.jsm.app99',
    name: 'App99 catalog family',
    description: 'Semantic rewrite of the encrypted App99 catalog family in the pinned jsm.json snapshot.',
    version: '1.1.0',
    protocol: 'catalog@1',

    async init(input) {
      sourceKey = text(input.sourceKey) || 'app99';
      extension = Object.assign({}, DEFAULT_EXTENSION, object(input.extension));
      host = trimSlash(extension.host);
      uuid = text(extension.uuid) || randomUuid();
      userAgent = text(extension.ua) || DEFAULT_USER_AGENT;
      version = text(extension.version) || text(extension.versionName);
      if (!host || !version || !text(extension.name) || !text(extension.package)
        || !text(extension.buildNumber) || !text(extension.buildSignature)) {
        throw new Error('app99.extension-invalid');
      }
      const system = await request('/app/systemInit', {
        v: text(extension.versionName), n: text(extension.name), s: text(extension.buildSignature),
        pl: '1', apiVersion: 'v2',
      }, '');
      player = object(system.player);
      parses = list(system.parser_api);
      categories = list(object(system.categorys).data);
      try {
        const installedAt = Date.now();
        const login = await request(text(extension.LoginPath) || '/app/userInfo', {
          os: 'android', name: 'android', version: '15', sdkInt: 35, device: 'android',
          brand: 'android', manufacturer: 'android', product: 'dxplay', hardware: 'android',
          isPhysicalDevice: true, androidId: uuid.slice(0, 8), bootloader: 'unknown',
          display: 'DXPlay', tags: 'release-keys', type: 'user', host: 'dxplay',
          finger: 'dxplay/android:15/release:user/release-keys',
          app: {version: text(extension.versionName), name: text(extension.name), package: text(extension.package),
            buildNumber: text(extension.buildNumber), buildSignature: text(extension.buildSignature),
            install: installedAt, update: installedAt},
          did: randomUuid(), apiVersion: 'v2', channel: '',
        }, '');
        userToken = text(object(login.userInfo).user_token);
      } catch (_) {
        userToken = '';
      }
      return {ready: true};
    },
    async home() {
      const homeCategory = categories.find(value => text(value.id) === '1') || categories[0];
      const data = homeCategory ? await request('/vod/search', {
        kw: '', page: '1', limit: 21, pid: text(homeCategory.id), orderBy: 'time', isCategory: 1,
      }) : {};
      return {categories: categories.map(category), featured: list(data.data).map(item)};
    },
    async category(input) {
      const page = Number(input.page) || 1;
      const selected = object(input.filters);
      const payload = {
        kw: '', page: String(page), limit: 21, pid: text(input.categoryId), orderBy: 'time', isCategory: 1,
      };
      for (const key of ['class', 'area', 'lang', 'year']) if (text(selected[key])) payload[key] = text(selected[key]);
      const data = await request('/vod/search', payload);
      const values = list(data.data);
      return {page, pageCount: Number(data.page_count) || (values.length ? page + 1 : page), items: values.map(item)};
    },
    async search(input) {
      const page = Number(input.page) || 1;
      const data = await request('/vod/search', {
        kw: text(input.keyword), page: String(page), limit: 21, orderBy: 'vod_hits_month', sort: 'desc',
      });
      const values = list(data.data);
      return {page, pageCount: Number(data.page_count) || (values.length ? page + 1 : page), items: values.map(item)};
    },
    async detail(input) {
      const response = await request('/vod/detail', {id: text(input.id), eps: '1', v: '2.0.0', pl: 1});
      const value = object(response.data);
      if (!text(value.id) && !text(value.name)) throw new Error('app99.item-not-found');
      const flags = text(value.play_from).split('$$$');
      const urls = text(value.play_url).split('$$$');
      const names = {};
      for (const key of Object.keys(player)) {
        const descriptor = object(player[key]);
        if (text(descriptor.code)) names[text(descriptor.code).trim()] = text(descriptor.name).trim();
      }
      const groups = [];
      for (let lineIndex = 0; lineIndex < urls.length; lineIndex += 1) {
        const flag = flags[lineIndex] || '';
        const episodes = urls[lineIndex].split('#').filter(Boolean).map((entry, episodeIndex) => {
          const pair = firstDollar(entry);
          const digits = pair[0].replace(/\D+/g, '');
          return {
            id: flag + '-' + episodeIndex, name: pair[0],
            playId: encodePlayId({url: pair[1], flag, vodName: text(value.name), index: digits || '1'}),
          };
        });
        if (episodes.length) groups.push({id: flag || String(lineIndex), name: names[flag] || flag || ('线路 ' + (lineIndex + 1)), episodes});
      }
      return {
        id: text(value.id), sourceKey, name: text(value.name),
        ...(text(value.pic) ? {poster: text(value.pic)} : {}),
        ...(text(value.remarks) ? {remark: text(value.remarks)} : {}),
        year: text(value.year), area: text(value.area),
        actors: text(value.actor), director: text(value.director), description: text(value.content),
        playGroups: groups,
      };
    },
    async play(input) {
      const target = decodePlayId(text(input.playId));
      let url = text(target.url);
      if (!MEDIA.test(url)) {
        const route = object(player[text(target.flag)]);
        if (Number(route.type) !== 0) {
          const allowed = text(route.parseUrl).split(',').map(value => value.trim()).filter(Boolean);
          const candidates = parses.filter(value => !allowed.length || allowed.includes(text(value.id)));
          for (const parser of candidates) {
            try {
              const parsed = await request('/app/vodParser', {id: Number(parser.id), url});
              if (/^https?:\/\//i.test(text(parsed.data))) {
                url = text(parsed.data);
                break;
              }
            } catch (_) {}
          }
        }
      }
      if (!/^https?:\/\//i.test(url)) throw new Error('app99.play-unavailable');
      return {sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl: url, headers: {}, parse: !MEDIA.test(url)};
    },
    async destroy() {
      sourceKey = '';
      extension = DEFAULT_EXTENSION;
      host = '';
      uuid = '';
      userAgent = DEFAULT_USER_AGENT;
      version = '';
      userToken = '';
      categories = [];
      player = {};
      parses = [];
    },
  });
})();
