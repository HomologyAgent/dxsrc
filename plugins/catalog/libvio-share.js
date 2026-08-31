/* global dxplay */
(() => {
  'use strict';

  const BASE = 'https://www.libvio.io';
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';
  let sourceKey = '';
  let sourceHeaders = {};

  const text = value => value === undefined || value === null ? '' : String(value);
  const decode = value => text(value).replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
  const strip = value => decode(text(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
  const attr = (attributes, name) => decode(text(attributes).match(new RegExp('\\b' + name + '=["\\\']([^"\\\']*)["\\\']', 'i'))?.[1] || '');
  const absolute = value => {
    const raw = decode(value).trim();
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('//')) return 'https:' + raw;
    return raw ? BASE + (raw.startsWith('/') ? raw : '/' + raw) : '';
  };
  const request = async path => {
    const response = await dxplay.fetch({url: absolute(path), headers: Object.assign({'User-Agent': UA, Referer: BASE + '/'}, sourceHeaders)});
    if (response.status < 200 || response.status >= 300) throw new Error('libvio.request-failed');
    return response.body;
  };
  const provider = url => {
    if (/pan\.quark\.cn/i.test(url)) return '夸克网盘';
    if (/pan\.baidu\.com/i.test(url)) return '百度网盘';
    if (/aliyundrive\.com|alipan\.com/i.test(url)) return '阿里云盘';
    if (/(?:^|\.)115\.com/i.test(url)) return '115网盘';
    return '';
  };
  const cards = html => {
    const output = [], seen = Object.create(null);
    for (const match of text(html).matchAll(/<a\b([^>]*class=["'][^"']*stui-vodlist__thumb[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi)) {
      const href = attr(match[1], 'href'), id = href.match(/\/detail\/(\d+)\.html/i)?.[1] || '';
      if (!id || seen[id]) continue;
      const name = strip(attr(match[1], 'title') || match[2]);
      if (!name) continue;
      const poster = absolute(attr(match[1], 'data-original'));
      const remark = strip(match[2].match(/<span\b[^>]*class=["'][^"']*pic-text[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]);
      seen[id] = true;
      output.push({id, sourceKey, name, ...(poster ? {poster} : {}), ...(remark ? {remark} : {})});
    }
    return output;
  };
  const categories = html => {
    const output = [], seen = Object.create(null);
    const block = text(html).match(/<ul\b[^>]*class=["'][^"']*stui-header__menu[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i)?.[1] || '';
    for (const match of block.matchAll(/<a\b([^>]*href=["']\/type\/[^"']+\.html["'][^>]*)>([\s\S]*?)<\/a>/gi)) {
      const href = attr(match[1], 'href'), id = href.match(/\/type\/([^/.]+)\.html/i)?.[1] || '', name = strip(match[2]);
      if (!id || !name || seen[id]) continue;
      seen[id] = true; output.push({id, name});
    }
    return output;
  };
  const shares = html => {
    const output = [], seen = Object.create(null);
    for (const match of text(html).matchAll(/<a\b([^>]*class=["'][^"']*netdisk-item[^"']*["'][^>]*)>/gi)) {
      const url = absolute(attr(match[1], 'href')), name = provider(url);
      if (!name || seen[url]) continue;
      seen[url] = true; output.push({url, name});
    }
    return output;
  };
  const pageResult = (items, page) => ({page, pageCount: items.length >= 20 ? page + 1 : page, items});

  dxplay.register({
    id: 'org.dxsrc.cluntop.libvio-share',
    name: 'LIBVIO public shares',
    description: 'Readable rewrite of the current LIBVIO catalog, search and supported public cloud-drive shares.',
    version: '1.0.0',
    protocol: 'catalog@1',
    async init(input) {
      sourceKey = text(input.sourceKey) || 'libvio-share'; sourceHeaders = input.headers || {};
      return {ready: true};
    },
    async home() {
      const html = await request('/');
      return {categories: categories(html), featured: cards(html).slice(0, 60)};
    },
    async category(input) {
      const page = Math.max(1, Number(input.page) || 1), id = text(input.categoryId).replace(/[^A-Za-z0-9_-]/g, '');
      if (!id) throw new Error('libvio.category-invalid');
      return pageResult(cards(await request('/type/' + id + (page > 1 ? '-' + page : '') + '.html')), page);
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1), keyword = text(input.keyword).trim();
      if (!keyword) return {page, pageCount: 1, items: []};
      const path = page === 1
        ? '/search/-------------.html?wd=' + encodeURIComponent(keyword) + '&submit='
        : '/search/' + encodeURIComponent(keyword) + '----------' + page + '---.html';
      return pageResult(cards(await request(path)), page);
    },
    async detail(input) {
      const id = text(input.id).match(/(?:\/detail\/)?(\d+)/)?.[1] || '';
      if (!id) throw new Error('libvio.detail-invalid');
      const html = await request('/detail/' + id + '.html'), links = shares(html);
      if (!links.length) throw new Error('libvio.supported-share-unavailable');
      const name = strip(html.match(/<h1\b[^>]*class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1]) || id;
      const image = html.match(/<img\b([^>]*id=["']js-poster-img["'][^>]*)>/i)?.[1] || '', poster = absolute(attr(image, 'data-original') || attr(image, 'src'));
      const description = strip(html.match(/<span\b[^>]*class=["'][^"']*detail-content[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]
        || html.match(/<span\b[^>]*class=["'][^"']*detail-sketch[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]).slice(0, 2000);
      return {
        id, sourceKey, name, ...(poster ? {poster} : {}), ...(description ? {description} : {}),
        playGroups: [{
          id: 'drive-share', name: '网盘分享',
          episodes: links.map((link, index) => ({
            id: String(index + 1), name: link.name, playId: link.url,
            drive: {kind: 'drive-share', url: link.url},
          })),
        }],
      };
    },
    async play(input) {
      const url = absolute(text(input.playId));
      if (!provider(url)) throw new Error('libvio.play-unsupported-provider');
      return {
        sourceKey, flag: text(input.flag), episodeId: text(input.episodeId),
        rawUrl: url, headers: {}, parse: false, drive: {kind: 'drive-share', url},
      };
    },
    async destroy() { sourceKey = ''; sourceHeaders = {}; },
  });
})();
