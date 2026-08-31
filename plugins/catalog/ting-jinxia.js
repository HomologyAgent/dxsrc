/* global dxplay */
(() => {
  'use strict';
  const BASE = 'https://m.ting15.com';
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
  const CATEGORIES = [['wuxiaxuanhuan','武侠玄幻'],['kongbulingyi','恐怖灵异'],['tuilixuanyi','推理悬疑'],['dushiyanqing','都市言情'],['jiatinglunli','家庭伦理'],['wenxuemingzhu','文学名著'],['jingdianpingshu','经典评书'],['quyixiqu','曲艺戏曲'],['xiangshengxiaopin','相声小品']];
  const FILTERS = [{key:'order',name:'排序',initialValue:'',options:[{name:'全部',value:''},{name:'热门',value:'hits'},{name:'最新',value:'addtime'}]}];
  let sourceKey = '';
  const text = value => value === undefined || value === null ? '' : String(value);
  const clean = value => text(value).replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
  const absolute = value => {
    const url = text(value);
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith('//')) return 'https:' + url;
    return BASE + (url.startsWith('/') ? url : '/' + url);
  };
  const headers = referer => ({'User-Agent':USER_AGENT,Referer:referer||BASE+'/',Accept:'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'});
  const load = async (url,referer) => {
    const response = await dxplay.fetch({url:absolute(url),headers:headers(referer)});
    if (response.status<200||response.status>=300) throw new Error('tingjinxia.request-failed');
    return response.body;
  };
  const parseItems = body => {
    const items=[];
    const seen=Object.create(null);
    const pattern=/<a[^>]+href=["']([^"']+)["'][^>]*>\s*<dl[\s\S]*?<img[^>]+src=["']([^"']*)["'][\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)<\/dl>\s*<\/a>/ig;
    let match;
    while((match=pattern.exec(body))!==null){
      const href=text(match[1]);
      const name=clean(match[3]).replace(/^\[[^\]]+\]\s*/,'');
      if(!href||!name||seen[href]||href.startsWith('javascript:')) continue;
      const state=clean((match[4].match(/<p[^>]*>\s*(?:连载|状态)[^：:]*[：:]?([\s\S]*?)<\/p>/i)||[])[1])||'听书';
      seen[href]=true;
      items.push({id:href,sourceKey,name,poster:absolute(match[2]),remark:state});
      if(items.length>=95) break;
    }
    return items;
  };
  const meta = (body,name) => clean((body.match(new RegExp('<meta[^>]+name=["\']'+name+'["\'][^>]+content=["\']([^"\']*)','i'))||[])[1]);

  dxplay.register({
    id:'org.dxsrc.jsm.tingjinxia',name:'Ting15 audiobook catalog',
    description:'Semantic rewrite of the public Ting15 audiobook listings, large chapter sets and media resolution.',
    version: '1.0.0', protocol: 'catalog@1',
    async init(input){sourceKey=text(input.sourceKey)||'tingjinxia';return {ready:true};},
    async home(){return {categories:CATEGORIES.map(value=>({id:value[0],name:value[1],filters:FILTERS})),featured:parseItems(await load('/'))};},
    async category(input){
      const page=Math.max(1,Number(input.page)||1);
      const id=text(input.categoryId);
      if(!CATEGORIES.some(value=>value[0]===id)) throw new Error('tingjinxia.category-invalid');
      const order=text(input.filters&&input.filters.order);
      const path=order?'/'+id+'/index'+page+'-order-'+encodeURIComponent(order)+'.html':('/'+id+(page===1?'/':'/index'+page));
      const body=await load(path);
      const items=parseItems(body);
      const count=(body.match(/class=["']cpage["'][\s\S]*?<span[^>]*>\s*\d+\s*\/\s*(\d+)/i)||[])[1];
      return {page,pageCount:Number(count)||(items.length?page+1:page),items};
    },
    async search(input){
      const page=Math.max(1,Number(input.page)||1);
      if(page>1)return {page,pageCount:page,items:[]};
      return {page,pageCount:1,items:parseItems(await load('/?s=ting-search-wd-'+encodeURIComponent(text(input.keyword))))};
    },
    async detail(input){
      const id=text(input.id);
      const body=await load(id);
      const name=clean((body.match(/class=["'][^"']*binfo[^"']*["'][\s\S]*?<h1[^>]*>([\s\S]*?)<\/h1>/i)||[])[1]);
      const poster=(body.match(/class=["'][^"']*bimg[^"']*["'][\s\S]*?<img[^>]+src=["']([^"']+)/i)||[])[1];
      const info=clean((body.match(/class=["'][^"']*binfo[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)||[])[1]);
      const description=clean((body.match(/class=["'][^"']*intro[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)||[])[1]);
      const episodes=[];
      const pattern=/<a([^>]*)class=["'][^"']*\bf\b[^"']*["']([^>]*)>([\s\S]*?)<\/a>/ig;
      let match;
      while((match=pattern.exec(body))!==null){
        const attrs=match[1]+match[2];
        const href=(attrs.match(/href=["']([^"']+)/i)||[])[1];
        const title=clean(match[3]);
        if(href&&title)episodes.push({id:String(episodes.length+1),name:title,playId:href});
      }
      if(!name||!episodes.length)throw new Error('tingjinxia.item-not-found');
      return {id,sourceKey,name,poster:absolute(poster),description:description||info,playGroups:[{id:'audio',name:'堇夏',episodes}]};
    },
    async play(input){
      const path=text(input.playId).startsWith('/')?text(input.playId):'/'+text(input.playId);
      const pageUrl=absolute(path);
      const body=await load(path,pageUrl);
      let url='';
      const bookId=meta(body,'_b');
      const pay=meta(body,'_p');
      if(bookId&&pay){
        const form=['bookId='+encodeURIComponent(bookId),'isPay='+encodeURIComponent(pay),'page='+encodeURIComponent(meta(body,'_cp')||'1')];
        const xt=meta(body,'_c');
        if(xt)form.push('xt='+encodeURIComponent(xt));
        const response=await dxplay.fetch({url:BASE+'/?s=api-getneoplay',method:'POST',headers:Object.assign(headers(pageUrl),{'Content-Type':'application/x-www-form-urlencoded'}),body:form.join('&')});
        try{const payload=JSON.parse(response.body.replace(/^\uFEFF/,''));if(payload.status===1)url=text(payload.url||payload.ourl);}catch(_){}
      }
      if(!url)url=(body.match(/<audio[^>]+id=["']player["'][^>]+src=["']([^"']+)/i)||[])[1]||'';
      if(!/^https?:\/\//i.test(url))throw new Error('tingjinxia.play-unavailable');
      return {sourceKey,flag:text(input.flag),episodeId:text(input.episodeId),rawUrl:url,headers:headers(BASE+'/'),parse:false};
    },
    async destroy(){sourceKey='';},
  });
})();
