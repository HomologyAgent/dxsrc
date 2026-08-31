/* global dxplay */
(() => {
  'use strict';

  const USER_AGENT = 'Mozilla/5.0 (Linux; Android 13; TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
  const CATEGORIES = [['1','电影'],['2','电视剧'],['3','综艺'],['4','动漫']];
  const PRESETS = {
    yongle: {
      baseUrl: 'https://www.ylys.tv',
      search: (keyword) => '/vodsearch/' + encodeURIComponent(keyword) + '-------------/',
    },
    feikuai: {
      baseUrl: 'https://feikuai.in',
      search: (keyword, page) => '/label/search_ajax.html?wd=' + encodeURIComponent(keyword) + '&by=time&order=desc&page=' + page,
    },
    ddmf: {
      baseUrl: 'https://www.ddmf.net',
      home: '/vodtype/1.html',
      search: keyword => '/vodsearch/' + encodeURIComponent(keyword) + '-------------.html',
    },
  };
  let sourceKey = '';
  let sourceHeaders = {};
  let preset = PRESETS.yongle;
  let baseUrl = preset.baseUrl;

  const text = value => value === undefined || value === null ? '' : String(value);
  const headers = () => Object.assign({'User-Agent': USER_AGENT, Referer: baseUrl + '/'}, sourceHeaders);
  const decode = value => text(value).replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const strip = value => decode(text(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
  const attr = (attributes, name) => decode(attributes.match(new RegExp('\\b' + name + '=["\\\']([^"\\\']*)["\\\']', 'i'))?.[1] || '');
  const absolute = value => {
    const raw = text(value).trim();
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('//')) return 'https:' + raw;
    return raw ? baseUrl + (raw.startsWith('/') ? raw : '/' + raw) : '';
  };
  const request = async path => {
    const response = await dxplay.fetch({url: absolute(path), headers: headers()});
    if (response.status < 200 || response.status >= 300) throw new Error('module-html.request-failed');
    return response.body;
  };
  const items = html => {
    const output = [], seen = Object.create(null);
    for (const match of html.matchAll(/<a\b([^>]*class=["'][^"']*(?:module-poster-item|module-card-item-poster)[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi)) {
      const id = attr(match[1], 'href').match(/\/voddetail\/(\d+)\/?/i)?.[1];
      if (!id || seen[id]) continue;
      const image = match[2].match(/<img\b([^>]*)>/i)?.[1] || '';
      const name = attr(match[1], 'title') || attr(image, 'alt') || strip(match[2].match(/class=["'][^"']*module-poster-item-title[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]);
      if (!name) continue;
      seen[id] = true;
      const poster = absolute(attr(image, 'data-original') || attr(image, 'src'));
      const remark = strip(match[2].match(/class=["'][^"']*module-item-note[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]);
      if (remark === '即将上映') continue;
      output.push({id, sourceKey, name, ...(poster ? {poster} : {}), ...(remark ? {remark} : {})});
    }
    return output;
  };
  const categoryPath = input => {
    const selected = input.filters || {}, page = Math.max(1, Number(input.page) || 1);
    return '/vodshow/' + encodeURIComponent(text(input.categoryId)) + '-' + encodeURIComponent(text(selected.area)) + '-' + encodeURIComponent(text(selected.by)) + '-' + encodeURIComponent(text(selected.class)) + '-' + encodeURIComponent(text(selected.lang)) + '-' + encodeURIComponent(text(selected.letter)) + '---' + page + '---' + encodeURIComponent(text(selected.year)) + '.html';
  };
  const metadata = (html, label) => strip(html.match(new RegExp('<span[^>]*class=["\\\'][^"\\\']*module-info-item-title[^"\\\']*["\\\'][^>]*>\\s*' + label + '：?<\\/span>[\\s\\S]*?<div[^>]*class=["\\\'][^"\\\']*module-info-item-content[^"\\\']*["\\\'][^>]*>([\\s\\S]*?)<\\/div>', 'i'))?.[1]);

  dxplay.register({
    id: 'org.dxsrc.shared.module-html',
    name: 'Module HTML catalog family',
    description: 'Readable preset-bounded catalogs for reachable Module-themed MacCMS sites.',
    version: '1.1.0', protocol: 'catalog@1',

    async init(input) {
      const extension = input.extension && typeof input.extension === 'object' ? input.extension : {};
      preset = PRESETS[text(extension.preset).trim().toLowerCase() || 'yongle'];
      if (!preset) throw new Error('module-html.preset-invalid');
      baseUrl = text(extension.baseUrl || preset.baseUrl).replace(/\/+$/, '');
      if (!/^https?:\/\//i.test(baseUrl)) throw new Error('module-html.base-url-invalid');
      sourceKey = text(input.sourceKey) || 'module-html';
      sourceHeaders = input.headers || {};
      return {ready: true};
    },
    async home() {
      return {categories: CATEGORIES.map(value => ({id: value[0], name: value[1]})), featured: items(await request(preset.home || '/')).slice(0, 60)};
    },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1), values = items(await request(categoryPath(input)));
      return {page, pageCount: values.length ? page + 1 : page, items: values};
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1), keyword = text(input.keyword).trim();
      if (!keyword) return {page, pageCount: 1, items: []};
      const values = items(await request(preset.search(keyword, page)));
      return {page, pageCount: values.length ? page + 1 : page, items: values};
    },
    async detail(input) {
      const id = text(input.id), html = await request('/voddetail/' + encodeURIComponent(id) + '/');
      const name = strip(html.match(/class=["'][^"']*module-info-heading[^"']*["'][^>]*>[\s\S]*?<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]) || id;
      const posterAttributes = html.match(/class=["'][^"']*module-info-poster[^"']*["'][^>]*>[\s\S]*?<img\b([^>]*)>/i)?.[1] || '';
      const poster = absolute(attr(posterAttributes, 'data-original') || attr(posterAttributes, 'src'));
      const lineNames = [...html.matchAll(/data-dropdown-value=["']([^"']+)["']/gi)].map(match => decode(match[1]));
      const grouped = Object.create(null), order = [];
      for (const match of html.matchAll(/<a\b([^>]*class=["'][^"']*module-play-list-link[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi)) {
        const href = attr(match[1], 'href'), parts = href.match(/\/(?:play|vodplay)\/\d+-(\d+)-(\d+)(?:\.html|\/)?/i);
        if (!parts) continue;
        const lineId = parts[1];
        if (!grouped[lineId]) { grouped[lineId] = []; order.push(lineId); }
        grouped[lineId].push({id: parts[2], name: strip(match[2]) || attr(match[1], 'title') || parts[2], playId: href});
      }
      const playGroups = [];
      let remainingEpisodes = 5000;
      for (let index = 0; index < order.length && remainingEpisodes > 0; index += 1) {
        const lineId = order[index], episodes = grouped[lineId].slice(0, remainingEpisodes);
        if (!episodes.length) continue;
        playGroups.push({id: 'line-' + lineId, name: lineNames[index] || '线路 ' + (index + 1), episodes});
        remainingEpisodes -= episodes.length;
      }
      if (!playGroups.length) throw new Error('module-html.episodes-unavailable');
      return {id, sourceKey, name, ...(poster ? {poster} : {}), actors: metadata(html, '主演'), director: metadata(html, '导演'), description: strip(html.match(/class=["'][^"']*module-info-introduction-content[^"']*["'][^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i)?.[1]), playGroups};
    },
    async play(input) {
      const html = await request(text(input.playId));
      const encoded = html.match(/\bvar\s+player_aaaa\s*=\s*(\{.*?\})\s*;/is)?.[1];
      let value;
      try { value = JSON.parse(encoded || ''); } catch (_) { throw new Error('module-html.player-invalid'); }
      let url = text(value.url).replace(/\\\//g, '/');
      if (Number(value.encrypt) === 1) { try { url = decodeURIComponent(url); } catch (_) {} }
      else if (Number(value.encrypt) === 2) { try { url = decodeURIComponent(dxplay.codec.utf8Decode(dxplay.codec.base64Decode(url))); } catch (_) {} }
      if (!/^https?:\/\//i.test(url)) throw new Error('module-html.play-unavailable');
      return {sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl: url, headers: headers(), parse: !/\.(?:m3u8|mp4|mkv|flv|ts)(?:$|[?#])/i.test(url)};
    },
    async destroy() {
      sourceKey = ''; sourceHeaders = {}; preset = PRESETS.yongle; baseUrl = preset.baseUrl;
    },
  });
})();
