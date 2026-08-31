/* global dxplay */
(() => {
  'use strict';

  const DEFAULT_EXTENSION = {
    appName: '华谊',
    publicKey: 'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCp9Ek4wIlQAtwFnuBRlsFiow2tr+4UOciGeNKbY7nL74etUqUb6fvpOSOHhFEfaWlfwUpOB17x3JEL3No19nfjCeVYrYPjlJcgoqUWH/tfIfFAQWvtxBIBlKazkhw8d3ChysWmeWRikKqkBsVRY4oqNPuj4sjm6Zult0U4I4prRQIDAQAB',
    dataKey: 'NDBYSZR1DMRRZ05NSUCWEJNIYWLBPT0=',
    dataIv: 'OC1A06E197EF10CF3F6058CA7A803B5E',
    pkg: 'com.muyue.tool', version: '1.0.0.4', decrypt: '1',
    host: 'http://43.240.158.156:8002',
    site: 'https://vip.123pan.cn/1851089669/oss/az5.txt',
  };
  const PARAMS_KEY = 'ed5fdsgucxumegqa';
  const USER_AGENT = 'okhttp/3.12.1';
  const FILTER_NAMES = {class: '类型', lang: '语言', area: '地区', year: '年份', extend_sort: '排序'};
  const DIRECT_MEDIA = /\.(?:mp4|m3u8|flv|mkv|avi|ts|mov|mpd|m4a|wmv)(?:$|[?#])/i;
  let sourceKey = '';
  let sourceHeaders = {};
  let host = '';
  let publicKey = '';
  let dataKey = '';
  let dataIv = '';
  let appName = '';
  let packageName = '';
  let version = '';
  let decryptResponses = true;
  let zoneKey = '';

  const text = value => value === undefined || value === null ? '' : String(value);
  const list = value => Array.isArray(value) ? value : [];
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const randomString = length => {
    const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    let output = '';
    for (let index = 1; index < length; index += 1) output += alphabet[Math.floor(Math.random() * alphabet.length)];
    return output + '=';
  };
  const randomId = () => {
    let output = '';
    for (let index = 0; index < 32; index += 1) output += Math.floor(Math.random() * 16).toString(16);
    return output.toUpperCase();
  };
  const concatBytes = parts => {
    const length = parts.reduce((sum, part) => sum + part.length, 0);
    const output = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) { output.set(part, offset); offset += part.length; }
    return output;
  };
  const encodeVarint = value => {
    let remaining = Math.max(0, Math.floor(Number(value) || 0));
    const output = [];
    do {
      const byte = remaining % 128;
      remaining = Math.floor(remaining / 128);
      output.push(byte | (remaining ? 128 : 0));
    } while (remaining);
    return new Uint8Array(output);
  };
  const fieldBytes = (number, value) => {
    const bytes = value instanceof Uint8Array ? value : dxplay.codec.utf8Encode(text(value));
    return concatBytes([encodeVarint((number * 8) + 2), encodeVarint(bytes.length), bytes]);
  };
  const fieldNumber = (number, value) => concatBytes([encodeVarint(number * 8), encodeVarint(value)]);
  const readVarint = (bytes, state) => {
    let value = 0, scale = 1;
    while (state.index < bytes.length) {
      const byte = bytes[state.index++];
      value += (byte & 127) * scale;
      if (!(byte & 128)) return value;
      scale *= 128;
      if (scale > Number.MAX_SAFE_INTEGER) break;
    }
    throw new Error('app-drama.protobuf-invalid');
  };
  const parseFields = bytes => {
    const fields = [], state = {index: 0};
    while (state.index < bytes.length) {
      const tag = readVarint(bytes, state), number = Math.floor(tag / 8), wire = tag & 7;
      if (wire === 0) fields.push({number, wire, value: readVarint(bytes, state)});
      else if (wire === 2) {
        const length = readVarint(bytes, state), end = state.index + length;
        if (end > bytes.length) throw new Error('app-drama.protobuf-invalid');
        fields.push({number, wire, value: bytes.slice(state.index, end)});
        state.index = end;
      } else if (wire === 1) {
        if (state.index + 8 > bytes.length) throw new Error('app-drama.protobuf-invalid');
        state.index += 8;
      } else if (wire === 5) {
        if (state.index + 4 > bytes.length) throw new Error('app-drama.protobuf-invalid');
        state.index += 4;
      } else throw new Error('app-drama.protobuf-invalid');
    }
    return fields;
  };
  const first = (fields, number) => fields.find(field => field.number === number);
  const numberField = (fields, number, fallback) => {
    const field = first(fields, number);
    return field && field.wire === 0 ? field.value : fallback;
  };
  const bytesValue = (fields, number) => {
    const field = first(fields, number);
    return field && field.wire === 2 ? field.value : new Uint8Array(0);
  };
  const stringField = (fields, number) => {
    const bytes = bytesValue(fields, number);
    if (!bytes.length) return '';
    try { return dxplay.codec.utf8Decode(bytes); } catch (_) { return ''; }
  };
  const repeatedBytes = (fields, number) => fields
    .filter(field => field.number === number && field.wire === 2).map(field => field.value);
  const encodeSecureRequest = (parameters) => {
    const timestamp = Date.now(), random = randomString(8), fake = randomString(20);
    const query = Object.keys(parameters).filter(key => text(parameters[key]))
      .map(key => key + '=' + text(parameters[key])).join('&');
    const encrypted = dxplay.crypto.aesEncrypt({mode: 'ecb', text: query + timestamp, key: dataKey});
    const combined = random + encrypted;
    return concatBytes([
      fieldBytes(1, combined.slice(0, 20)), fieldBytes(2, combined.slice(20)),
      fieldBytes(3, fake), fieldNumber(4, timestamp), fieldBytes(5, random),
    ]);
  };
  const hexFromBase64 = value => {
    const bytes = dxplay.codec.base64Decode(value);
    let output = '';
    for (const byte of bytes) output += byte.toString(16).padStart(2, '0');
    return output;
  };
  const deviceInfo = () => {
    const uid = randomId(), timestamp = Date.now(), random = randomString(16);
    const vApp = version.replace(/\./g, '');
    const signature = dxplay.crypto.rsaEncrypt({
      padding: 'pkcs1', text: timestamp + random + vApp, publicKeyBase64: zoneKey || publicKey,
    });
    const splitSignature = dxplay.crypto.aesEncrypt({mode: 'ecb', text: timestamp + random, key: dataIv});
    return {
      country: 'CN', vName: version, cpuId: 'MT6893Z%2FCZA', young: 0,
      facturer: 'Xiaomi', pkg: packageName, uuid: uid, resolution: '1080x2272',
      mac: '02%3A00%3A00%3A00%3A00%3A00', abid: '397', model: 'M2012K11AC',
      plat: 'android', udid: uid, dpi: '440', net: '1', lang: 'zh', brand: 'Xiaomi',
      density: '2.75', appName, cpu: 'arm64-v8a', chid: '10000',
      carrier: '%E8%81%94%E9%80%9A', _vOsCode: 33, vOs: '13', v: 1,
      tenantId: '', vApp, device: 0, androidID: 'a1b2c3d4e5f67890',
      sig: signature, random_str: random, timestamp,
      sig2: splitSignature.slice(0, 8), sig3: splitSignature.slice(8),
    };
  };
  const protocolHeaders = contentType => {
    const paramsBase64 = dxplay.crypto.aesEncrypt({
      mode: 'cbc', text: JSON.stringify(deviceInfo()), key: PARAMS_KEY, iv: PARAMS_KEY,
    });
    return Object.assign({'User-Agent': USER_AGENT}, sourceHeaders, {
      Accept: contentType, 'Content-Type': contentType,
      publicParams: JSON.stringify({paramsData: hexFromBase64(paramsBase64)}),
    });
  };
  const acquireZoneKey = async () => {
    const timestamp = Date.now(), random = randomString(16);
    const signature = dxplay.crypto.rsaEncrypt({
      padding: 'pkcs1', text: timestamp + random, publicKeyBase64: publicKey,
    });
    const body = concatBytes([
      fieldNumber(1, timestamp), fieldBytes(2, signature), fieldBytes(3, randomString(16)),
      fieldBytes(4, random), fieldBytes(5, randomString(16)),
    ]);
    const response = await dxplay.fetch({
      url: host + '/api/v5/find/app/zone', method: 'POST',
      headers: protocolHeaders('application/x-protobuf'),
      bodyBase64: dxplay.codec.base64Encode(body), responseType: 'base64',
    });
    if (response.status < 200 || response.status >= 300 || !response.bodyBase64) return;
    const envelope = parseFields(dxplay.codec.base64Decode(response.bodyBase64));
    if (numberField(envelope, 1, 0) !== 200) return;
    const fields = parseFields(bytesValue(envelope, 3));
    const candidate = [2, 3, 4, 5].map(number => stringField(fields, number)).join('');
    if (candidate) zoneKey = candidate;
  };
  const fetchJsonData = async path => {
    const response = await dxplay.fetch({url: host + path, headers: protocolHeaders('application/json')});
    if (response.status < 200 || response.status >= 300) throw new Error('app-drama.request-failed');
    let envelope;
    try { envelope = JSON.parse(response.body); } catch (_) { throw new Error('app-drama.response-invalid'); }
    let value = envelope && envelope.data;
    if (typeof value === 'string' && value) {
      let plain = value;
      if (decryptResponses) {
        const intermediate = dxplay.crypto.aesDecrypt({mode: 'ecb', base64: value, key: dataKey});
        plain = dxplay.crypto.aesDecrypt({mode: 'ecb', base64: intermediate, key: dataIv});
      }
      try { value = JSON.parse(plain); } catch (_) { value = plain; }
    }
    return value;
  };
  const postProto = async (path, parameters) => {
    const body = encodeSecureRequest(parameters);
    const response = await dxplay.fetch({
      url: host + path, method: 'POST', headers: protocolHeaders('application/x-protobuf'),
      bodyBase64: dxplay.codec.base64Encode(body), responseType: 'base64',
    });
    if (response.status < 200 || response.status >= 300 || !response.bodyBase64) throw new Error('app-drama.request-failed');
    const fields = parseFields(dxplay.codec.base64Decode(response.bodyBase64));
    if (numberField(fields, 1, 0) !== 200) throw new Error('app-drama.response-rejected');
    return bytesValue(fields, 3);
  };
  const decodeCover = bytes => {
    const fields = parseFields(bytes);
    return {path: stringField(fields, 1), thumbnail: stringField(fields, 2)};
  };
  const decodeDrama = bytes => {
    const fields = parseFields(bytes), coverBytes = bytesValue(fields, 2);
    return {
      id: text(numberField(fields, 3, '')), name: stringField(fields, 5),
      area: stringField(fields, 1), brief: stringField(fields, 4), director: stringField(fields, 7),
      remark: stringField(fields, 13), year: text(numberField(fields, 14, '')),
      cover: coverBytes.length ? decodeCover(coverBytes) : {path: '', thumbnail: ''},
    };
  };
  const decodeVideo = bytes => {
    const fields = parseFields(bytes);
    return {
      title: stringField(fields, 2), path: stringField(fields, 4),
      source: stringField(fields, 9) || stringField(fields, 11), sourceName: stringField(fields, 10),
    };
  };
  const decodeDetail = bytes => {
    const fields = parseFields(bytes), coverBytes = bytesValue(fields, 2);
    return {
      id: text(numberField(fields, 4, '')), name: stringField(fields, 9), area: stringField(fields, 1),
      description: stringField(fields, 6) || stringField(fields, 7), director: stringField(fields, 12),
      category: stringField(fields, 13), year: text(numberField(fields, 18, '')),
      actors: stringField(fields, 25), remark: stringField(fields, 26),
      cover: coverBytes.length ? decodeCover(coverBytes) : {path: '', thumbnail: ''},
      videos: repeatedBytes(fields, 29).map(decodeVideo),
    };
  };
  const decodePlay = bytes => {
    const fields = parseFields(bytes), headers = {};
    for (const entry of repeatedBytes(fields, 6)) {
      const map = parseFields(entry), key = stringField(map, 1);
      if (key) headers[key] = stringField(map, 2);
    }
    return {url: stringField(fields, 1), message: stringField(fields, 9), headers};
  };
  const catalogItem = value => ({
    id: text(value.id), sourceKey, name: text(value.name) || text(value.id),
    ...(text(value.cover && (value.cover.thumbnail || value.cover.path)) ? {poster: text(value.cover.thumbnail || value.cover.path)} : {}),
    ...(value.remark ? {remark: text(value.remark)} : {}),
  });
  const filtersFromCategory = value => {
    let declared = {};
    try { declared = JSON.parse(text(value.converUrl)); } catch (_) {}
    return Object.keys(FILTER_NAMES).map(key => {
      const options = text(declared[key]).split(',').map(entry => entry.trim()).filter(Boolean)
        .map(entry => ({name: entry, value: entry}));
      if (!options.length) return null;
      return {key: key === 'extend_sort' ? 'order' : key, name: FILTER_NAMES[key], initialValue: options[0].value, options};
    }).filter(Boolean);
  };
  const sourceRank = value => {
    const name = text(value).toUpperCase();
    if (name.startsWith('K蓝光') && !name.includes('下载')) return 0;
    if (name.startsWith('YY蓝光')) return 1;
    if (name.includes('4K')) return 2;
    if (name.includes('2K')) return 3;
    if (name.includes('超清') || name.includes('超高清')) return 4;
    if (name.includes('蓝光')) return 5;
    if (name.includes('臻彩')) return 6;
    return 7;
  };

  dxplay.register({
    id: 'org.dxsrc.qist.app-drama',
    name: 'AppDrama catalog family',
    description: 'Parameterized rewrite of the public AppDrama JSON home, protobuf catalog and encrypted media resolver family.',
    version: '1.0.0',
    protocol: 'catalog@1',

    async init(input) {
      sourceKey = text(input.sourceKey) || 'app-drama';
      sourceHeaders = object(input.headers);
      const configured = object(input.extension);
      const extension = Object.keys(configured).length ? configured : DEFAULT_EXTENSION;
      publicKey = text(extension.publicKey);
      dataKey = text(extension.dataKey);
      dataIv = text(extension.dataIv);
      appName = text(extension.appName);
      packageName = text(extension.pkg);
      version = text(extension.version);
      decryptResponses = text(extension.decrypt) !== '0';
      zoneKey = '';
      host = text(extension.host).replace(/\/+$/, '');
      try {
        const response = await dxplay.fetch({url: text(extension.site), headers: Object.assign({'User-Agent': USER_AGENT}, sourceHeaders)});
        if (response.status >= 200 && response.status < 300) {
          const document = JSON.parse(response.body), candidate = text(document && document.domain).replace(/\/+$/, '');
          if (/^https?:\/\//i.test(candidate)) host = candidate;
        }
      } catch (_) {}
      if (!/^https?:\/\//i.test(host) || !publicKey || ![16, 24, 32].includes(dataKey.length)
          || ![16, 24, 32].includes(dataIv.length) || !appName || !packageName || !version) {
        throw new Error('app-drama.configuration-invalid');
      }
      try { await acquireZoneKey(); } catch (_) {}
      return {ready: true};
    },
    async home(input) {
      const values = list(await fetchJsonData('/api/v3/drama/getCategory?orderBy=type_id'));
      const categories = values.filter(value => text(value.name) && text(value.name) !== '公告').map(value => {
        const filters = filtersFromCategory(value);
        return {id: text(value.id), name: text(value.name), ...(input.includeFilters && filters.length ? {filters} : {})};
      });
      let featured = [];
      try {
        const tags = list(await fetchJsonData('/api/ex/v3/security/tag/list'));
        featured = tags.flatMap(tag => list(tag && tag.sections)).flatMap(section => list(section && section.vodList))
          .map(value => catalogItem({id: value.id, name: value.name, remark: value.remark, cover: object(value.coverImage)}));
      } catch (_) {}
      return {categories, featured};
    },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1), selected = object(input.filters);
      const bytes = await postProto('/api/proto/v5/drama/category', {
        pagesize: '21', typeId1: text(input.categoryId), page: text(page),
        vodOrderBy: text(selected.order) || '最新', vodArea: text(selected.area),
        vodLang: text(selected.lang), vodClass: text(selected.class), vodYear: text(selected.year),
      });
      const items = repeatedBytes(parseFields(bytes), 1).map(decodeDrama).map(catalogItem);
      return {page, pageCount: items.length >= 21 ? page + 1 : page, items};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const bytes = await postProto('/api/proto/v5/drama/search', {
        searchKeys: text(input.keyword), page: text(page), pagesize: '21',
      });
      const items = repeatedBytes(parseFields(bytes), 1).map(decodeDrama).map(catalogItem);
      return {page, pageCount: items.length >= 21 ? page + 1 : page, items};
    },
    async detail(input) {
      const detail = decodeDetail(await postProto('/api/proto/v5/drama/getDetail', {id: text(input.id)}));
      const grouped = {};
      for (const video of detail.videos) {
        const group = text(video.sourceName) || appName + '专线';
        if (!grouped[group]) grouped[group] = [];
        const descriptor = /^https?:\/\//i.test(video.path) && DIRECT_MEDIA.test(video.path)
          ? {direct: video.path} : {source: video.source, path: video.path};
        grouped[group].push({
          id: String(grouped[group].length + 1), name: text(video.title) || String(grouped[group].length + 1),
          playId: JSON.stringify(descriptor),
        });
      }
      const hasDirect = name => grouped[name].some(episode => episode.playId.includes('"direct"'));
      const playGroups = Object.keys(grouped).sort((left, right) => {
        const directOrder = Number(!hasDirect(left)) - Number(!hasDirect(right));
        return directOrder || sourceRank(left) - sourceRank(right);
      })
        .map((name, index) => ({id: String(index + 1), name, episodes: grouped[name]}));
      if (!detail.id || !detail.name || !playGroups.length) throw new Error('app-drama.item-not-found');
      return {
        ...catalogItem(detail), year: detail.year, area: detail.area, category: detail.category,
        actors: detail.actors, director: detail.director, description: detail.description, playGroups,
      };
    },
    async play(input) {
      let descriptor;
      try { descriptor = JSON.parse(text(input.playId)); } catch (_) { throw new Error('app-drama.play-id-invalid'); }
      let rawUrl = text(descriptor.direct), headers = {};
      if (!rawUrl) {
        const result = decodePlay(await postProto('/api/proto/v5/videoUsableUrl', {
          vodPlayFrom: text(descriptor.source), playUrl: text(descriptor.path),
        }));
        rawUrl = result.url;
        headers = result.headers;
      }
      if (!/^https?:\/\//i.test(rawUrl)) throw new Error('app-drama.play-unavailable');
      return {
        sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl,
        headers: Object.assign({'User-Agent': USER_AGENT}, sourceHeaders, headers), parse: false,
      };
    },
    async destroy() {
      sourceKey = ''; sourceHeaders = {}; host = ''; publicKey = ''; dataKey = ''; dataIv = '';
      appName = ''; packageName = ''; version = ''; decryptResponses = true; zoneKey = '';
    },
  });
})();
