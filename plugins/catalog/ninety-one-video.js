/* global dxplay */
(() => {
  'use strict';

  const BASE_URLS = ['https://91porn.com', 'https://0708.fs708.com', 'https://a.91kp.net'];
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
  const COOKIE = 'language=cn_CN; over18=1; CLIPSHARE=1';
  const CATEGORIES = [
    ['watch', '最新'], ['ori', '91原创'], ['hot', '当前最热'], ['top', '本月最热'],
    ['long', '10分钟以上'], ['longer', '20分钟以上'], ['tf', '本月收藏'],
    ['rf', '最近加精'], ['hd', '高清'], ['top_m', '每月最热'],
    ['md', '本月讨论'], ['mf', '收藏最多'],
  ];
  let activeBase = BASE_URLS[0];
  let sourceKey = '';

  const text = value => value === undefined || value === null ? '' : String(value);
  const decode = value => text(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(parseInt(decimal, 10)))
    .replace(/&amp;/gi, '&').replace(/&quot;|&#34;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&nbsp;|&#160;/gi, ' ');
  const clean = value => decode(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const first = (value, pattern, group = 1) => {
    const match = text(value).match(pattern);
    return match ? text(match[group]) : '';
  };
  const absolute = value => {
    const raw = decode(value).trim();
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('//')) return 'https:' + raw;
    return raw ? activeBase + (raw.startsWith('/') ? raw : '/' + raw) : '';
  };
  const requestHeaders = referer => ({
    'User-Agent': USER_AGENT,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    Cookie: COOKIE,
    Referer: referer || activeBase + '/',
  });
  const request = async path => {
    let relative = text(path).trim();
    for (const base of BASE_URLS) {
      if (relative.startsWith(base)) { relative = relative.slice(base.length); break; }
    }
    if (!relative.startsWith('/')) relative = '/' + relative;
    for (const base of [activeBase, ...BASE_URLS.filter(value => value !== activeBase)]) {
      try {
        const response = await dxplay.fetch({url: base + relative, headers: requestHeaders(base + '/')});
        if (response.status >= 200 && response.status < 300 && text(response.body).trim()) {
          activeBase = base;
          return response.body;
        }
      } catch (_error) {}
    }
    throw new Error('ninety-one.request-failed');
  };
  const blocks = html => {
    const marker = 'col-xs-12 col-sm-4 col-md-3 col-lg-3';
    const output = [];
    let offset = 0;
    while (output.length < 120) {
      const start = html.indexOf(marker, offset);
      if (start < 0) break;
      const next = html.indexOf(marker, start + marker.length);
      output.push(html.slice(start, next < 0 ? Math.min(html.length, start + 7000) : next));
      if (next < 0) break;
      offset = next;
    }
    return output;
  };
  const parseItems = html => {
    const output = [];
    const seen = Object.create(null);
    for (const block of blocks(text(html))) {
      const href = decode(first(block, /<a[^>]*href=["']([^"']*view_video\.php\?[^"']*viewkey=[^"']+)["']/i));
      const id = first(href, /[?&]viewkey=([a-z0-9]+)/i);
      const name = clean(first(block, /class=["'][^"']*video-title[^"']*["'][^>]*>([\s\S]*?)<\/span>/i));
      if (!id || !name || seen[id]) continue;
      seen[id] = true;
      const image = first(block, /<img[^>]*>/i, 0);
      const poster = absolute(first(image, /(?:data-src|data-original|src)=["']?([^"'\s>]+)/i));
      const duration = clean(first(block, /class=["'][^"']*duration[^"']*["'][^>]*>([\s\S]*?)<\/span>/i));
      output.push({id, sourceKey, name, ...(poster ? {poster} : {}), ...(duration ? {remark: duration} : {})});
    }
    return output;
  };
  const pageCount = html => {
    let maximum = 1;
    const pattern = /[?&]page=(\d+)/gi;
    let match;
    while ((match = pattern.exec(text(html))) !== null) maximum = Math.max(maximum, Number(match[1]) || 1);
    return maximum;
  };
  const detailPath = id => '/view_video.php?viewkey=' + encodeURIComponent(text(id));
  const decodePlayer = html => {
    const pattern = /strencode2\(\s*["']([^"']+)["']\s*\)/gi;
    let match;
    while ((match = pattern.exec(text(html))) !== null) {
      let decoded = '';
      try { decoded = decodeURIComponent(match[1]); } catch (_error) { continue; }
      const value = decode(first(decoded, /\bsrc=["']([^"']+)["']/i)).trim();
      if (/^https?:\/\/[^\s]+\.(?:mp4|m3u8)(?:$|[?#])/i.test(value)) return value;
    }
    return '';
  };
  const titleFromDetail = html => clean(first(html, /<title[^>]*>([\s\S]*?)<\/title>/i))
    .replace(/\s*-\s*91porn.*$/i, '').trim();
  const posterFromDetail = html => absolute(first(html, /<video[^>]*\bposter=["']([^"']+)/i));

  dxplay.register({
    id: 'org.dxsrc.cluntop.ninety-one-video',
    name: '91 video catalog',
    description: 'Readable rewrite of the reachable public catalog, search, detail and page-declared direct media flow.',
    version: '1.0.0',
    protocol: 'catalog@1',
    async init(input) {
      sourceKey = text(input.sourceKey) || 'ninety-one-video';
      return {ready: true};
    },
    async home() {
      const html = await request('/index.php');
      return {categories: CATEGORIES.map(value => ({id: value[0], name: value[1]})), featured: parseItems(html)};
    },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const categoryId = CATEGORIES.some(value => value[0] === text(input.categoryId)) ? text(input.categoryId) : 'watch';
      const category = categoryId === 'top_m' ? 'top&m=-1' : encodeURIComponent(categoryId);
      const html = await request('/v.php?category=' + category + '&viewtype=basic&page=' + page);
      const items = parseItems(html);
      return {page, pageCount: Math.max(page, pageCount(html)), items};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const keyword = text(input.keyword).trim();
      if (!keyword) return {page, pageCount: page, items: []};
      const html = await request('/search_result.php?search_id=' + encodeURIComponent(keyword)
        + '&search_type=search_videos&min_duration=&page=' + page);
      const items = parseItems(html);
      return {page, pageCount: Math.max(page, pageCount(html)), items};
    },
    async detail(input) {
      const id = text(input.id).trim();
      if (!/^[a-z0-9]+$/i.test(id)) throw new Error('ninety-one.item-invalid');
      const html = await request(detailPath(id));
      const name = titleFromDetail(html);
      if (!name) throw new Error('ninety-one.detail-unavailable');
      const poster = posterFromDetail(html);
      return {
        id, sourceKey, name, ...(poster ? {poster} : {}),
        playGroups: [{id: 'main', name: '91', episodes: [{id: '1', name: '正片', playId: id}]}],
      };
    },
    async play(input) {
      const id = text(input.playId).trim();
      if (!/^[a-z0-9]+$/i.test(id)) throw new Error('ninety-one.play-invalid');
      const rawUrl = decodePlayer(await request(detailPath(id)));
      if (!rawUrl) throw new Error('ninety-one.play-unavailable');
      return {
        sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl,
        headers: requestHeaders(activeBase + '/'), parse: false,
      };
    },
    async destroy() { sourceKey = ''; activeBase = BASE_URLS[0]; },
  });
})();
