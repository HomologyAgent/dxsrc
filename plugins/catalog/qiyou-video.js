/* global dxplay */
(() => {
  'use strict';
  const DEFAULT_BASE = 'http://www.qiyoudy2.com';
  const UA = 'Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)';
  const PLAYER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  const CATEGORIES = [['1','电影'],['2','电视剧'],['3','动漫'],['4','综艺']];
  let sourceKey = '', sourceHeaders = {}, baseUrl = DEFAULT_BASE;
  const text = value => value === undefined || value === null ? '' : String(value);
  const decode = value => text(value).replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const strip = value => decode(text(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
  const attr = (attributes, name) => decode(text(attributes).match(new RegExp('\\b' + name + '=["\\\']([^"\\\']*)["\\\']', 'i'))?.[1] || '');
  const absolute = (value, base = baseUrl) => {
    const raw = text(value).trim();
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('//')) return 'http:' + raw;
    return raw ? base.replace(/\/+$/, '') + (raw.startsWith('/') ? raw : '/' + raw) : '';
  };
  const request = async (value, referer = baseUrl + '/') => {
    const response = await dxplay.fetch({url: absolute(value), headers: Object.assign({'User-Agent': UA, Referer: referer}, sourceHeaders)});
    if (response.status < 200 || response.status >= 300) throw new Error('qiyou-video.request-failed');
    return response.body.replace(/^\uFEFF/, '').replace(/^\s*<\?xml[^>]*\?>/i, '');
  };
  const searchRequest = async keyword => {
    const response = await dxplay.fetch({
      url: absolute('/search.php'),
      method: 'POST',
      headers: Object.assign({'User-Agent': UA, Referer: baseUrl + '/', Origin: baseUrl, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'}, sourceHeaders),
      body: 'searchword=' + encodeURIComponent(keyword),
    });
    if (response.status < 200 || response.status >= 300) throw new Error('qiyou-video.request-failed');
    return response.body;
  };
  const cards = html => {
    const output = [], seen = Object.create(null);
    for (const match of html.matchAll(/<a\b([^>]*href=["'][^"']*\/view\/\d+\.html["'][^>]*)>([\s\S]*?)<\/a>/gi)) {
      const href = attr(match[1], 'href'), id = href.match(/\/view\/(\d+)\.html/i)?.[1];
      if (!id || seen[id]) continue;
      const image = match[2].match(/<img\b([^>]*)>/i)?.[1] || '';
      const name = attr(match[1], 'title') || attr(image, 'alt') || strip(match[2]);
      if (!name) continue;
      seen[id] = true;
      const poster = absolute(attr(match[1], 'data-original') || attr(image, 'data-original') || attr(image, 'data-src') || attr(image, 'src'));
      output.push({id, sourceKey, name, ...(poster && /^https?:\/\//i.test(poster) ? {poster} : {})});
    }
    return output;
  };

  dxplay.register({
    id: 'org.dxsrc.cluntop.qiyou-video', name: 'Qiyou video',
    description: 'Readable rewrite of the public Qiyou catalog, episode lines, iframe handshake and direct HLS resolver.',
    version: '1.0.0', protocol: 'catalog@1',
    async init(input) {
      sourceKey = text(input.sourceKey) || 'qiyou-video';
      sourceHeaders = input.headers || {};
      const extension = input.extension && typeof input.extension === 'object' ? input.extension : {};
      baseUrl = text(extension.baseUrl || extension.host).replace(/\/+$/, '') || DEFAULT_BASE;
      if (!/^https?:\/\//i.test(baseUrl)) throw new Error('qiyou-video.configuration-invalid');
      return {ready: true};
    },
    async home() { return {categories: CATEGORIES.map(value => ({id: value[0], name: value[1]})), featured: cards(await request('/'))}; },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1), id = encodeURIComponent(text(input.categoryId));
      const found = cards(await request(page === 1 ? '/list/' + id + '.html' : '/list/' + id + '_' + page + '.html'));
      return {page, pageCount: found.length ? page + 1 : page, items: found};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      if (page > 1) return {page, pageCount: page, items: []};
      const found = cards(await searchRequest(text(input.keyword)));
      return {page, pageCount: page, items: found};
    },
    async detail(input) {
      const id = text(input.id).replace(/\D/g, ''), html = await request('/view/' + id + '.html');
      const lineNames = Object.create(null);
      const tabs = html.match(/<ul\b[^>]*class=["'][^"']*nav-tabs[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i)?.[1] || '';
      for (const match of tabs.matchAll(/<a\b([^>]*data-toggle=["']tab["'][^>]*)>([\s\S]*?)<\/a>/gi)) {
        const target = attr(match[1], 'href').replace(/^#/, ''), name = strip(match[2]);
        if (target && name) lineNames[target] = name;
      }
      const playGroups = [];
      for (const panel of html.matchAll(/<div\b([^>]*class=["'][^"']*tab-pane[^"']*["'][^>]*)>([\s\S]*?)(?=<div\b[^>]*class=["'][^"']*tab-pane|<\/div>\s*<\/div>)/gi)) {
        const panelId = attr(panel[1], 'id');
        if (!/^down/i.test(panelId)) continue;
        const episodes = [];
        for (const match of panel[2].matchAll(/<a\b([^>]*href=["'][^"']*\/play\/[^"']+["'][^>]*)>([\s\S]*?)<\/a>/gi)) {
          const href = attr(match[1], 'href'), parts = href.match(/\/play\/(\d+)-(\d+)-(\d+)\.html/i);
          if (!href || episodes.some(value => value.playId === href)) continue;
          episodes.push({id: parts ? parts[2] + ':' + parts[3] : String(episodes.length + 1), name: attr(match[1], 'title') || strip(match[2]) || '播放', playId: href});
        }
        if (episodes.length) playGroups.push({id: panelId || String(playGroups.length + 1), name: lineNames[panelId] || '线路' + (playGroups.length + 1), episodes});
      }
      if (!playGroups.length) {
        const match = html.match(/<a\b([^>]*href=["'][^"']*\/play\/[^"']+["'][^>]*)>([\s\S]*?)<\/a>/i);
        if (match) playGroups.push({id: 'line-1', name: '线路1', episodes: [{id: '1', name: strip(match[2]) || '正片', playId: attr(match[1], 'href')}]});
      }
      if (!playGroups.length) throw new Error('qiyou-video.episodes-unavailable');
      const name = strip(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || html.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i)?.[1]) || id;
      const image = html.match(/<div\b[^>]*class=["'][^"']*stui-content__thumb[^"']*["'][^>]*>[\s\S]*?<img\b([^>]*)>/i)?.[1] || '';
      const poster = absolute(attr(image, 'data-original') || attr(image, 'src'));
      return {id, sourceKey, name, ...(poster ? {poster} : {}), playGroups};
    },
    async play(input) {
      const pageUrl = absolute(text(input.playId)), html = await request(pageUrl);
      let url = html.match(/videoUrl\s*=\s*["']([^"']+)/i)?.[1] || '';
      if (!url) {
        const iframe = html.match(/<iframe\b[^>]*src=["']([^"']+)/i)?.[1];
        if (iframe) {
          const frameUrl = absolute(iframe), frame = await request(frameUrl, pageUrl);
          url = frame.match(/videoUrl\s*=\s*["']([^"']+)/i)?.[1] || '';
          if (!url) {
            const mediaId = frame.match(/const\s+Url\s*=\s*["']([^"']+)/i)?.[1], sign = frame.match(/const\s+Sign\s*=\s*["']([^"']+)/i)?.[1], type = frame.match(/const\s+From\s*=\s*["']([^"']+)/i)?.[1] || 'm3u8';
            const origin = frameUrl.match(/^(https?:\/\/[^/]+)/i)?.[1];
            if (origin && mediaId && sign) {
              const payload = await request(origin + '/player/api.php?url=' + encodeURIComponent(mediaId) + '&sign=' + encodeURIComponent(sign) + '&t=' + encodeURIComponent(type), pageUrl);
              try { const parsed = JSON.parse(payload); if (Number(parsed.code) === 200) url = text(parsed.url); } catch (_) {}
            }
          }
        }
      }
      url = decode(url).replace(/\\\//g, '/');
      if (!/^https?:\/\//i.test(url)) throw new Error('qiyou-video.play-unavailable');
      const referer = (url.match(/^(https?:\/\/[^/]+)/i)?.[1] || baseUrl) + '/';
      return {sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl: url, headers: {'User-Agent': PLAYER_UA, Referer: referer}, parse: false};
    },
    async destroy() { sourceKey = ''; sourceHeaders = {}; baseUrl = DEFAULT_BASE; },
  });
})();
