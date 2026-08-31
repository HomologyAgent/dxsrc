/* global dxplay */
(() => {
  'use strict';
  const BASE='https://api.uuuka.com/api';
  const USER_AGENT='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
  const CATEGORIES=[['movie','电影'],['tv','电视剧'],['dongman','动漫'],['post','短剧']];
  const POSTERS={
    quark:'https://img.51shazhu.com/autoupload/g1b6f/20260807/bsds/1200X800/quark.jpg/webp',
    baidu:'https://img.51shazhu.com/autoupload/g1b6f/20260806/V6JN/1200X800/baidu.jpg/webp',
    ali:'https://img.51shazhu.com/autoupload/gE6Y0Af2tjXBCNig6CtNDI12_FRYNb81z6UPhMWD8iI/20260503/8Yr6/1200X800/aliyun.jpg/webp',
  };
  let sourceKey='';
  let records=Object.create(null);
  const text=value=>value===undefined||value===null?'':String(value);
  const posterFor=url=>url.includes('pan.baidu.com')?POSTERS.baidu:(url.includes('aliyundrive.com')||url.includes('alipan.com')?POSTERS.ali:POSTERS.quark);
  const cleanName=value=>{
    const title=text(value);
    const start=title.indexOf('《'),end=title.indexOf('》',start+1);
    if(start>=0&&end>start)return title.slice(start+1,end);
    if(start>=0&&start+1<title.length)return title.slice(start+1);
    return title;
  };
  const loadJson=async path=>{
    const response=await dxplay.fetch({url:BASE+path,headers:{'User-Agent':USER_AGENT}});
    if(response.status<200||response.status>=300)throw new Error('jike.request-failed');
    try{return JSON.parse(response.body);}catch(_){throw new Error('jike.response-invalid');}
  };
  const mapItems=values=>(Array.isArray(values)?values:[]).map(value=>{
    const url=text(value.source_link),name=cleanName(value.title)||'网盘分享';
    if(!/^https?:\/\//i.test(url))return null;
    const saved={name,poster:posterFor(url),remark:text(value.update_time)};
    records[url]=saved;
    return {id:url,sourceKey,name,poster:saved.poster,remark:saved.remark};
  }).filter(Boolean);

  dxplay.register({
    id:'org.dxsrc.jsm.jike',name:'Jike drive catalog',
    description:'Semantic rewrite of the public Jike categorized drive index and search, routed through DXPlay Drive Router.',
    version: '1.0.0', protocol: 'catalog@1',
    async init(input){sourceKey=text(input.sourceKey)||'jike';records=Object.create(null);return {ready:true};},
    async home(){return {categories:CATEGORIES.map(value=>({id:value[0],name:value[1]})),featured:[]};},
    async category(input){
      const page=Math.max(1,Number(input.page)||1);
      const payload=await loadJson('/contents/'+encodeURIComponent(text(input.categoryId))+'?page='+page+'&limit=20');
      const data=payload.success&&payload.data?payload.data:{};
      return {page:Number(data.page)||page,pageCount:Number(data.total_pages)||(page),items:mapItems(data.items)};
    },
    async search(input){
      const page=Math.max(1,Number(input.page)||1);
      const payload=await loadJson('/search?keyword='+encodeURIComponent(text(input.keyword))+'&page='+page+'&limit=20');
      const data=payload.success&&payload.data?payload.data:{};
      return {page:Number(data.page)||page,pageCount:Number(data.total_pages)||page,items:mapItems(data.items)};
    },
    async detail(input){
      const url=text(input.id);
      if(!/^https?:\/\//i.test(url))throw new Error('jike.item-not-found');
      const saved=records[url]||{name:'网盘分享',poster:posterFor(url),remark:''};
      const drive={kind:'drive-share',url};
      return {id:url,sourceKey,name:saved.name,poster:saved.poster,remark:saved.remark,playGroups:[{id:'share',name:'网盘',episodes:[{id:'share',name:saved.name,playId:url,drive}]}]};
    },
    async play(input){
      const url=text(input.playId);
      if(!/^https?:\/\//i.test(url))throw new Error('jike.play-unavailable');
      return {sourceKey,flag:text(input.flag),episodeId:text(input.episodeId),rawUrl:url,headers:{},parse:false,drive:{kind:'drive-share',url}};
    },
    async destroy(){sourceKey='';records=Object.create(null);},
  });
})();
