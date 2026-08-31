/* global dxplay */
(() => {
  'use strict';

  const DEFAULT_CONFIG_URL = 'https://raw.githubusercontent.com/cluntop/tvbox/ddffe6fdee088edd22185c05b8594210fcbcdca3/lib/cj.json';
  const USER_AGENT = 'Mozilla/5.0 (Linux; Android 12; TV) AppleWebKit/537.36 Chrome/120.0 Safari/537.36';
  let sourceKey = '';
  let sourceHeaders = {};
  let sites = [];
  let primarySite = 0;
  let searchSiteCount = 4;

  const text = value => value === undefined || value === null ? '' : String(value);
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const list = value => Array.isArray(value) ? value : [];
  const clean = value => text(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
  const mergedHeaders = extra => Object.assign({
    'User-Agent': USER_AGENT,
    Accept: 'application/json,text/plain,*/*',
  }, sourceHeaders, object(extra));
  const parseJson = body => {
    const raw = text(body).replace(/^\uFEFF/, '').trim();
    if (!raw.startsWith('{') && !raw.startsWith('[')) throw new Error('cms-collection.response-not-json');
    return JSON.parse(raw);
  };
  const requestJson = async (url, headers) => {
    const response = await dxplay.fetch({url, headers: mergedHeaders(headers)});
    if (response.status < 200 || response.status >= 300) throw new Error('cms-collection.request-failed');
    return parseJson(response.body);
  };
  const withQuery = (base, values) => {
    const parts = [];
    for (const key of Object.keys(values)) {
      const value = values[key];
      if (value === undefined || value === null || value === '') continue;
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(text(value)));
    }
    if (!parts.length) return base;
    return base + (base.includes('?') ? (/[?&]$/.test(base) ? '' : '&') : '?') + parts.join('&');
  };
  const absolute = (value, site) => {
    const raw = text(value).trim().replace(/\\\//g, '/');
    if (!raw || raw.startsWith('data:')) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    const base = text(site.detail).trim() || text(site.api).match(/^https?:\/\/[^/]+/i)?.[0] || '';
    if (!base) return '';
    return base.replace(/\/$/, '') + '/' + raw.replace(/^\//, '');
  };
  const normalizeSite = (value, index) => {
    const source = object(value);
    const api = text(source.api).trim();
    if (!/^https?:\/\//i.test(api)) return null;
    return {
      index,
      name: clean(source.name) || ('CMS ' + (index + 1)),
      api,
      detail: text(source.detail).trim(),
    };
  };
  const configDescriptor = extension => {
    if (typeof extension === 'string') {
      const parts = extension.split('$$$');
      return {
        url: /^https?:\/\//i.test(parts[0].trim()) ? parts[0].trim() : DEFAULT_CONFIG_URL,
        primary: parts.length > 1 ? parts[1] : undefined,
      };
    }
    const value = object(extension);
    return {
      value: list(value.api_site).length ? value : object(value.config),
      url: text(value.url || value.configUrl).trim() || DEFAULT_CONFIG_URL,
      primary: value.primary === undefined ? value.site : value.primary,
      searchSites: value.searchSites,
      headers: object(value.headers),
    };
  };
  const choosePrimary = requested => {
    const raw = text(requested).trim();
    if (/^\d+$/.test(raw) && sites[Number(raw)]) return Number(raw);
    if (raw) {
      const match = sites.findIndex(site => site.name === raw || site.name.includes(raw));
      if (match >= 0) return match;
    }
    const preferred = sites.findIndex(site => /^https:\/\//i.test(site.api) && /^TV-/i.test(site.name));
    return preferred >= 0 ? preferred : 0;
  };
  const siteByIndex = index => {
    const site = sites[Number(index)];
    if (!site) throw new Error('cms-collection.site-not-found');
    return site;
  };
  const encodeItemId = (siteIndex, value) => 's' + siteIndex + '_' + encodeURIComponent(text(value));
  const decodeItemId = value => {
    const match = text(value).match(/^s(\d+)_(.+)$/);
    if (!match) throw new Error('cms-collection.item-invalid');
    return {siteIndex: Number(match[1]), upstreamId: decodeURIComponent(match[2])};
  };
  const item = (value, site) => {
    const source = object(value);
    const upstreamId = text(source.vod_id || source.id).trim();
    const name = clean(source.vod_name || source.name);
    if (!upstreamId || !name) return null;
    const poster = absolute(source.vod_pic || source.pic, site);
    const remark = clean(source.vod_remarks || source.note || source.type_name);
    return {
      id: encodeItemId(site.index, upstreamId),
      sourceKey,
      name: name + ' [' + site.name.replace(/^(?:TV|AV)-/i, '') + ']',
      ...(poster ? {poster} : {}),
      ...(remark ? {remark} : {}),
    };
  };
  const pageResult = (payload, site, requestedPage) => {
    const data = object(payload);
    const page = Math.max(1, Number(data.page) || requestedPage || 1);
    const pageCount = Math.max(page, Number(data.pagecount || data.page_count || data.totalpage) || page);
    return {page, pageCount, items: list(data.list).map(value => item(value, site)).filter(Boolean)};
  };
  const catalogPage = async (site, page, keyword) => {
    const payload = await requestJson(withQuery(site.api, {
      ac: 'detail',
      pg: Math.max(1, Number(page) || 1),
      ...(keyword ? {wd: keyword} : {}),
    }));
    return pageResult(payload, site, page);
  };
  const loadDetail = async descriptor => {
    const site = siteByIndex(descriptor.siteIndex);
    const payload = object(await requestJson(withQuery(site.api, {ac: 'detail', ids: descriptor.upstreamId})));
    const value = object(list(payload.list)[0]);
    if (!text(value.vod_id || value.id)) throw new Error('cms-collection.item-not-found');
    return {site, value};
  };
  const playGroups = (value, itemId) => {
    const names = text(value.vod_play_from || value.play_from).split('$$$');
    const lines = text(value.vod_play_url || value.play_url).split('$$$');
    return lines.map((line, lineIndex) => {
      const episodes = text(line).split('#').map((entry, episodeIndex) => {
        const separator = entry.indexOf('$');
        if (separator < 0 || !entry.slice(separator + 1).trim()) return null;
        return {
          id: String(episodeIndex + 1),
          name: clean(entry.slice(0, separator)) || String(episodeIndex + 1),
          playId: itemId + '@' + lineIndex + '@' + episodeIndex,
        };
      }).filter(Boolean);
      if (!episodes.length) return null;
      const name = clean(names[lineIndex]) || ('线路 ' + (lineIndex + 1));
      return {id: String(lineIndex + 1), name, episodes};
    }).filter(Boolean);
  };
  const decodePlayId = value => {
    const match = text(value).match(/^(s\d+_.+)@(\d+)@(\d+)$/);
    if (!match) throw new Error('cms-collection.play-invalid');
    return {itemId: match[1], lineIndex: Number(match[2]), episodeIndex: Number(match[3])};
  };
  const mediaAt = (value, lineIndex, episodeIndex) => {
    const line = text(value.vod_play_url || value.play_url).split('$$$')[lineIndex] || '';
    const entry = line.split('#')[episodeIndex] || '';
    const separator = entry.indexOf('$');
    return separator < 0 ? '' : entry.slice(separator + 1).trim();
  };
  const directMedia = value => /\.(?:m3u8|mpd|mp4|m4v|mkv|webm|flv|mp3|m4a|aac|flac|ogg)(?:$|[?#])/i.test(value);
  const searchableIndexes = () => {
    const output = [primarySite];
    for (let index = 0; index < sites.length && output.length < searchSiteCount; index += 1) {
      if (index !== primarySite && /^https:\/\//i.test(sites[index].api) && /^TV-/i.test(sites[index].name)) output.push(index);
    }
    return output;
  };

  dxplay.register({
    id: 'org.dxsrc.shared.cms-collection',
    name: 'CMS collection',
    description: 'Readable multi-provider MacCMS collection with provider browsing, aggregate search and direct media playback.',
    version: '1.0.0',
    protocol: 'catalog@1',
    async init(input) {
      sourceKey = text(input.sourceKey) || 'cms-collection';
      sourceHeaders = object(input.headers);
      const descriptor = configDescriptor(input.extension);
      sourceHeaders = Object.assign({}, sourceHeaders, descriptor.headers);
      const inlineConfig = object(descriptor.value);
      const config = list(inlineConfig.api_site).length ? inlineConfig : object(await requestJson(descriptor.url));
      sites = list(config.api_site).map(normalizeSite).filter(Boolean).map((site, index) => Object.assign({}, site, {index}));
      if (!sites.length) throw new Error('cms-collection.sites-missing');
      primarySite = choosePrimary(descriptor.primary);
      searchSiteCount = Math.max(1, Math.min(8, Number(descriptor.searchSites) || 4));
      return {ready: true};
    },
    async home() {
      const featured = (await catalogPage(siteByIndex(primarySite), 1, '')).items;
      if (!featured.length) throw new Error('cms-collection.home-unavailable');
      return {
        categories: sites.map(site => ({id: 'site:' + site.index, name: site.name})),
        featured,
      };
    },
    async category(input) {
      const match = text(input.categoryId).match(/^site:(\d+)$/);
      if (!match) throw new Error('cms-collection.category-invalid');
      return catalogPage(siteByIndex(Number(match[1])), input.page, '');
    },
    async search(input) {
      const page = Math.max(1, Number(input.page) || 1);
      const keyword = text(input.keyword).trim();
      if (!keyword) return {page, pageCount: page, items: []};
      const results = await Promise.all(searchableIndexes().map(async index => {
        try { return await catalogPage(siteByIndex(index), page, keyword); }
        catch (_) { return {page, pageCount: page, items: []}; }
      }));
      const seen = Object.create(null), items = [];
      let pageCount = page;
      for (const result of results) {
        pageCount = Math.max(pageCount, Number(result.pageCount) || page);
        for (const value of result.items) {
          if (seen[value.id]) continue;
          seen[value.id] = true;
          items.push(value);
        }
      }
      return {page, pageCount, items};
    },
    async detail(input) {
      const descriptor = decodeItemId(input.id);
      const loaded = await loadDetail(descriptor);
      const base = item(loaded.value, loaded.site);
      if (!base) throw new Error('cms-collection.item-not-found');
      const groups = playGroups(loaded.value, base.id);
      if (!groups.length) throw new Error('cms-collection.detail-unavailable');
      return {
        ...base,
        ...(loaded.value.vod_year ? {year: clean(loaded.value.vod_year)} : {}),
        ...(loaded.value.vod_area ? {area: clean(loaded.value.vod_area)} : {}),
        ...(loaded.value.vod_actor ? {actors: clean(loaded.value.vod_actor)} : {}),
        ...(loaded.value.vod_director ? {director: clean(loaded.value.vod_director)} : {}),
        ...(loaded.value.vod_content || loaded.value.vod_blurb ? {description: clean(loaded.value.vod_content || loaded.value.vod_blurb)} : {}),
        playGroups: groups,
      };
    },
    async play(input) {
      const play = decodePlayId(input.playId);
      const descriptor = decodeItemId(play.itemId);
      const loaded = await loadDetail(descriptor);
      const rawUrl = mediaAt(loaded.value, play.lineIndex, play.episodeIndex);
      if (!/^https?:\/\//i.test(rawUrl)) throw new Error('cms-collection.media-unsupported');
      const referer = text(loaded.site.detail).trim() || text(loaded.site.api).match(/^https?:\/\/[^/]+/i)?.[0] || '';
      return {
        sourceKey,
        flag: text(input.flag),
        episodeId: text(input.episodeId),
        rawUrl,
        headers: mergedHeaders(referer ? {Referer: referer + '/'} : {}),
        parse: !directMedia(rawUrl),
      };
    },
    async destroy() {
      sourceKey = '';
      sourceHeaders = {};
      sites = [];
      primarySite = 0;
      searchSiteCount = 4;
    },
  });
})();
