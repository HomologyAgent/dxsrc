/* global dxplay */
(() => {
  'use strict';

  const DEFAULT_SITES = [
    'https://api.h27sq4f.com', 'https://api.wbhxjjv.com', 'https://sdapi.e2wu4ht.com',
    'https://sdapi.7wstgq6.com', 'https://apinew.uozvr.com', 'https://api.9cec79d.com',
  ];
  const PUBLIC_KEY = 'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDUM5+/y8sPsWkd1/RQS64X259EUwxFXFE5HlA65MqrxnPs0JqoSRojSDy5QhwvROlaD6TwRQHKMY2OAZ6SnQeUJsChTEFIR9qUkwrs3/MVUMxjsv6JS6Oe/juclyJGTgVmDhB55EafXsD0SQYVj/QXXsxR6ewR5E2kL52yAAD4yQIDAQAB';
  const PRIVATE_KEY = 'MIICdgIBADANBgkqhkiG9w0BAQEFAASCAmAwggJcAgEAAoGAe6hKrWLi1zQmjTT1ozbE4QdFeJGNxubxld6GrFGximxfMsMB6BpJhpcTouAqywAFppiKetUBBbXwYsYU1wNr648XVmPmCMCy4rY8vdliFnbMUj086DU6Z+/oXBdWU3/b1G0DN3E9wULRSwcKZT3wj/cCI1vsCm3gj2R5SqkA9Y0CAwEAAQKBgAJH+4CxV0/zBVcLiBCHvSANm0l7HetybTh/j2p0Y1sTXro4ALwAaCTUeqdBjWiLSo9lNwDHFyq8zX90+gNxa7c5EqcWV9FmlVXr8VhfBzcZo1nXeNdXFT7tQ2yah/odtdcx+vRMSGJd1t/5k5bDd9wAvYdIDblMAg+wiKKZ5KcdAkEA1cCakEN4NexkF5tHPRrR6XOY/XHfkqXxEhMqmNbB9U34saTJnLWIHC8IXys6Qmzz30TtzCjuOqKRRy+FMM4TdwJBAJQZFPjsGC+RqcG5UvVMiMPhnwe/bXEehShK86yJK/g/UiKrO87h3aEu5gcJqBygTq3BBBoH2md3pr/W+hUMWBsCQQChfhTIrdDinKi6lRxrdBnn0Ohjg2cwuqK5zzU9p/N+S9x7Ck8wUI53DKm8jUJE8WAG7WLj/oCOWEh+ic6NIwTdAkEAj0X8nhx6AXsgCYRql1klbqtVmL8+95KZK7PnLWG/IfjQUy3pPGoSaZ7fdquG8bq8oyf5+dzjE/oTXcByS+6XRQJAP/5ciy1bL3NhUhsaOVy55MHXnPjdcTX0FaLi+ybXZIfIQ2P4rb19mVq1feMbCXhz+L1rG8oat5lYKfpe8k83ZA==';
  const SIGN_SUFFIX = '*&zvdvdvddbfikkkumtmdwqppp?|4Y!s!2br';
  const DEVICE_SECRET = 'd6fc3a4a06adbde89223bvefedc24fecde188aaa9161';
  const RESOLUTIONS = ['3840', '2160', '1080', '720', '480', '360', '240'];
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const MD5_SHIFT = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
  const MD5_CONSTANT = Array.from({length: 64}, (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 4294967296) >>> 0);
  let sourceKey = '';
  let sourceHeaders = {};
  let host = '';
  let token = '';
  let userId = '';
  let playReferer = 'http://WJiZxLXA2.com/';

  const text = value => value === undefined || value === null ? '' : String(value);
  const list = value => Array.isArray(value) ? value : [];
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const add32 = (...values) => values.reduce((sum, value) => (sum + (value >>> 0)) >>> 0, 0);
  const rotate = (value, count) => ((value << count) | (value >>> (32 - count))) >>> 0;
  const utf8 = value => {
    const encoded = encodeURIComponent(text(value));
    const bytes = [];
    for (let index = 0; index < encoded.length; index += 1) {
      if (encoded[index] === '%') { bytes.push(parseInt(encoded.slice(index + 1, index + 3), 16)); index += 2; }
      else bytes.push(encoded.charCodeAt(index));
    }
    return bytes;
  };
  const hex = bytes => bytes.map(value => value.toString(16).padStart(2, '0')).join('');
  const hexBytes = value => {
    const input = text(value);
    if (input.length % 2) throw new Error('gz360.hex-invalid');
    const bytes = [];
    for (let index = 0; index < input.length; index += 2) bytes.push(parseInt(input.slice(index, index + 2), 16));
    return bytes;
  };
  const base64Encode = bytes => {
    let output = '';
    for (let index = 0; index < bytes.length; index += 3) {
      const a = bytes[index], b = bytes[index + 1], c = bytes[index + 2];
      output += B64[a >>> 2] + B64[((a & 3) << 4) | ((b || 0) >>> 4)]
        + (b === undefined ? '=' : B64[((b & 15) << 2) | ((c || 0) >>> 6)])
        + (c === undefined ? '=' : B64[c & 63]);
    }
    return output;
  };
  const base64Decode = value => {
    const input = text(value).replace(/\s/g, '');
    const bytes = [];
    for (let index = 0; index < input.length; index += 4) {
      const a = B64.indexOf(input[index]), b = B64.indexOf(input[index + 1]);
      const c = input[index + 2] === '=' ? -1 : B64.indexOf(input[index + 2]);
      const d = input[index + 3] === '=' ? -1 : B64.indexOf(input[index + 3]);
      if (a < 0 || b < 0 || (c < 0 && input[index + 2] !== '=') || (d < 0 && input[index + 3] !== '=')) throw new Error('gz360.base64-invalid');
      bytes.push((a << 2) | (b >>> 4));
      if (c >= 0) bytes.push(((b & 15) << 4) | (c >>> 2));
      if (d >= 0) bytes.push(((c & 3) << 6) | d);
    }
    return bytes;
  };
  const sha1Bytes = input => {
    const bytes = input.slice(), bitLength = bytes.length * 8;
    bytes.push(128); while (bytes.length % 64 !== 56) bytes.push(0);
    for (let index = 7; index >= 0; index -= 1) bytes.push(index >= 4 ? (Math.floor(bitLength / 4294967296) >>> ((index - 4) * 8)) & 255 : (bitLength >>> (index * 8)) & 255);
    let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
    for (let offset = 0; offset < bytes.length; offset += 64) {
      const words = new Array(80);
      for (let index = 0; index < 16; index += 1) words[index] = ((bytes[offset + index * 4] << 24) | (bytes[offset + index * 4 + 1] << 16) | (bytes[offset + index * 4 + 2] << 8) | bytes[offset + index * 4 + 3]) >>> 0;
      for (let index = 16; index < 80; index += 1) words[index] = rotate(words[index - 3] ^ words[index - 8] ^ words[index - 14] ^ words[index - 16], 1);
      let a = h0, b = h1, c = h2, d = h3, e = h4;
      for (let index = 0; index < 80; index += 1) {
        let f, k;
        if (index < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
        else if (index < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
        else if (index < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
        else { f = b ^ c ^ d; k = 0xca62c1d6; }
        const next = add32(rotate(a, 5), f, e, k, words[index]);
        e = d; d = c; c = rotate(b, 30); b = a; a = next;
      }
      h0 = add32(h0, a); h1 = add32(h1, b); h2 = add32(h2, c); h3 = add32(h3, d); h4 = add32(h4, e);
    }
    return [h0,h1,h2,h3,h4].flatMap(word => [24,16,8,0].map(shift => (word >>> shift) & 255));
  };
  const sha1 = value => hex(sha1Bytes(utf8(value)));
  const hmacSha1 = (key, message) => {
    let bytes = utf8(key);
    if (bytes.length > 64) bytes = sha1Bytes(bytes);
    while (bytes.length < 64) bytes.push(0);
    return sha1Bytes(bytes.map(value => value ^ 0x5c).concat(sha1Bytes(bytes.map(value => value ^ 0x36).concat(message))));
  };
  const md5 = value => {
    const bytes = utf8(value), bitLength = bytes.length * 8;
    bytes.push(128); while (bytes.length % 64 !== 56) bytes.push(0);
    for (let index = 0; index < 8; index += 1) bytes.push(index < 4 ? (bitLength >>> (index * 8)) & 255 : (Math.floor(bitLength / 4294967296) >>> (index * 8 - 32)) & 255);
    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    for (let offset = 0; offset < bytes.length; offset += 64) {
      const words = Array.from({length: 16}, (_, index) => bytes[offset + index * 4] | (bytes[offset + index * 4 + 1] << 8) | (bytes[offset + index * 4 + 2] << 16) | (bytes[offset + index * 4 + 3] << 24));
      let a = a0, b = b0, c = c0, d = d0;
      for (let index = 0; index < 64; index += 1) {
        let f, word;
        if (index < 16) { f = (b & c) | (~b & d); word = index; }
        else if (index < 32) { f = (d & b) | (~d & c); word = (5 * index + 1) % 16; }
        else if (index < 48) { f = b ^ c ^ d; word = (3 * index + 5) % 16; }
        else { f = c ^ (b | ~d); word = (7 * index) % 16; }
        const oldD = d; d = c; c = b; b = add32(b, rotate(add32(a, f, MD5_CONSTANT[index], words[word]), MD5_SHIFT[index])); a = oldD;
      }
      a0 = add32(a0, a); b0 = add32(b0, b); c0 = add32(c0, c); d0 = add32(d0, d);
    }
    return [a0,b0,c0,d0].map(word => [0,8,16,24].map(shift => ((word >>> shift) & 255).toString(16).padStart(2, '0')).join('')).join('');
  };
  const javaHash = value => { let result = 0; for (let index = 0; index < value.length; index += 1) result = (Math.imul(result, 31) + value.charCodeAt(index)) | 0; return result; };
  const intBytes = value => [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
  const randomBytes = length => Array.from({length}, () => Math.floor(Math.random() * 256));
  const randomText = length => Array.from({length}, () => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 62)]).join('');
  const randomUuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, value => { const digit = Math.floor(Math.random() * 16); return (value === 'x' ? digit : (digit & 3) | 8).toString(16); });
  const oldKey = () => {
    const prefix = intBytes(Math.floor(Date.now() / 1000)).concat(randomBytes(4), [3, 0], intBytes(javaHash('1a2b3c4d5e6f7g8h')));
    const digest = base64Encode(hmacSha1(DEVICE_SECRET, prefix));
    return base64Encode(prefix.concat(intBytes(javaHash(digest))));
  };
  const form = values => Object.keys(values).map(key => encodeURIComponent(key) + '=' + encodeURIComponent(text(values[key]))).join('&');
  const headers = () => Object.assign({
    lang: 'zh_cn', 'User-Agent': 'okhttp/3.12.0', 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    code: 'GZ0313', version: '2606029', packagename: 'com.v54f07a912.t4ee50f184.dbb1e7669f20260721',
    ver: '3.0.4.8', 'api-ver': '3.0.4.8', referer: host,
  }, sourceHeaders);
  const decrypt = envelope => {
    const data = object(envelope.data);
    const keys = JSON.parse(dxplay.crypto.rsaDecrypt({padding: 'pkcs1', base64: text(data.keys), privateKeyBase64: PRIVATE_KEY}));
    const plain = dxplay.crypto.aesDecrypt({
      mode: 'cbc', base64: base64Encode(hexBytes(data.response_key)), key: text(keys.key), iv: text(keys.iv),
    });
    return JSON.parse(plain);
  };
  const request = async (path, payload) => {
    const key = randomText(16), iv = randomText(16);
    const requestKey = hex(base64Decode(dxplay.crypto.aesEncrypt({mode: 'cbc', text: JSON.stringify(payload), key, iv}))).toUpperCase();
    const keys = dxplay.crypto.rsaEncrypt({padding: 'pkcs1', text: JSON.stringify({key, iv}), publicKeyBase64: PUBLIC_KEY});
    const values = {token_id: '', token, phone_type: '1', request_key: requestKey, app_id: '1', time: String(Math.floor(Date.now() / 1000)), keys};
    values.signature = md5(Object.keys(values).map(name => name + '=' + values[name]).join(',') + SIGN_SUFFIX).toUpperCase();
    values.phone_model = 'generic-tv'; values.ad_version = '1';
    const response = await dxplay.fetch({url: host + path, method: 'POST', headers: headers(), body: form(values)});
    if (response.status < 200 || response.status >= 300) throw new Error('gz360.request-failed');
    try { return JSON.parse(response.body); } catch (_) { throw new Error('gz360.response-invalid'); }
  };
  const authorize = async sites => {
    for (const candidate of sites) {
      host = candidate.replace(/\/+$/, ''); token = ''; userId = '';
      if (!/^https?:\/\//i.test(host)) continue;
      try {
        const credentials = {new_key: sha1(randomUuid()).toUpperCase(), old_key: oldKey()};
        let response = await request('/App/Authentication/Device/signIn', credentials);
        if (Number(response.code) === 403) response = await request('/App/Authentication/Device/signUp', {...credentials, recommend_id: ''});
        if (Number(response.code) !== 200) continue;
        const auth = decrypt(response); token = text(auth.token); userId = text(auth.app_user_id);
        if (token && userId) return;
      } catch (_) {}
    }
    throw new Error('gz360.authentication-failed');
  };
  const option = (name, value) => ({name, value});
  const options = values => values.map(value => option(value, value === '全部' ? '0' : value));
  const YEARS = options(['全部','2026','2025','2024','2023','2022','2021','2020','2019','2018']);
  const SORT = [option('最新','d_id'), option('最热','hits'), option('评分','score')];
  const filter = (key, name, values, initialValue = '0') => ({key, name, initialValue, options: values});
  const FILTERS = {
    '1': [filter('sub','类型',options(['全部','动作','喜剧','爱情','科幻','恐怖','剧情','战争','纪录'])),filter('area','地区',options(['全部','大陆','香港','台湾','美国','日本','韩国','欧洲'])),filter('year','年份',YEARS),filter('sort','排序',SORT,'d_id')],
    '2': [filter('sub','类型',options(['全部','国产剧','港台剧','日韩剧','欧美剧','海外剧'])),filter('area','地区',options(['全部','内地','韩国','香港','台湾','日本','美国','泰国','英国'])),filter('year','年份',YEARS),filter('sort','排序',SORT,'d_id')],
    '3': [filter('area','地区',options(['全部','内地','港台','日韩','欧美'])),filter('year','年份',YEARS),filter('sort','排序',SORT,'d_id')],
    '4': [filter('area','地区',options(['全部','国产','日本','欧美'])),filter('year','年份',YEARS),filter('sort','排序',SORT,'d_id')],
    '64': [filter('sort','排序',SORT,'d_id')],
  };
  const categories = [['1','电影'],['2','剧集'],['3','综艺'],['4','动漫'],['64','短剧']].map(value => ({id: value[0], name: value[1], filters: FILTERS[value[0]]}));
  const item = value => {
    const tags = text(value.tags);
    if (tags.includes('伦理') || tags.includes('成人') || tags.includes('三级')) return null;
    const id = text(value.vod_id), name = text(value.vod_name || value.c_name);
    if (!id || !name) return null;
    const poster = text(value.vod_pic || value.c_pic);
    const remark = text(value.new_continue) || ('评分:' + text(value.vod_scroe || value.vod_douban_score));
    return {id, sourceKey, name, ...(poster ? {poster} : {}), remark};
  };

  dxplay.register({
    id: 'org.dxsrc.jsm.gz360',
    name: 'Guazi film catalog',
    description: 'Semantic rewrite of the current Guazi encrypted catalog, anonymous device session and direct media resolver.',
    version: '1.0.0',
    protocol: 'catalog@1',

    async init(input) {
      sourceKey = text(input.sourceKey) || 'gz360'; sourceHeaders = object(input.headers);
      const extension = input.extension;
      const configured = Array.isArray(object(extension).sites) ? object(extension).sites
        : text(extension) ? text(extension).split(',') : DEFAULT_SITES;
      await authorize(configured.map(text));
      try {
        const profile = decrypt(await request('/App/UserInfo/getUserInfo', {}));
        if (/^https?:\/\//i.test(text(profile.playRef))) playReferer = text(profile.playRef);
      } catch (_) {}
      return {ready: true};
    },
    async home() {
      const payload = decrypt(await request('/App/IndexList/choiceList', {pid: '1'}));
      return {categories, featured: list(payload.list).map(item).filter(Boolean)};
    },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1), selected = object(input.filters);
      const payload = decrypt(await request('/App/IndexList/indexList', {
        area: text(selected.area) || '0', year: text(selected.year) || '0', pageSize: '30',
        sort: text(selected.sort) || 'd_id', sub: text(selected.sub) || '0', page: String(page), tid: text(input.categoryId),
      }));
      const items = list(payload.list).map(item).filter(Boolean);
      return {page, pageCount: items.length >= 30 ? page + 1 : page, items};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      if (page > 1) return {page, pageCount: 1, items: []};
      const payload = decrypt(await request('/App/Index/findMoreVod', {keywords: text(input.keyword), order_val: '1'}));
      return {page, pageCount: 1, items: list(payload.list).map(item).filter(Boolean)};
    },
    async detail(input) {
      const id = text(input.id);
      const info = decrypt(await request('/App/IndexPlay/playInfo', {token_id: userId, vod_id: id, mobile_time: String(Math.floor(Date.now() / 1000)), token}));
      const resources = decrypt(await request('/App/Resource/Vurl/show', {vurl_cloud_id: '2', vod_d_id: id}));
      const value = object(info.vodInfo);
      const episodes = list(resources.list).map((entry, index) => {
        const available = object(entry.play);
        const resolution = RESOLUTIONS.find(name => text(object(available[name]).param));
        if (!resolution) return null;
        return {id: text(entry.vurl_id) || String(index + 1), name: (text(entry.title) || String(index + 1)) + ' [' + resolution + 'P]', playId: base64Encode(utf8(text(object(available[resolution]).param)))};
      }).filter(Boolean);
      if (!episodes.length) throw new Error('gz360.episodes-unavailable');
      return {
        id, sourceKey, name: text(value.vod_name) || id,
        ...(text(value.vod_pic) ? {poster: text(value.vod_pic)} : {}),
        remark: text(value.new_continue), year: text(value.vod_addtime), area: text(value.vod_area),
        actors: text(value.vod_actor), director: text(value.vod_director), description: text(value.vod_use_content),
        playGroups: [{id: 'guazi', name: '瓜子视频', episodes}],
      };
    },
    async play(input) {
      const bytes = base64Decode(text(input.playId));
      const parameter = decodeURIComponent(bytes.map(value => '%' + value.toString(16).padStart(2, '0')).join(''));
      const payload = {};
      for (const pair of parameter.split('&')) {
        const boundary = pair.indexOf('=');
        if (boundary > 0) payload[pair.slice(0, boundary) === 'vod_d_id' ? 'vod_id' : pair.slice(0, boundary)] = pair.slice(boundary + 1);
      }
      const resolved = decrypt(await request('/App/Resource/VurlDetail/showOne', payload));
      const url = text(resolved.url);
      if (!/^https?:\/\//i.test(url)) throw new Error('gz360.play-unavailable');
      return {sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl: url, headers: {'User-Agent': 'Lavf/57.83.100', Referer: playReferer}, parse: false};
    },
    async destroy() { sourceKey = ''; sourceHeaders = {}; host = ''; token = ''; userId = ''; },
  });
})();
