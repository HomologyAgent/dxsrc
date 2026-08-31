/* global dxplay */
(() => {
  'use strict';
  const BASE='https://www.rrdynb.com';
  const USER_AGENT='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
  const CATEGORIES=[['movie/list_2_','电影'],['dianshiju/list_6_','电视剧'],['zongyi/list_10_','老电影'],['dongman/list_13_','动漫']];
  let sourceKey='';
  const text=value=>value===undefined||value===null?'':String(value);
  const clean=value=>text(value).replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
  const absolute=value=>{const url=text(value);if(/^https?:\/\//i.test(url))return url;if(url.startsWith('//'))return 'https:'+url;return BASE+(url.startsWith('/')?url:'/'+url);};
  const load=async path=>{const response=await dxplay.fetch({url:absolute(path),headers:{'User-Agent':USER_AGENT}});if(response.status<200||response.status>=300)throw new Error('renren.request-failed');return response.body;};
  const parseItems=body=>{
    const items=[],seen=Object.create(null),pattern=/<li[^>]*class=["'][^"']*pure-g[^"']*shadow[^"']*["'][^>]*>([\s\S]*?)<\/li>/ig;
    let match;
    while((match=pattern.exec(body))!==null){
      const block=match[1],href=(block.match(/<a[^>]+href=["']([^"']+)/i)||[])[1];
      const titled=(block.match(/<h2[^>]*>[\s\S]*?<a[^>]+title=["']([^"']+)/i)||[])[1]||'';
      const named=titled.match(/《([^》]+)》/),name=clean(named?named[1]:titled);
      const poster=(block.match(/<img[^>]+data-original=["']([^"']+)/i)||block.match(/<img[^>]+src=["']([^"']+)/i)||[])[1];
      if(!href||!name||seen[href])continue;
      seen[href]=true;items.push({id:href,sourceKey,name,...(poster?{poster:absolute(poster)}:{})});
    }
    return items;
  };
  const shares=body=>{
    const values=[],seen=Object.create(null),pattern=/href=["'](https?:\/\/[^"']+)["']/ig;
    let match;
    while((match=pattern.exec(body))!==null){
      const url=clean(match[1]).replace(/#.*$/,'').replace('?entry=nmmecc','');
      if(!/(?:pan\.baidu\.com|pan\.quark\.cn|pan\.xunlei\.com|aliyundrive\.com|alipan\.com|cloud\.189\.cn)/i.test(url)||seen[url])continue;
      seen[url]=true;values.push(url);
    }
    return values;
  };

  dxplay.register({
    id:'org.dxsrc.jsm.renren',name:'RenRen drive catalog',
    description:'Semantic rewrite of the public RenRen download catalog and its declarative cloud-drive shares.',
    version: '1.0.0', protocol: 'catalog@1',
    async init(input){sourceKey=text(input.sourceKey)||'renren';return {ready:true};},
    async home(){return {categories:CATEGORIES.map(value=>({id:value[0],name:value[1]})),featured:[]};},
    async category(input){const page=Math.max(1,Number(input.page)||1),items=parseItems(await load('/'+text(input.categoryId)+page+'.html'));return {page,pageCount:items.length?page+1:page,items};},
    async search(input){const page=Math.max(1,Number(input.page)||1);if(page>1)return {page,pageCount:page,items:[]};return {page,pageCount:1,items:parseItems(await load('/plus/search.php?q='+encodeURIComponent(text(input.keyword))))};},
    async detail(input){
      const id=text(input.id),body=await load(id),links=shares(body);
      const rawTitle=clean((body.match(/movie-des[^>]*shadow[\s\S]*?<h1[^>]*>([\s\S]*?)<\/h1>/i)||[])[1]),named=rawTitle.match(/《([^》]+)》/);
      const name=named?named[1]:rawTitle,poster=(body.match(/movie-txt[\s\S]*?<img[^>]+src=["']([^"']+)/i)||[])[1];
      const description=clean((body.match(/剧情简介[：:]([\s\S]*?)资源[：:]/i)||[])[1]);
      if(!name||!links.length)throw new Error('renren.share-unavailable');
      return {id,sourceKey,name,...(poster?{poster:absolute(poster)}:{}),description,playGroups:[{id:'drive',name:'网盘',episodes:links.map((url,index)=>({id:String(index+1),name:links.length===1?name:name+' '+(index+1),playId:url,drive:{kind:'drive-share',url}}))}]};
    },
    async play(input){const url=text(input.playId);if(!/^https?:\/\//i.test(url))throw new Error('renren.play-unavailable');return {sourceKey,flag:text(input.flag),episodeId:text(input.episodeId),rawUrl:url,headers:{},parse:false,drive:{kind:'drive-share',url}};},
    async destroy(){sourceKey='';},
  });
})();
