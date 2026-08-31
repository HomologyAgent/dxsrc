/* global dxplay */
(() => {
  'use strict';

  const DEFAULT_BASE = 'http://www.88kanqiu.la';
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
    + 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
  const categoryValues = [
    ['all', '全部直播'], ['4', '篮球直播'], ['23', '足球直播'], ['21', '其他直播'],
  ];
  let sourceKey = '';
  let sourceHeaders = {};
  let baseUrl = DEFAULT_BASE;

  const text = value => value === undefined || value === null ? '' : String(value);
  const absoluteUrl = value => {
    const candidate = text(value).trim();
    if (!candidate) return '';
    if (/^https?:\/\//i.test(candidate)) return candidate;
    return baseUrl + (candidate.startsWith('/') ? candidate : '/' + candidate);
  };
  const requestText = async url => {
    const response = await dxplay.fetch({
      url,
      headers: Object.assign({'User-Agent': USER_AGENT, Referer: baseUrl + '/'}, sourceHeaders),
    });
    if (response.status < 200 || response.status >= 300) throw new Error('sports88.request-failed');
    return response.body;
  };
  const decodeBase64Utf8 = value => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const input = text(value).replace(/\s+/g, '').replace(/=+$/, '');
    let bits = 0;
    let bitCount = 0;
    let escaped = '';
    for (let index = 0; index < input.length; index += 1) {
      const digit = alphabet.indexOf(input[index]);
      if (digit < 0) throw new Error('sports88.response-invalid');
      bits = (bits << 6) | digit;
      bitCount += 6;
      if (bitCount >= 8) {
        bitCount -= 8;
        escaped += '%' + ((bits >> bitCount) & 255).toString(16).padStart(2, '0');
      }
    }
    try { return decodeURIComponent(escaped); } catch (_error) { throw new Error('sports88.response-invalid'); }
  };
  const sourcePath = value => {
    const path = text(value).trim().replace(/^https?:\/\/[^/]+/i, '');
    return path.replace(/\/play(?:\?.*)?$/i, '/source');
  };
  const packId = (path, name) => encodeURIComponent(path) + '@' + encodeURIComponent(name);
  const unpackId = id => {
    const separator = text(id).indexOf('@');
    if (separator < 0) throw new Error('sports88.item-id-invalid');
    try {
      return {
        path: decodeURIComponent(text(id).slice(0, separator)),
        name: decodeURIComponent(text(id).slice(separator + 1)),
      };
    } catch (_error) { throw new Error('sports88.item-id-invalid'); }
  };
  const links = async path => {
    let response;
    try { response = JSON.parse(await requestText(absoluteUrl(path))); }
    catch (_error) { throw new Error('sports88.response-invalid'); }
    const wrapped = text(response.data);
    if (wrapped.length < 9) throw new Error('sports88.response-invalid');
    let decoded;
    try { decoded = JSON.parse(decodeBase64Utf8(wrapped.slice(6, -2))); }
    catch (_error) { throw new Error('sports88.response-invalid'); }
    return Array.isArray(decoded.links) ? decoded.links : [];
  };

  dxplay.register({
    id: 'org.dxsrc.jsm.sports-88',
    name: '88 Sports',
    description: 'Semantic rewrite of the jsm.json Sports88 live-event catalog.',
    version: '1.0.0',
    protocol: 'catalog@1',

    async init(input) {
      sourceKey = text(input.sourceKey);
      sourceHeaders = input.headers && typeof input.headers === 'object' ? input.headers : {};
      const extension = typeof input.extension === 'string' ? input.extension
        : input.extension && input.extension.baseUrl;
      baseUrl = text(extension || DEFAULT_BASE).replace(/\/$/, '');
      if (!sourceKey || !/^https?:\/\//i.test(baseUrl)) throw new Error('sports88.configuration-invalid');
      return {ready: true};
    },
    async home() {
      return {categories: categoryValues.map(([id, name]) => ({id, name})), featured: []};
    },
    async category(input) {
      const selectedId = text(input.filters && input.filters.cateId || input.categoryId);
      const categoryId = selectedId === 'all' ? '' : selectedId;
      const path = categoryId ? '/match/' + encodeURIComponent(categoryId) + '/live' : '';
      const pageBody = await requestText(baseUrl + path);
      const blocks = [];
      const pattern = /<li[^>]*class=["'][^"']*list-group-item[^"']*["'][^>]*>[\s\S]*?<\/li>/gi;
      let match;
      while ((match = pattern.exec(pageBody)) !== null && blocks.length < 200) blocks.push(match[0]);
      const items = blocks.map(block => {
        const node = dxplay.html.parse(block);
        const button = node.query('.btn.btn-primary');
        const href = button && button.attr('href');
        if (!href) return null;
        const row = node.query('.row.d-none');
        const name = text(row && row.textNormalized() || node.textNormalized()).trim();
        const image = node.query('.col-xs-1 img') || node.query('img');
        const poster = absoluteUrl(image && image.attr('src'));
        return {
          id: packId(sourcePath(href), name),
          sourceKey,
          name: name || '直播比赛',
          ...(poster ? {poster} : {}),
          ...(button.textNormalized() ? {remark: button.textNormalized()} : {}),
        };
      }).filter(Boolean);
      return {page: Number(input.page) || 1, pageCount: 1, items};
    },
    async search(input) {
      return {page: Number(input.page) || 1, pageCount: 1, items: []};
    },
    async detail(input) {
      const identity = unpackId(input.id);
      const values = await links(identity.path);
      return {
        id: text(input.id),
        sourceKey,
        name: identity.name || '直播比赛',
        playGroups: [{
          id: 'sports88',
          name: '88看球',
          episodes: values.map((value, index) => ({
            id: String(index),
            name: text(value && value.name || '线路 ' + String(index + 1)),
            playId: encodeURIComponent(identity.path) + '@' + String(index),
          })),
        }],
      };
    },
    async play(input) {
      const separator = text(input.playId).lastIndexOf('@');
      if (separator <= 0) throw new Error('sports88.play-id-invalid');
      let path;
      try { path = decodeURIComponent(text(input.playId).slice(0, separator)); }
      catch (_error) { throw new Error('sports88.play-id-invalid'); }
      const values = await links(path);
      const selected = values[Number(text(input.playId).slice(separator + 1)) || 0];
      if (!selected || !selected.url) throw new Error('sports88.play-unavailable');
      return {
        sourceKey,
        flag: input.flag,
        episodeId: input.episodeId,
        rawUrl: text(selected.url),
        headers: {'User-Agent': USER_AGENT, Referer: baseUrl + '/'},
        parse: false,
      };
    },
    async destroy() {
      sourceKey = '';
      sourceHeaders = {};
      baseUrl = DEFAULT_BASE;
    },
  });
})();
