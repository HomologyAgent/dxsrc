/* global dxplay */
(() => {
  'use strict';

  const BASE_URL = 'https://xx01.com';
  const PLAYER_PROXY = 'https://pl3.vvvvvvvv.top/api/play?url=';
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
  const CATEGORIES = [
    ['chinese-subtitle', '中文字幕'], ['madou', '国产AV'], ['genres/外国女优', '欧美大片'],
    ['PLANTSVSCUNTS', '猎奇'], ['masem', '马赛姆'], ['kinostream', 'kinostream'],
    ['TIMESTUDIO', '时间工作室'], ['anime', '成人动漫'], ['new', '最近更新'],
    ['release', '新作上市'], ['uncensored-leak', '无码流出'], ['genres', '类型'],
    ['VR', 'VR'], ['avtalk', 'AV解说'], ['siro', 'SIRO'], ['luxu', 'LUXU'],
    ['gana', 'GANA'], ['maan', 'PRESTIGE PREMIUM'], ['scute', 'S-CUTE'], ['ara', 'ARA'],
    ['fc2', 'FC2'], ['heyzo', 'HEYZO'], ['tokyohot', '東京熱'], ['1pondo', '一本道'],
    ['caribbeancom', 'Caribbeancom'], ['caribbeancompr', 'Caribbeancompr'],
    ['10musume', '10musume'], ['pacopacomama', 'pacopacomama'], ['gachinco', 'Gachinco'],
    ['xxxav', 'XXX-AV'], ['marriedslash', '人妻斬'], ['naughty4610', '頑皮4610'],
    ['naughty0930', '頑皮0930'], ['twav', 'TWAV'], ['furuke', 'Furuke'],
    ['klive', '韓國直播'], ['clive', '中國直播'], ['tiktok', '抖阴视频'],
    ['starface', '明星换脸'], ['cnlive', '主播直播'], ['cmedia', '国产传媒'],
    ['playgirl', '玩偶姐姐'], ['netdoor', '网曝黑料'],
  ];
  const CATEGORY_IDS = CATEGORIES.reduce((values, category) => {
    values[category[0]] = true;
    return values;
  }, Object.create(null));
  let sourceKey = '';

  const text = value => value === undefined || value === null ? '' : String(value);
  const decodeEntities = value => text(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(parseInt(decimal, 10)))
    .replace(/&amp;/gi, '&').replace(/&quot;|&#34;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&nbsp;|&#160;/gi, ' ');
  const clean = value => decodeEntities(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const absolute = value => {
    const raw = decodeEntities(value).trim();
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('//')) return 'https:' + raw;
    return raw ? BASE_URL + (raw.startsWith('/') ? raw : '/' + raw) : '';
  };
  const first = (value, pattern, group = 1) => {
    const match = text(value).match(pattern);
    return match ? text(match[group]) : '';
  };
  const blocks = (html, marker, limit = 180) => {
    const output = [];
    let offset = 0;
    while (output.length < limit) {
      const start = html.indexOf(marker, offset);
      if (start < 0) break;
      const next = html.indexOf(marker, start + marker.length);
      output.push(html.slice(start, next < 0 ? Math.min(html.length, start + 7000) : next));
      if (next < 0) break;
      offset = next;
    }
    return output;
  };
  const request = async path => {
    const response = await dxplay.fetch({
      url: absolute(path),
      headers: {'User-Agent': USER_AGENT, Referer: BASE_URL + '/'},
    });
    if (response.status < 200 || response.status >= 300) throw new Error('xx01.request-failed');
    return response.body;
  };
  const unique = values => {
    const output = [];
    const seen = Object.create(null);
    for (const value of values) {
      if (!value || !value.id || seen[value.id]) continue;
      seen[value.id] = true;
      output.push(value);
    }
    return output;
  };
  const parseItems = html => unique(blocks(html, 'class="thumbnail group"').map(block => {
    const href = first(block, /<a[^>]*href=["']\/([^"'?#]+)["'][^>]*>/i);
    if (!href || CATEGORY_IDS[href] || href.includes('/') && /^(?:search|genres|dm|api)\//i.test(href)) return null;
    const image = first(block, /<img[^>]*>/i, 0);
    const anchorTitle = first(block, /<a[^>]*class=["'][^"']*text-secondary[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
    const name = clean(anchorTitle || first(image, /alt=["']([^"']+)["']/i) || href);
    const poster = absolute(first(image, /(?:data-src|data-original|src)=["']([^"']+)["']/i));
    const duration = clean(first(block, /bottom-1 right-1[^>]*>([\s\S]*?)<\/span>/i));
    return {id: href, sourceKey, name, ...(poster ? {poster} : {}), ...(duration ? {remark: duration} : {})};
  }));

  const unescapeScriptString = value => {
    let output = '';
    for (let index = 0; index < value.length; index += 1) {
      const current = value[index];
      if (current !== '\\' || index + 1 >= value.length) { output += current; continue; }
      const next = value[++index];
      if (next === 'n') output += '\n';
      else if (next === 'r') output += '\r';
      else if (next === 't') output += '\t';
      else if (next === 'x' && /^[0-9a-f]{2}$/i.test(value.slice(index + 1, index + 3))) {
        output += String.fromCharCode(parseInt(value.slice(index + 1, index + 3), 16)); index += 2;
      } else if (next === 'u' && /^[0-9a-f]{4}$/i.test(value.slice(index + 1, index + 5))) {
        output += String.fromCharCode(parseInt(value.slice(index + 1, index + 5), 16)); index += 4;
      } else output += next;
    }
    return output;
  };
  const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const unpackPacker = html => {
    const marker = 'eval(function(p,a,c,k,e,d)';
    const offset = html.indexOf(marker);
    if (offset < 0) return '';
    const packed = html.slice(offset, Math.min(html.length, offset + 12000));
    const match = packed.match(/eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?\}\(\s*'((?:\\.|[^'])*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:\\.|[^'])*)'\.split\('\|'\)/i);
    if (!match) return '';
    let payload = unescapeScriptString(match[1]);
    const radix = Number(match[2]);
    const count = Number(match[3]);
    const keys = unescapeScriptString(match[4]).split('|');
    if (radix < 2 || radix > 36 || count < 1 || count > 10000) throw new Error('xx01.packer-invalid');
    for (let index = count - 1; index >= 0; index -= 1) {
      if (!keys[index]) continue;
      payload = payload.replace(new RegExp('\\b' + escapeRegExp(index.toString(radix)) + '\\b', 'g'), keys[index]);
    }
    return payload;
  };
  const resolvePlayback = html => {
    const unpacked = unpackPacker(html);
    if (!unpacked) throw new Error('xx01.player-payload-missing');
    const candidates = [];
    const pattern = /\b(?:source|source842|source1280)\s*=\s*["'](https?:\/\/[^"']+)["']/gi;
    let match;
    while ((match = pattern.exec(unpacked)) !== null && candidates.length < 8) candidates.push(match[1].replace(/\\\//g, '/'));
    const source = candidates.find(value => /(?:\.m3u8|\/playlist|\/hls\/|\/stream\/)/i.test(value)) || candidates[0];
    if (!source) throw new Error('xx01.play-unavailable');
    if (/\/proxy\/|pl\d+\.vvvvvvvv\.top|player\.xxnet999\.com|\/index\.m3u8/i.test(source) || source.startsWith('/')) return absolute(source);
    return PLAYER_PROXY + encodeURIComponent(source);
  };

  dxplay.register({
    id: 'org.dxsrc.cluntop.xx01-video',
    name: 'XX01 video catalog',
    description: 'Readable rewrite of the public XX01 HTML catalog and its declared packed HLS source.',
    version: '1.0.0',
    protocol: 'catalog@1',
    async init(input) {
      sourceKey = text(input.sourceKey) || 'xx01-video';
      return {ready: true};
    },
    async home() {
      const featured = parseItems(await request('/'));
      return {categories: CATEGORIES.map(value => ({id: value[0], name: value[1]})), featured};
    },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const suffix = page > 1 ? '?page=' + page : '';
      const items = parseItems(await request('/' + encodeURI(text(input.categoryId)) + suffix));
      return {page, pageCount: items.length ? page + 1 : page, items};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const suffix = page > 1 ? '?page=' + page : '';
      const items = parseItems(await request('/search/' + encodeURIComponent(text(input.keyword)) + suffix));
      return {page, pageCount: items.length ? page + 1 : page, items};
    },
    async detail(input) {
      const id = text(input.id).replace(/^\/+|\/+$/g, '');
      const html = await request('/' + id);
      const name = clean(first(html, /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)/i)
        || first(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i) || id);
      const poster = absolute(first(html, /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)/i));
      const description = clean(first(html, /<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)/i)
        || first(html, /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)/i));
      const playId = resolvePlayback(html);
      return {
        id, sourceKey, name, ...(poster ? {poster} : {}), ...(description ? {description} : {}),
        playGroups: [{id: 'main', name: 'XX01', episodes: [{id: '1', name: '正片', playId}]}],
      };
    },
    async play(input) {
      const rawUrl = text(input.playId);
      if (!/^https?:\/\//i.test(rawUrl)) throw new Error('xx01.play-unavailable');
      return {
        sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl,
        headers: {'User-Agent': USER_AGENT, Referer: BASE_URL + '/'}, parse: false,
      };
    },
    async destroy() { sourceKey = ''; },
  });
})();
