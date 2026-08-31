/* global dxplay */
(() => {
  'use strict';
  const BASE = 'https://app.365ting.com/listen/Apitzg2025/';
  const USER_AGENT = 'TingShiJie/1.8.8 (m.i275.com)';
  const SECRET = 'J9gSpfUlzYxE8Hn5IXiGaD2jVMrwAm0K';
  const CATEGORIES = [['6','玄幻奇幻'],['7','都市言情'],['8','宫斗女频'],['9','官场商战'],['10','武侠仙侠'],['11','刑侦推理'],['12','探险科幻'],['13','重生穿越'],['14','恐怖惊悚'],['15','文学历史'],['49','两性情感']];
  const MD5_SHIFT = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
  const MD5_CONSTANT = Array.from({length:64}, (_,index) => Math.floor(Math.abs(Math.sin(index + 1)) * 4294967296) >>> 0);
  let sourceKey = '';
  const text = value => value === undefined || value === null ? '' : String(value);
  const add32 = (...values) => values.reduce((result,value) => (result + (value >>> 0)) >>> 0, 0);
  const rotate = (value,count) => ((value << count) | (value >>> (32 - count))) >>> 0;
  const md5Ascii = value => {
    const bytes = Array.from(text(value), character => character.charCodeAt(0) & 255);
    const bitLength = bytes.length * 8;
    bytes.push(128);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (let index = 0; index < 8; index += 1) bytes.push(index < 4 ? (bitLength >>> (index * 8)) & 255 : 0);
    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    for (let offset = 0; offset < bytes.length; offset += 64) {
      const words = Array.from({length:16}, (_,index) => bytes[offset+index*4] | (bytes[offset+index*4+1]<<8) | (bytes[offset+index*4+2]<<16) | (bytes[offset+index*4+3]<<24));
      let a = a0, b = b0, c = c0, d = d0;
      for (let index = 0; index < 64; index += 1) {
        let f, word;
        if (index < 16) { f = (b & c) | (~b & d); word = index; }
        else if (index < 32) { f = (d & b) | (~d & c); word = (5 * index + 1) % 16; }
        else if (index < 48) { f = b ^ c ^ d; word = (3 * index + 5) % 16; }
        else { f = c ^ (b | ~d); word = (7 * index) % 16; }
        const previousD = d;
        d = c; c = b;
        b = add32(b, rotate(add32(a, f, MD5_CONSTANT[index], words[word]), MD5_SHIFT[index]));
        a = previousD;
      }
      a0 = add32(a0,a); b0 = add32(b0,b); c0 = add32(c0,c); d0 = add32(d0,d);
    }
    return [a0,b0,c0,d0].map(word => [0,8,16,24].map(shift => ((word >>> shift) & 255).toString(16).padStart(2,'0')).join('')).join('');
  };
  const loadJson = async path => {
    const response = await dxplay.fetch({url: BASE + path, headers: {'User-Agent': USER_AGENT}});
    if (response.status < 200 || response.status >= 300) throw new Error('tingshijie.request-failed');
    try { return JSON.parse(response.body); } catch (_) { throw new Error('tingshijie.response-invalid'); }
  };
  const mapItems = values => (Array.isArray(values) ? values : []).map(value => ({
    id:text(value.id),sourceKey,name:text(value.bookTitle)||text(value.id),
    ...(value.bookImage ? {poster:text(value.bookImage)} : {}),remark:text(value.bookAnchor),
  })).filter(item => item.id && item.name);

  dxplay.register({
    id: 'org.dxsrc.jsm.tingshijie', name: 'TingShiJie audio catalog',
    description: 'Semantic rewrite of the public TingShiJie audiobook API, chapter catalog and signed media resolution.',
    version: '1.0.0', protocol: 'catalog@1',
    async init(input) { sourceKey = text(input.sourceKey) || 'tingshijie'; return {ready:true}; },
    async home() { return {categories:CATEGORIES.map(value => ({id:value[0],name:value[1]})),featured:[]}; },
    async category(input) {
      const page = Math.max(1,Number(input.page)||1);
      const payload = await loadJson('appHomeByCategory?categoryId='+encodeURIComponent(text(input.categoryId))+'&page='+page+'&size=120');
      const items = payload.status === 0 ? mapItems(payload.data) : [];
      return {page,pageCount:items.length?page+1:page,items};
    },
    async search(input) {
      const page = Math.max(1,Number(input.page)||1);
      if (page > 1) return {page,pageCount:page,items:[]};
      const payload = await loadJson('appSearch?client=babala-android&search='+encodeURIComponent(text(input.keyword))+'&app_token=abcSEARCH-2025');
      const items = payload.status === 0 && payload.data ? mapItems(payload.data.bookData) : [];
      return {page,pageCount:1,items};
    },
    async detail(input) {
      const id = text(input.id);
      const payload = await loadJson('book?bookId='+encodeURIComponent(id));
      const book = payload.status === 0 && payload.data ? payload.data.bookData : null;
      if (!book) throw new Error('tingshijie.item-not-found');
      const count = Math.max(0,Number(book.count)||0);
      const episodes = [];
      for (let page=1; page<=Math.max(1,Math.ceil(count/1000)); page+=1) {
        const chapterPayload = await loadJson('chapter?size=1000&page='+page+'&sort=asc&bookId='+encodeURIComponent(id));
        const values = chapterPayload.status === 0 && chapterPayload.data && Array.isArray(chapterPayload.data.list) ? chapterPayload.data.list : [];
        values.forEach(chapter => episodes.push({id:text(chapter.chapterId),name:text(chapter.position)||text(chapter.chapterId),playId:id+'|'+text(chapter.chapterId)}));
      }
      return {id,sourceKey,name:text(book.bookTitle)||id,poster:text(book.bookImage),description:text(book.bookDesc),playGroups:[{id:'audio',name:'世界听书',episodes}]};
    },
    async play(input) {
      const values = text(input.playId).split('|');
      if (values.length < 2 || !values[0] || !values[1]) throw new Error('tingshijie.play-invalid');
      const timestamp = String(Date.now());
      const signature = md5Ascii(md5Ascii(timestamp + SECRET) + SECRET);
      const payload = await loadJson('AppGetChapterUrl2023?timeStamp='+timestamp+'&uid=&chapterId='+encodeURIComponent(values[1])+'&addItParapet='+signature+'&bookId='+encodeURIComponent(values[0]));
      const url = payload.status === 0 ? text(payload.src) : '';
      if (!/^https?:\/\//i.test(url)) throw new Error('tingshijie.play-unavailable');
      return {sourceKey,flag:text(input.flag),episodeId:text(input.episodeId),rawUrl:url,headers:{},parse:false};
    },
    async destroy() { sourceKey=''; },
  });
})();
