/* global dxplay */
(() => {
  'use strict';

  const API = 'https://houhvngggkkcqcjmzafx.supabase.co';
  const SITE = 'https://gy.lubao2.de5.net';
  const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvdWh2bmdnZ2trY3Fjam16YWZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2Mjg2MjgsImV4cCI6MjA5MzIwNDYyOH0.FUUT9ETU-lP5iNqwK3i7nflwGLSBHM1b-qIs9CoVles';
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';
  const PAGE_SIZE = 40;
  let sourceKey = '';
  let sourceHeaders = {};

  const text = value => value === undefined || value === null ? '' : String(value);
  const list = value => Array.isArray(value) ? value : [];
  const absolute = value => /^https?:\/\//i.test(text(value)) ? text(value) : '';
  const request = async path => {
    const response = await dxplay.fetch({
      url: API + path,
      headers: Object.assign({
        apikey: ANON_KEY,
        Authorization: 'Bearer ' + ANON_KEY,
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
        Referer: SITE + '/',
      }, sourceHeaders),
    });
    if (response.status < 200 || response.status >= 300) throw new Error('guangya-community.request-failed');
    try {
      const value = JSON.parse(response.body || 'null');
      if (!Array.isArray(value)) throw new Error();
      return value;
    } catch (_) {
      throw new Error('guangya-community.response-invalid');
    }
  };
  const item = value => {
    const id = text(value && value.id), name = text(value && value.title).trim();
    if (!id || !name) return null;
    const poster = absolute(value.cover_url);
    const remark = [value.year, value.region, list(value.genres).slice(0, 2).join(' ')].filter(Boolean).join(' · ');
    return {id, sourceKey, name, ...(poster ? {poster} : {}), ...(remark ? {remark: text(remark)} : {})};
  };
  const items = values => list(values).map(item).filter(Boolean);
  const providerName = url => {
    if (/guangyapan\.com\/s\//i.test(url)) return '光鸭云盘';
    if (/pan\.quark\.cn/i.test(url)) return '夸克网盘';
    if (/pan\.baidu\.com/i.test(url)) return '百度网盘';
    if (/aliyundrive\.com|alipan\.com/i.test(url)) return '阿里云盘';
    if (/(?:^|\.)115\.com/i.test(url)) return '115网盘';
    return '';
  };
  const directMedia = url => /\.(?:m3u8|mpd|mp4|m4v|mov|mkv|webm|flv|avi|ts|mp3|m4a|aac|flac)(?:$|[?#])/i.test(url);
  const resourceLinks = value => {
    const output = [], seen = Object.create(null);
    const add = (name, rawUrl, accessCode) => {
      const url = absolute(rawUrl);
      if (!url || seen[url] || (!directMedia(url) && !providerName(url))) return;
      seen[url] = true;
      output.push({name: text(name).trim() || providerName(url) || '直链', url, accessCode: text(accessCode).trim()});
    };
    add('主链接', value.pan_link, value.pan_password);
    list(value.backup_links).forEach((entry, index) => {
      if (typeof entry === 'string') add('备用 ' + (index + 1), entry, '');
      else if (entry && typeof entry === 'object') {
        add(entry.name || '备用 ' + (index + 1), entry.url || entry.link, entry.password || entry.pwd);
      }
    });
    return output;
  };
  const pageResult = (values, page) => ({
    page,
    pageCount: values.length >= PAGE_SIZE ? page + 1 : page,
    items: items(values),
  });

  dxplay.register({
    id: 'org.dxsrc.cluntop.guangya-community',
    name: 'GuangYa Community',
    description: 'Readable public GuangYa community catalog whose supported links are handed to DXPlay Drive Router.',
    version: '1.0.0',
    protocol: 'catalog@1',

    async init(input) {
      sourceKey = text(input && input.sourceKey) || 'guangya-community';
      sourceHeaders = input && input.headers || {};
      return {ready: true};
    },
    async home() {
      const categories = await request('/rest/v1/categories?select=id,name&parent_id=is.null&order=sort_order.asc');
      const featured = await request('/rest/v1/resources?select=id,title,cover_url,year,region,genres,category_id&status=eq.approved&order=created_at.desc&limit=30');
      return {
        categories: categories.map(value => ({id: text(value.id), name: text(value.name)})).filter(value => value.id && value.name),
        featured: items(featured),
      };
    },
    async category(input) {
      const page = Math.max(1, Number(input && input.page) || 1);
      const categoryId = text(input && input.categoryId);
      if (!/^[A-Za-z0-9-]{8,80}$/.test(categoryId)) throw new Error('guangya-community.category-invalid');
      const offset = (page - 1) * PAGE_SIZE;
      return pageResult(await request('/rest/v1/resources?select=id,title,cover_url,year,region,genres,category_id&status=eq.approved&order=created_at.desc&category_id=eq.'
        + encodeURIComponent(categoryId) + '&limit=' + PAGE_SIZE + '&offset=' + offset), page);
    },
    async search(input) {
      const page = Math.max(1, Number(input && input.page) || 1);
      const keyword = text(input && input.keyword).trim();
      if (!keyword) return {page, pageCount: 1, items: []};
      const offset = (page - 1) * PAGE_SIZE;
      return pageResult(await request('/rest/v1/resources?select=id,title,cover_url,year,region,genres,category_id&status=eq.approved&title=ilike.'
        + encodeURIComponent('*' + keyword + '*') + '&order=created_at.desc&limit=' + PAGE_SIZE + '&offset=' + offset), page);
    },
    async detail(input) {
      const id = text(input && input.id);
      if (!/^[A-Za-z0-9-]{8,80}$/.test(id)) throw new Error('guangya-community.detail-invalid');
      const rows = await request('/rest/v1/resources?select=*&id=eq.' + encodeURIComponent(id) + '&limit=1');
      const value = rows[0];
      if (!value || typeof value !== 'object') throw new Error('guangya-community.detail-unavailable');
      const links = resourceLinks(value);
      if (!links.length) throw new Error('guangya-community.supported-link-unavailable');
      const poster = absolute(value.cover_url);
      const description = text(value.description).trim().slice(0, 4000);
      return {
        id,
        sourceKey,
        name: text(value.title).trim() || id,
        ...(poster ? {poster} : {}),
        ...(description ? {description} : {}),
        playGroups: [{
          id: 'resources',
          name: '资源',
          episodes: links.map((link, index) => ({
            id: String(index + 1),
            name: link.name,
            playId: link.url,
            ...(directMedia(link.url) ? {} : {drive: {
              kind: 'drive-share', url: link.url, ...(link.accessCode ? {accessCode: link.accessCode} : {}),
            }}),
          })),
        }],
      };
    },
    async play(input) {
      const url = absolute(input && input.playId);
      if (!url) throw new Error('guangya-community.play-invalid');
      const base = {sourceKey, flag: text(input.flag), episodeId: text(input.episodeId), rawUrl: url, parse: false};
      if (directMedia(url)) return Object.assign(base, {headers: {'User-Agent': USER_AGENT, Referer: SITE + '/'}});
      if (!providerName(url)) throw new Error('guangya-community.play-unsupported-provider');
      return Object.assign(base, {headers: {}, drive: {kind: 'drive-share', url}});
    },
    async destroy() { sourceKey = ''; sourceHeaders = {}; },
  });
})();
