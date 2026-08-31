/* global dxplay */
(() => {
  'use strict';
  const BASE = 'https://www.yymp3.com';
  const MEDIA_BASE = 'https://ting8.yymp3.com/';
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  let sourceKey = '', sourceHeaders = {};
  const text = value => value === undefined || value === null ? '' : String(value);
  const decode = value => text(value).replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const strip = value => decode(text(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
  const attr = (attributes, name) => decode(text(attributes).match(new RegExp('\\b' + name + '=(?:["\\\']([^"\\\']*)["\\\']|([^\\s>]+))', 'i'))?.slice(1).find(Boolean) || '');
  const absolute = value => {
    const raw = text(value).trim();
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('//')) return 'https:' + raw;
    return raw ? BASE + (raw.startsWith('/') ? raw : '/' + raw) : '';
  };
  const request = async path => {
    const response = await dxplay.fetch({url: absolute(path), headers: Object.assign({'User-Agent': UA, Referer: BASE + '/'}, sourceHeaders)});
    if (response.status < 200 || response.status >= 300) throw new Error('yymp3.request-failed');
    return response.body;
  };
  const songItems = html => {
    const output = [], seen = Object.create(null);
    for (const match of html.matchAll(/<a\b([^>]*href=(?:["']?)[^\s"'>]*\/Play\/\d+\/\d+\.htm["']?[^>]*)>([\s\S]*?)<\/a>/gi)) {
      const href = attr(match[1], 'href'), parts = href.match(/\/Play\/(\d+)\/(\d+)\.htm/i);
      if (!parts || seen[parts[2]]) continue;
      const name = strip(match[2]); if (!name || /试听|歌词/.test(name)) continue;
      seen[parts[2]] = true;
      output.push({id: '/Play/' + parts[1] + '/' + parts[2] + '.htm', sourceKey, name});
    }
    return output;
  };
  const categories = html => {
    const nav = html.match(/<div\b[^>]*id=["']nav_box["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || '';
    const output = [], seen = Object.create(null);
    for (const match of nav.matchAll(/<a\b([^>]*href=["']?[^\s"'>]+["']?[^>]*)>([\s\S]*?)<\/a>/gi)) {
      const href = attr(match[1], 'href'), name = strip(match[2]);
      if (!/^\/Art\/[^\s]+\.html$/i.test(href) || !name || /首页|动漫音乐/.test(name) || seen[href]) continue;
      seen[href] = true; output.push({id: href, name});
    }
    return output;
  };

  dxplay.register({
    id: 'org.dxsrc.cluntop.yymp3', name: 'YYMP3 music',
    description: 'Readable rewrite of the public YYMP3 singer catalog, song search and direct MP3 playback.',
    version: '1.0.0', protocol: 'catalog@1',
    async init(input) { sourceKey = text(input.sourceKey) || 'yymp3'; sourceHeaders = input.headers || {}; return {ready: true}; },
    async home() { const html = await request('/'); return {categories: categories(html), featured: songItems(html)}; },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const html = await request(text(input.categoryId)), found = [], seen = Object.create(null);
      for (const list of html.matchAll(/<ul\b[^>]*class=["'][^"']*Cate_slist[^"']*["'][^>]*>([\s\S]*?)<\/ul>/gi)) {
        for (const match of list[1].matchAll(/<a\b([^>]*href=["']?[^\s"'>]*\/Singer\/\d+\.htm["']?[^>]*)>([\s\S]*?)<\/a>/gi)) {
          const href = attr(match[1], 'href'), id = href.match(/\/Singer\/(\d+)\.htm/i)?.[1], name = strip(match[2]);
          if (!id || !name || seen[id]) continue;
          seen[id] = true; found.push({id: '/Singer/' + id + '.htm', sourceKey, name, remark: '歌手'});
        }
      }
      const pageSize = 200, pageCount = Math.max(1, Math.ceil(found.length / pageSize));
      return {page, pageCount, items: found.slice((page - 1) * pageSize, page * pageSize)};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1), html = await request('/search/?page=' + page + '&key=' + encodeURIComponent(text(input.keyword)) + '&tp=1');
      const found = [], seen = Object.create(null), block = html.match(/<ul\b[^>]*class=["'][^"']*searchResult[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i)?.[1] || '';
      for (const row of block.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
        const song = row[1].match(/<div\b[^>]*class=["'][^"']*p3[^"']*["'][^>]*>[\s\S]*?<a\b([^>]*)>([\s\S]*?)<\/a>/i);
        if (!song) continue;
        const href = attr(song[1], 'href'), parts = href.match(/\/Play\/(\d+)\/(\d+)\.htm/i), title = strip(song[2]);
        if (!parts || !title || seen[parts[2]]) continue;
        seen[parts[2]] = true;
        const singer = strip(row[1].match(/<div\b[^>]*class=["'][^"']*p2[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]);
        found.push({id: '/Play/' + parts[1] + '/' + parts[2] + '.htm', sourceKey, name: singer ? title + ' · ' + singer : title, remark: '歌曲'});
      }
      return {page, pageCount: found.length ? page + 1 : page, items: found};
    },
    async detail(input) {
      const id = text(input.id), html = await request(id);
      if (/\/Play\/\d+\/\d+\.htm/i.test(id)) {
        const data = html.match(/\$song_data\[0\]\s*=\s*["']([^"']*)/i)?.[1]?.split('|') || [], name = text(data[1]) || strip(html.match(/<div\b[^>]*id=["']play_title["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]) || id;
        return {id, sourceKey, name, actors: text(data[3]), playGroups: [{id: 'music', name: '音乐', episodes: [{id: text(data[0]) || id, name, playId: id}]}]};
      }
      const name = strip(html.match(/<h1\b[^>]*class=["'][^"']*title1[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1]).replace(/\s*专辑列表\s*$/, '') || id;
      const episodes = songItems(html).map(value => ({id: value.id.match(/(\d+)\.htm$/)?.[1] || value.id, name: value.name, playId: value.id}));
      if (!episodes.length) throw new Error('yymp3.songs-unavailable');
      const image = html.match(/<img\b([^>]*(?:albumcover|singer)[^>]*)>/i)?.[1] || html.match(/<img\b([^>]*src=["'][^"']*img\.yymp3[^"']*["'][^>]*)>/i)?.[1] || '', poster = absolute(attr(image, 'src'));
      return {id, sourceKey, name, ...(poster ? {poster} : {}), playGroups: [{id: 'music', name: '热门歌曲', episodes}]};
    },
    async play(input) {
      const pageUrl = absolute(text(input.playId)), html = await request(pageUrl), raw = html.match(/\$song_data\[0\]\s*=\s*["']([^"']*)/i)?.[1] || '', values = raw.split('|');
      let path = text(values[4]).trim();
      if (!path) throw new Error('yymp3.play-unavailable');
      path = path.replace(/\.wma(?=$|[?#])/i, '.mp3');
      const url = /^https?:\/\//i.test(path) ? path : MEDIA_BASE + path.replace(/^\/+/, '');
      return {sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl: url, headers: {'User-Agent': UA, Referer: pageUrl}, parse: false};
    },
    async destroy() { sourceKey = ''; sourceHeaders = {}; },
  });
})();
