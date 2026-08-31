/* global dxplay */
(() => {
  'use strict';

  const PROVIDER_ID = 'org.dxsrc.drive.mobile139';
  const KEY = 'PVGDwmcvfs1uV3d1';
  const LIST_API = 'https://share-kd-njs.yun.139.com/yun-share/richlifeApp/devapp/IOutLink/getOutLinkInfoV6';
  const MEDIA_API = 'https://share-kd-njs.yun.139.com/yun-share/richlifeApp/devapp/IOutLink/getContentInfoFromOutLink';
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

  const text = value => value === undefined || value === null ? '' : String(value);
  const list = value => Array.isArray(value) ? value : [];
  const headers = () => ({
    'User-Agent': USER_AGENT,
    'Content-Type': 'application/json;charset=UTF-8',
    Referer: 'https://yun.139.com/',
    'x-deviceinfo': '||3|12.27.0|chrome|131.0.0.0|1||windows 10|546X902|zh-CN|||',
    'hcy-cool-flag': '1',
    authorization: '',
  });
  const mediaHeaders = () => ({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36  115Browser/26.0.7.2',
    'Content-Type': 'application/json;charset=UTF-8',
    Referer: 'https://yun.139.com/',
  });
  const decodeBase64 = value => {
    const raw = text(value).replace(/\s+/g, '');
    if (!raw || raw.length % 4 !== 0) throw new Error('mobile139.response-invalid');
    const output = [];
    for (let index = 0; index < raw.length; index += 4) {
      const a = BASE64.indexOf(raw[index]);
      const b = BASE64.indexOf(raw[index + 1]);
      const c = raw[index + 2] === '=' ? -1 : BASE64.indexOf(raw[index + 2]);
      const d = raw[index + 3] === '=' ? -1 : BASE64.indexOf(raw[index + 3]);
      if (a < 0 || b < 0 || (c < 0 && raw[index + 2] !== '=') || (d < 0 && raw[index + 3] !== '=')) throw new Error('mobile139.response-invalid');
      output.push((a << 2) | (b >>> 4));
      if (c >= 0) output.push(((b & 15) << 4) | (c >>> 2));
      if (d >= 0) output.push(((c & 3) << 6) | d);
    }
    return output;
  };
  const encodeBase64 = bytes => {
    let output = '';
    for (let index = 0; index < bytes.length; index += 3) {
      const a = bytes[index] & 255;
      const hasB = index + 1 < bytes.length, hasC = index + 2 < bytes.length;
      const b = hasB ? bytes[index + 1] & 255 : 0;
      const c = hasC ? bytes[index + 2] & 255 : 0;
      output += BASE64[a >>> 2] + BASE64[((a & 3) << 4) | (b >>> 4)]
        + (hasB ? BASE64[((b & 15) << 2) | (c >>> 6)] : '=')
        + (hasC ? BASE64[c & 63] : '=');
    }
    return output;
  };
  const randomIv = () => {
    const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    let value = '';
    for (let index = 0; index < 16; index += 1) value += alphabet[Math.floor(Math.random() * alphabet.length)];
    return value;
  };
  const encryptPayload = value => {
    const iv = randomIv();
    const cipher = decodeBase64(dxplay.crypto.aesEncrypt({mode: 'cbc', text: value, key: KEY, iv}));
    return encodeBase64(Array.from(iv, character => character.charCodeAt(0)).concat(cipher));
  };
  const decryptPayload = value => {
    const bytes = decodeBase64(value);
    if (bytes.length <= 16) throw new Error('mobile139.response-invalid');
    return dxplay.crypto.aesDecrypt({
      mode: 'cbc',
      base64: encodeBase64(bytes.slice(16)),
      key: KEY,
      ivBase64: encodeBase64(bytes.slice(0, 16)),
    });
  };
  const request = async (url, body, encrypted) => {
    const response = await dxplay.fetch({url, method: 'POST', headers: encrypted ? headers() : mediaHeaders(), body: encrypted ? encryptPayload(JSON.stringify(body)) : JSON.stringify(body)});
    if (response.status < 200 || response.status >= 300) throw new Error('mobile139.request-failed');
    let value;
    try { value = JSON.parse(encrypted ? decryptPayload(response.body) : response.body); }
    catch (_) { throw new Error('mobile139.response-invalid'); }
    if (text(value.resultCode || value.code) !== '0') throw new Error('mobile139.request-failed');
    return value.data;
  };
  const shareFromTarget = target => {
    if (!target || typeof target.url !== 'string') return null;
    const url = target.url;
    const match = url.match(/\/(?:w|m)\/i\/([A-Za-z0-9_-]+)/i)
      || url.match(/[?&]linkID=([A-Za-z0-9_-]+)/i)
      || url.match(/\/(?:w|m)\/i\?[^#]*\b(?:linkID|id)=([A-Za-z0-9_-]+)/i);
    if (!match) return null;
    return {linkId: match[1], password: text(target.accessCode)};
  };
  const requireShare = value => {
    if (!value || typeof value.linkId !== 'string' || !value.linkId) throw new Error('mobile139.response-invalid');
    return value;
  };
  const encodeId = (kind, value) => kind + ':' + encodeURIComponent(text(value));
  const decodeId = (id, kind) => {
    const prefix = kind + ':';
    if (typeof id !== 'string' || !id.startsWith(prefix)) throw new Error('mobile139.response-invalid');
    const value = decodeURIComponent(id.slice(prefix.length));
    if (!value) throw new Error('mobile139.response-invalid');
    return value;
  };
  const fileKind = name => {
    if (/\.(mp4|m4v|mov|mkv|webm|avi|wmv|flv|ts|m2ts|mpg|mpeg|3gp)$/i.test(name)) return 'video';
    if (/\.(mp3|m4a|aac|flac|ogg|wav)$/i.test(name)) return 'audio';
    if (/\.(srt|ass|ssa|vtt|sub)$/i.test(name)) return 'subtitle';
    if (/\.(jpe?g|png|webp|gif|bmp)$/i.test(name)) return 'image';
    return 'other';
  };

  dxplay.register({
    id: PROVIDER_ID,
    name: 'China Mobile Cloud shares',
    description: 'Lists and resolves anonymous yun.139.com community shares. Personal account browsing is intentionally not implemented.',
    version: '1.0.0',
    protocol: 'drive@1',

    async init() { return {ready: true}; },
    async login() { throw new Error('mobile139.account-unsupported'); },
    async poll() { throw new Error('mobile139.account-unsupported'); },
    async list() { throw new Error('mobile139.account-unsupported'); },
    async resolve() { throw new Error('mobile139.account-unsupported'); },
    async matchShare(input) {
      const share = shareFromTarget(input);
      return share ? {matched: true, confidence: 100, share} : {matched: false};
    },
    async listShare(input) {
      const share = requireShare(input && input.share);
      const parent = input && input.parentId ? decodeId(input.parentId, 'folder') : 'root';
      const data = await request(LIST_API, {getOutLinkInfoReq: {
        account: '', linkID: share.linkId, passwd: share.password || '',
        caSrt: 1, coSrt: 1, srtDr: 0, bNum: 1, pCaID: parent, eNum: 200,
      }}, true);
      const entries = [];
      for (const folder of list(data && data.caLst)) {
        const path = text(folder.path), name = text(folder.caName);
        if (path && name) entries.push({id: encodeId('folder', path), name, kind: 'folder'});
      }
      for (const file of list(data && data.coLst)) {
        const id = text(file.coID), name = text(file.coName);
        if (!id || !name) continue;
        const size = Number(file.coSize);
        entries.push({id: encodeId('file', id), name, kind: fileKind(name), ...(Number.isFinite(size) && size >= 0 ? {size} : {})});
      }
      return {entries, share};
    },
    async resolveShare(input) {
      const share = requireShare(input && input.share);
      const entry = input && input.entry;
      if (!entry || (entry.kind !== 'video' && entry.kind !== 'audio')) throw new Error('cloud.entry-not-playable');
      const contentId = decodeId(entry.id, 'file');
      const data = await request(MEDIA_API, {
        getContentInfoFromOutLinkReq: {contentId, linkID: share.linkId, account: ''},
        commonAccountInfo: {account: '', accountType: 1},
      }, false);
      const url = text(data && data.contentInfo && data.contentInfo.presentURL);
      if (!/^https?:\/\//i.test(url)) throw new Error('cloud.entry-not-playable');
      return {media: {
        url,
        headers: {'User-Agent': USER_AGENT, Referer: 'https://yun.139.com/'},
        format: /\.m3u8(?:$|\?)/i.test(url) ? 'hls' : 'progressive',
        subtitles: [],
        resolvedBy: PROVIDER_ID,
      }};
    },
    async destroy() {},
  });
})();
