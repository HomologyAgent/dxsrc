/* global dxplay */
(() => {
  'use strict';
  const USER_AGENT='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
  const DEFAULT_SITES=['https://www.wogg.live','https://woggpan.888484.xyz','https://wogg.xxooo.cf','https://woggpan.xxooo.cf'];
  const CATEGORIES=[['44','臻彩视觉'],['1','玩偶电影'],['2','玩偶剧集'],['3','动漫'],['4','综艺'],['5','音乐'],['6','短剧']];
  const FILTERS=[
    {key:'class',name:'剧情',initialValue:'',options:['全部','喜剧','爱情','恐怖','动作','科幻','剧情','战争','犯罪','古装','奇幻','武侠','冒险','悬疑'].map(name=>({name,value:name==='全部'?'':name}))},
    {key:'area',name:'地区',initialValue:'',options:['全部','中国大陆','中国香港','中国台湾','美国','英国','日本','韩国','泰国'].map(name=>({name,value:name==='全部'?'':name}))},
    {key:'year',name:'年份',initialValue:'',options:['全部','2026','2025','2024','2023','2022','2021','2020','2019'].map(name=>({name,value:name==='全部'?'':name}))},
    {key:'by',name:'排序',initialValue:'time',options:[{name:'时间',value:'time'},{name:'人气',value:'hits'},{name:'评分',value:'score'}]},
  ];
  let sourceKey='',siteBase='';
  const text=value=>value===undefined||value===null?'':String(value);
  const clean=value=>text(value).replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();
  const absolute=value=>{
    const url=clean(value);
    if(/^https?:\/\//i.test(url))return url;
    if(url.startsWith('//'))return 'https:'+url;
    return siteBase+(url.startsWith('/')?url:'/'+url);
  };
  const headers=()=>({'User-Agent':USER_AGENT,Referer:siteBase+'/'});
  const load=async path=>{
    const response=await dxplay.fetch({url:absolute(path),headers:headers()});
    if(response.status<200||response.status>=300)throw new Error('wogg.request-failed');
    return response.body;
  };
  const parseItems=(body,limit)=>{
    const items=[],seen=Object.create(null);
    const pattern=/href=["']([^"']*\/voddetail\/[^"']+)["'][^>]*title=["']([^"']+)["']/ig;
    let match;
    while((match=pattern.exec(body))!==null){
      const id=match[1],name=clean(match[2]);
      if(!id||!name||name==='臻彩'||seen[id])continue;
      const context=body.slice(Math.max(0,match.index-1000),Math.min(body.length,match.index+1800));
      let poster='',fallback='';
      const images=/<img([^>]*)>/ig;
      let image;
      while((image=images.exec(context))!==null){
        const attrs=image[1];
        const value=(attrs.match(/data-src=["']([^"']+)/i)||attrs.match(/src=["']([^"']+)/i)||[])[1];
        if(value&&!fallback)fallback=value;
        const alt=clean((attrs.match(/alt=["']([^"']+)/i)||[])[1]);
        if(value&&alt===name){poster=value;break;}
      }
      const remark=clean((context.match(/class=["'][^"']*(?:module-item-caption|video-serial)[^"']*["'][^>]*>([\s\S]*?)<\//i)||[])[1]);
      seen[id]=true;
      items.push({id,sourceKey,name,...((poster||fallback)?{poster:absolute(poster||fallback)}:{}),remark});
      if(limit&&items.length>=limit)break;
    }
    return items;
  };
  const shareLinks=body=>{
    const links=[],seen=Object.create(null),pattern=/data-clipboard-text=["']([^"']+)["']/ig;
    let match;
    while((match=pattern.exec(body))!==null){
      const url=clean(match[1]);
      if(!/^https?:\/\//i.test(url)||!/(?:pan\.quark\.cn|pan\.baidu\.com|aliyundrive\.com|alipan\.com|drive\.uc\.cn|123pan|cloud\.189\.cn|pan\.xunlei\.com)/i.test(url)||seen[url])continue;
      seen[url]=true;links.push(url);
    }
    return links;
  };

  dxplay.register({
    id:'org.dxsrc.jsm.wogg',name:'Wogg drive catalog',
    description:'Semantic rewrite of the reachable Wogg mirror catalog and its declarative cloud-drive shares.',
    version: '1.0.0', protocol: 'catalog@1',
    async init(input){
      sourceKey=text(input.sourceKey)||'wogg';
      const extension=input.extension&&typeof input.extension==='object'?input.extension:{};
      const candidates=Array.isArray(extension.site)?extension.site:DEFAULT_SITES;
      siteBase='';
      for(const candidate of candidates){
        const url=text(candidate).replace(/\/+$/,'');
        if(!/^https?:\/\//i.test(url))continue;
        try{const response=await dxplay.fetch({url,method:'HEAD',headers:{'User-Agent':USER_AGENT}});if(response.status>=200&&response.status<400){siteBase=url;break;}}catch(_){}
      }
      if(!siteBase)throw new Error('wogg.site-unavailable');
      return {ready:true};
    },
    async home(){return {categories:CATEGORIES.map(value=>({id:value[0],name:value[1],filters:FILTERS})),featured:parseItems(await load('/'),12)};},
    async category(input){
      const page=Math.max(1,Number(input.page)||1),filters=input.filters||{};
      const path='/vodshow/'+encodeURIComponent(text(input.categoryId))+'-'+encodeURIComponent(text(filters.area))+'-'+encodeURIComponent(text(filters.by))+'-'+encodeURIComponent(text(filters.class))+'-----'+page+'---'+encodeURIComponent(text(filters.year))+'.html';
      const items=parseItems(await load(path));
      return {page,pageCount:items.length?page+1:page,items};
    },
    async search(input){
      const page=Math.max(1,Number(input.page)||1);
      const items=parseItems(await load('/index.php/vodsearch/'+encodeURIComponent(text(input.keyword))+'----------'+page+'---.html'));
      return {page,pageCount:items.length?page+1:page,items};
    },
    async detail(input){
      const id=text(input.id),body=await load(id),links=shareLinks(body);
      const name=clean((body.match(/video-info-header[^>]*>[\s\S]*?page-title[^>]*>([\s\S]*?)<\//i)||[])[1]);
      const poster=(body.match(/module-item-pic[\s\S]*?<img[^>]+data-src=["']([^"']+)/i)||[])[1];
      const description=clean((body.match(/<p[^>]+class=["'][^"']*sqjj_a[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)||[])[1]);
      if(!name||!links.length)throw new Error('wogg.share-unavailable');
      return {id,sourceKey,name,...(poster?{poster:absolute(poster)}:{}),description,playGroups:[{id:'drive',name:'网盘',episodes:links.map((url,index)=>({id:String(index+1),name:links.length===1?name:name+' '+(index+1),playId:url,drive:{kind:'drive-share',url}}))}]};
    },
    async play(input){
      const url=text(input.playId);
      if(!/^https?:\/\//i.test(url))throw new Error('wogg.play-unavailable');
      return {sourceKey,flag:text(input.flag),episodeId:text(input.episodeId),rawUrl:url,headers:{},parse:false,drive:{kind:'drive-share',url}};
    },
    async destroy(){sourceKey='';siteBase='';},
  });
})();
