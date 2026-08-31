/* global dxplay */
(() => {
  'use strict';

  const BASE = 'https://www.kugou.com';
  const APP_ID = '1005';
  const SIGN_SALT = '57ae12eb6890223e355ccfcb74edf70d';
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';
  const PLAYER_UA = 'Android12-AndroidPhone-11430-14-0-NetMusic-wifi';
  const GROUPS = [
    {id: '6666|0', name: '热门榜单'},
    {id: '33162|1', name: '特色音乐榜'},
    {id: '4681|2', name: '全球榜'},
  ];
  const MD5_SHIFT = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
  const MD5_CONSTANT = Array.from({length: 64}, (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 4294967296) >>> 0);

  let sourceKey = '';
  let sourceHeaders = {};

  const text = value => value === undefined || value === null ? '' : String(value);
  const decode = value => text(value).replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const strip = value => decode(text(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
  const attr = (attributes, name) => decode(text(attributes).match(new RegExp('\\b' + name + '=["\\\']([^"\\\']*)["\\\']', 'i'))?.[1] || '');
  const absolute = value => {
    const raw = text(value).trim();
    if (/^https?:\/\//i.test(raw)) return raw.replace(/^http:\/\//i, 'https://');
    if (raw.startsWith('//')) return 'https:' + raw;
    return raw ? BASE + (raw.startsWith('/') ? raw : '/' + raw) : '';
  };
  const request = async (url, headers) => {
    const response = await dxplay.fetch({
      url: absolute(url),
      headers: Object.assign({'User-Agent': UA, Referer: BASE + '/'}, sourceHeaders, headers || {}),
    });
    if (response.status < 200 || response.status >= 300) throw new Error('kugou.request-failed');
    return response.body;
  };
  const utf8 = value => {
    const encoded = encodeURIComponent(text(value)), bytes = [];
    for (let index = 0; index < encoded.length; index += 1) {
      if (encoded[index] === '%') { bytes.push(parseInt(encoded.slice(index + 1, index + 3), 16)); index += 2; }
      else bytes.push(encoded.charCodeAt(index));
    }
    return bytes;
  };
  const add32 = (...values) => values.reduce((sum, value) => (sum + (value >>> 0)) >>> 0, 0);
  const rotate = (value, count) => ((value << count) | (value >>> (32 - count))) >>> 0;
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
        const oldD = d; d = c; c = b;
        b = add32(b, rotate(add32(a, f, MD5_CONSTANT[index], words[word]), MD5_SHIFT[index])); a = oldD;
      }
      a0 = add32(a0, a); b0 = add32(b0, b); c0 = add32(c0, c); d0 = add32(d0, d);
    }
    return [a0,b0,c0,d0].map(word => [0,8,16,24].map(shift => ((word >>> shift) & 255).toString(16).padStart(2, '0')).join('')).join('');
  };
  const rankUrl = id => BASE + '/yy/rank/home/1-' + id + '.html?from=rank';
  const songs = html => {
    const output = [], seen = Object.create(null);
    for (const match of text(html).matchAll(/<a\b([^>]*class=["'][^"']*pc_temp_songname[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi)) {
      const url = absolute(attr(match[1], 'href')), id = url.match(/\/mixsong\/([A-Za-z0-9]+)\.html/i)?.[1] || '';
      if (!id || seen[id]) continue;
      const name = strip(attr(match[1], 'title') || match[2]);
      if (!name) continue;
      seen[id] = true; output.push({id: url, sourceKey, name, remark: '歌曲'});
    }
    return output;
  };
  const ranks = (html, groupIndex) => {
    const output = [], seen = Object.create(null);
    const clean = text(html).replace(/<!--[\s\S]*?-->/g, '');
    const block = clean.match(new RegExp('<div\\b[^>]*class=["\\\'][^"\\\']*pc_rank_sidebar[^"\\\']*["\\\'][^>]*>[\\s\\S]*?<h3\\b[^>]*data-index=["\\\']' + groupIndex + '["\\\'][^>]*>[\\s\\S]*?<ul\\b[^>]*>([\\s\\S]*?)<\\/ul>', 'i'))?.[1] || '';
    for (const match of block.matchAll(/<a\b([^>]*href=["'][^"']*\/yy\/rank\/home\/1-\d+\.html[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi)) {
      const url = absolute(attr(match[1], 'href')), name = strip(attr(match[1], 'title') || match[2]);
      if (!url || !name || seen[url]) continue;
      seen[url] = true; output.push({id: url, sourceKey, name, remark: '榜单'});
    }
    return output;
  };
  const songMetadata = html => {
    const hash = text(html).match(/"hash"\s*:\s*"([A-Fa-f0-9]{32})"/)?.[1]?.toLowerCase() || '';
    const albumId = text(html).match(/"album_id"\s*:\s*"?(\d+)"?/)?.[1] || '';
    const dataName = text(html).match(/"audio_name"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/)?.[1] || '';
    let name = '';
    try { name = dataName ? JSON.parse('"' + dataName + '"') : ''; } catch (_) { name = dataName; }
    if (!name) name = strip(text(html).match(/<span\b[^>]*class=["'][^"']*audioName[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]);
    return {hash, albumId, name};
  };
  const gatewayMedia = async (hash, albumId) => {
    const mid = md5(String(Date.now()) + ':' + String(Math.random()));
    const key = md5(hash + SIGN_SALT + APP_ID + mid + '0');
    const query = [
      'dfid=', 'pid=2', 'mid=' + mid, 'cmd=26', 'token=', 'hash=' + hash,
      'area_code=1', 'behavior=play', 'appid=' + APP_ID, 'module=', 'vipType=6',
      'ptype=1', 'userid=0', 'mtype=1', 'album_id=' + albumId, 'pidversion=3001',
      'key=' + key, 'version=11430', 'album_audio_id=', 'IsFreePart=0',
      'ssa_flag=is_fromtrack', 'cdnBackup=1', 'page_id=151369488',
      'ppage_id=463467626%2C350369493%2C788954147', 'quality=128', 'with_res_tag=1',
    ].join('&');
    const raw = await request('https://gateway.kugou.com/i/v2/?' + query, {'User-Agent': PLAYER_UA, Host: 'gateway.kugou.com', 'x-router': 'tracker.kugou.com'});
    let payload;
    try { payload = JSON.parse(raw.replace('<!--KG_TAG_RES_START-->', '').replace('<!--KG_TAG_RES_END-->', '').trim()); }
    catch (_) { throw new Error('kugou.gateway-invalid'); }
    const candidates = [];
    for (const value of [].concat(payload.url || [], payload.backupUrl || payload.backup_url || [])) {
      const url = absolute(value);
      if (url && !candidates.includes(url)) candidates.push(url);
    }
    const full = candidates.find(url => !/clip_|\/part\/|\/clip\//i.test(url) && /\/full\//i.test(url));
    if (!full) throw new Error('kugou.full-track-unavailable');
    return full;
  };

  dxplay.register({
    id: 'org.dxsrc.cluntop.kugou-rank',
    name: 'Kugou public charts',
    description: 'Readable rewrite of Kugou public ranking pages and anonymously available full MP3 playback.',
    version: '1.0.0',
    protocol: 'catalog@1',
    async init(input) {
      sourceKey = text(input.sourceKey) || 'kugou-rank'; sourceHeaders = input.headers || {};
      return {ready: true};
    },
    async home() {
      const html = await request(rankUrl('6666'));
      return {categories: GROUPS.map(group => ({id: group.id, name: group.name})), featured: songs(html).slice(0, 30)};
    },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1), parts = text(input.categoryId).split('|'), seed = parts[0] || '6666', groupIndex = Math.max(0, Number(parts[1]) || 0);
      const items = page === 1 ? ranks(await request(rankUrl(seed)), groupIndex) : [];
      return {page, pageCount: 1, items};
    },
    async search(input) {
      return {page: Math.max(1, Number(input.page) || 1), pageCount: 1, items: []};
    },
    async detail(input) {
      const id = absolute(text(input.id));
      if (!/^https:\/\/www\.kugou\.com\/(?:yy\/rank\/home\/1-\d+\.html|mixsong\/[A-Za-z0-9]+\.html)/i.test(id)) throw new Error('kugou.detail-invalid');
      const html = await request(id);
      if (/\/mixsong\//i.test(id)) {
        const meta = songMetadata(html), name = meta.name || id;
        return {id, sourceKey, name, playGroups: [{id: 'music', name: '音乐', episodes: [{id: id.match(/\/mixsong\/([^/.]+)/i)?.[1] || id, name, playId: id}]}]};
      }
      const name = strip(html.match(/<div\b[^>]*class=["'][^"']*pc_temp_title[^"']*["'][^>]*>[\s\S]*?<h3\b[^>]*>([\s\S]*?)<\/h3>/i)?.[1]) || '酷狗榜单';
      const episodes = songs(html).map((song, index) => ({id: String(index + 1), name: song.name, playId: song.id}));
      if (!episodes.length) throw new Error('kugou.songs-unavailable');
      return {id, sourceKey, name, playGroups: [{id: 'music', name: '榜单', episodes}]};
    },
    async play(input) {
      const pageUrl = absolute(text(input.playId)), html = await request(pageUrl), meta = songMetadata(html);
      if (!meta.hash) throw new Error('kugou.hash-unavailable');
      const rawUrl = await gatewayMedia(meta.hash, meta.albumId);
      return {sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl, headers: {'User-Agent': PLAYER_UA, Referer: BASE + '/'}, parse: false};
    },
    async destroy() { sourceKey = ''; sourceHeaders = {}; },
  });
})();
