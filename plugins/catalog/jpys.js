/* global dxplay */
(() => {
  'use strict';
  const DEFAULT_SITES=['https://y2s52n7.com','https://m.hkybqufgh.com','https://m.sizhengxt.com','https://m.9zhoukj.com','https://m.jiabaide.cn'];
  const KEY='cb808529bae6b6be45ecfab29a4889bc';
  const USER_AGENT='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
  const CATEGORIES=[['1','电影'],['2','电视剧'],['4','动漫'],['3','综艺']];
  const FILTERS=[
    {key:'area',name:'地区',initialValue:'',options:['全部','中国大陆','中国香港','中国台湾','美国','日本','韩国','泰国','印度','其他'].map(name=>({name,value:name==='全部'?'':name}))},
    {key:'year',name:'年份',initialValue:'',options:['全部','2026','2025','2024','2023','2022','2021','2020','2019','2018','2017','2016','2015','2014','2013','2012','2011','2010','更早'].map(name=>({name,value:name==='全部'?'':name}))},
  ];
  const MD5_SHIFT=[7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
  const MD5_CONSTANT=Array.from({length:64},(_,index)=>Math.floor(Math.abs(Math.sin(index+1))*4294967296)>>>0);
  let sourceKey='',baseUrl='';
  const text=value=>value===undefined||value===null?'':String(value);
  const utf8=value=>{
    const encoded=encodeURIComponent(text(value)),bytes=[];
    for(let index=0;index<encoded.length;index+=1){if(encoded[index]==='%'){bytes.push(parseInt(encoded.slice(index+1,index+3),16));index+=2;}else bytes.push(encoded.charCodeAt(index));}
    return bytes;
  };
  const add32=(...values)=>values.reduce((sum,value)=>(sum+(value>>>0))>>>0,0);
  const rotate=(value,count)=>((value<<count)|(value>>>(32-count)))>>>0;
  const md5=value=>{
    const bytes=utf8(value),bitLength=bytes.length*8;
    bytes.push(128);while(bytes.length%64!==56)bytes.push(0);
    for(let index=0;index<8;index+=1)bytes.push(index<4?(bitLength>>>(index*8))&255:(Math.floor(bitLength/4294967296)>>>(index*8-32))&255);
    let a0=0x67452301,b0=0xefcdab89,c0=0x98badcfe,d0=0x10325476;
    for(let offset=0;offset<bytes.length;offset+=64){
      const words=Array.from({length:16},(_,index)=>bytes[offset+index*4]|(bytes[offset+index*4+1]<<8)|(bytes[offset+index*4+2]<<16)|(bytes[offset+index*4+3]<<24));
      let a=a0,b=b0,c=c0,d=d0;
      for(let index=0;index<64;index+=1){let f,word;if(index<16){f=(b&c)|(~b&d);word=index;}else if(index<32){f=(d&b)|(~d&c);word=(5*index+1)%16;}else if(index<48){f=b^c^d;word=(3*index+5)%16;}else{f=c^(b|~d);word=(7*index)%16;}const oldD=d;d=c;c=b;b=add32(b,rotate(add32(a,f,MD5_CONSTANT[index],words[word]),MD5_SHIFT[index]));a=oldD;}
      a0=add32(a0,a);b0=add32(b0,b);c0=add32(c0,c);d0=add32(d0,d);
    }
    return [a0,b0,c0,d0].map(word=>[0,8,16,24].map(shift=>((word>>>shift)&255).toString(16).padStart(2,'0')).join('')).join('');
  };
  const sha1=value=>{
    const bytes=utf8(value),bitLength=bytes.length*8;
    bytes.push(128);while(bytes.length%64!==56)bytes.push(0);
    for(let index=7;index>=0;index-=1)bytes.push(index>=4?(Math.floor(bitLength/4294967296)>>((index-4)*8))&255:(bitLength>>>(index*8))&255);
    let h0=0x67452301,h1=0xefcdab89,h2=0x98badcfe,h3=0x10325476,h4=0xc3d2e1f0;
    for(let offset=0;offset<bytes.length;offset+=64){
      const words=new Array(80);for(let index=0;index<16;index+=1)words[index]=((bytes[offset+index*4]<<24)|(bytes[offset+index*4+1]<<16)|(bytes[offset+index*4+2]<<8)|bytes[offset+index*4+3])>>>0;
      for(let index=16;index<80;index+=1)words[index]=rotate(words[index-3]^words[index-8]^words[index-14]^words[index-16],1);
      let a=h0,b=h1,c=h2,d=h3,e=h4;
      for(let index=0;index<80;index+=1){let f,k;if(index<20){f=(b&c)|(~b&d);k=0x5a827999;}else if(index<40){f=b^c^d;k=0x6ed9eba1;}else if(index<60){f=(b&c)|(b&d)|(c&d);k=0x8f1bbcdc;}else{f=b^c^d;k=0xca62c1d6;}const temp=add32(rotate(a,5),f,e,k,words[index]);e=d;d=c;c=rotate(b,30);b=a;a=temp;}
      h0=add32(h0,a);h1=add32(h1,b);h2=add32(h2,c);h3=add32(h3,d);h4=add32(h4,e);
    }
    return [h0,h1,h2,h3,h4].map(word=>(word>>>0).toString(16).padStart(8,'0')).join('');
  };
  const signedHeaders=canonical=>{const timestamp=String(Date.now());return {timestamp,headers:{'User-Agent':USER_AGENT,sign:sha1(md5(canonical(KEY,timestamp))),T:timestamp,Deviceid:'Deviceid'}};};
  const request=async (path,canonical)=>{
    const signed=signedHeaders(canonical),response=await dxplay.fetch({url:baseUrl+path(signed.timestamp),headers:signed.headers});
    if(response.status<200||response.status>=300)throw new Error('jpys.request-failed');
    try{return JSON.parse(response.body);}catch(_){throw new Error('jpys.response-invalid');}
  };
  const item=value=>({id:text(value.vodId),sourceKey,name:text(value.vodName)||text(value.vodId),...(value.vodPic?{poster:text(value.vodPic)}:{}),remark:text(value.vodVersion||value.vodRemarks)});

  dxplay.register({
    id:'org.dxsrc.jsm.jpys',name:'JinPai catalog',
    description:'Semantic rewrite of the public JinPai signed JSON catalog and direct episode media resolution.',
    version: '1.0.0', protocol: 'catalog@1',
    async init(input){
      sourceKey=text(input.sourceKey)||'jpys';baseUrl='';
      const extension=text(input.extension),candidates=extension?extension.split(','):DEFAULT_SITES;
      for(const candidate of candidates){const url=text(candidate).trim().replace(/\/+$/,'');if(!/^https?:\/\//i.test(url))continue;try{const response=await dxplay.fetch({url,method:'HEAD',headers:{'User-Agent':USER_AGENT}});if(response.status>=200&&response.status<400){baseUrl=url;break;}}catch(_){}}
      if(!baseUrl)throw new Error('jpys.site-unavailable');return {ready:true};
    },
    async home(){
      const payload=await request(timestamp=>'/api/mw-movie/anonymous/home/hotSearch',(_,timestamp)=>'key='+KEY+'&t='+timestamp);
      const values=Array.isArray(payload.data)?payload.data:[];
      return {categories:CATEGORIES.map(value=>({id:value[0],name:value[1],filters:FILTERS})),featured:values.map(item)};
    },
    async category(input){
      const page=Math.max(1,Number(input.page)||1),id=text(input.categoryId),area=text(input.filters&&input.filters.area),year=text(input.filters&&input.filters.year);
      const canonical=(_,timestamp)=>'area='+area+'&pageNum='+page+'&type1='+id+'&year='+year+'&key='+KEY+'&t='+timestamp;
      const payload=await request(()=>'/api/mw-movie/anonymous/video/list?type1='+encodeURIComponent(id)+'&pageNum='+page+'&area='+encodeURIComponent(area)+'&year='+encodeURIComponent(year),canonical);
      const values=payload.data&&Array.isArray(payload.data.list)?payload.data.list:[];
      return {page,pageCount:values.length?page+1:page,items:values.map(item)};
    },
    async search(input){
      const page=Math.max(1,Number(input.page)||1);if(page>1)return {page,pageCount:page,items:[]};
      const keyword=text(input.keyword),canonical=(_,timestamp)=>'keyword='+keyword+'&pageNum=1&pageSize=8&key='+KEY+'&t='+timestamp;
      const payload=await request(()=>'/api/mw-movie/anonymous/video/searchByWord?keyword='+encodeURIComponent(keyword)+'&pageNum=1&pageSize=8',canonical);
      const values=payload.data&&payload.data.result&&Array.isArray(payload.data.result.list)?payload.data.result.list:[];
      return {page,pageCount:1,items:values.filter(value=>text(value.vodClass)!=='伦理').map(item)};
    },
    async detail(input){
      const id=text(input.id),canonical=(_,timestamp)=>'id='+id+'&key='+KEY+'&t='+timestamp;
      const payload=await request(()=>'/api/mw-movie/anonymous/video/detail?id='+encodeURIComponent(id),canonical),value=payload.data||{};
      const episodes=(Array.isArray(value.episodeList)?value.episodeList:[]).map((episode,index)=>({id:text(episode.nid)||String(index+1),name:text(episode.name)||String(index+1),playId:id+'@'+text(episode.nid)})).filter(episode=>!episode.playId.endsWith('@'));
      if(!value.vodName||!episodes.length)throw new Error('jpys.item-not-found');
      return {id,sourceKey,name:text(value.vodName),poster:text(value.vodPic),remark:text(value.vodRemarks),area:text(value.vodArea),year:text(value.vodYear),actors:text(value.vodActor),director:text(value.vodDirector),description:text(value.vodBlurb||value.vodContent),playGroups:[{id:'online',name:'在线播放',episodes}]};
    },
    async play(input){
      const values=text(input.playId).split('@'),id=values[0],nid=values[1];if(!id||!nid)throw new Error('jpys.play-invalid');
      const canonical=(_,timestamp)=>'id='+id+'&nid='+nid+'&key='+KEY+'&t='+timestamp;
      const payload=await request(()=>'/api/mw-movie/anonymous/v2/video/episode/url?id='+encodeURIComponent(id)+'&nid='+encodeURIComponent(nid),canonical);
      const list=payload.data&&Array.isArray(payload.data.list)?payload.data.list:[],url=list.length?text(list[0].url):'';
      if(!/^https?:\/\//i.test(url))throw new Error('jpys.play-unavailable');
      return {sourceKey,flag:text(input.flag),episodeId:text(input.episodeId),rawUrl:url,headers:{'User-Agent':USER_AGENT,Origin:baseUrl,Referer:baseUrl},parse:false};
    },
    async destroy(){sourceKey='';baseUrl='';},
  });
})();
