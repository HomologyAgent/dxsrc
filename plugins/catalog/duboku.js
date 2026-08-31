/* global dxplay */
(() => {
  'use strict';
  const BASE = 'https://api.dbokutv.com';
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
  const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const CATEGORIES = [['1','电影'],['2','电视剧'],['3','综艺'],['4','动漫'],['21','短剧'],['20','港剧'],['13','陆剧'],['15','日韩剧'],['14','台泰剧']];
  const FILTERS = [
    {key:'class',name:'类型',initialValue:'',options:['全部','喜剧','爱情','恐怖','动作','科幻','剧情','悬疑','武侠','古装','家庭','奇幻'].map(name=>({name,value:name==='全部'?'':name}))},
    {key:'area',name:'地区',initialValue:'',options:['全部','大陆','香港','台湾','韩国','日本','美国','英国','泰国'].map(name=>({name,value:name==='全部'?'':name}))},
    {key:'year',name:'年份',initialValue:'',options:['全部','2026','2025','2024','2023','2022','2021','2020','2019'].map(name=>({name,value:name==='全部'?'':name}))},
    {key:'lang',name:'语言',initialValue:'',options:['全部','国语','粤语','韩语','日语','英语','泰语'].map(name=>({name,value:name==='全部'?'':name}))},
    {key:'by',name:'排序',initialValue:'',options:[{name:'时间',value:''},{name:'人气',value:'人气'},{name:'评分',value:'评分'}]},
  ];
  let sourceKey='';
  const text=value=>value===undefined||value===null?'':String(value);
  class JavaRandom{
    constructor(seed){this.seed=(BigInt(seed)^0x5deece66dn)&((1n<<48n)-1n);}
    next(bits){this.seed=(this.seed*0x5deece66dn+0xbn)&((1n<<48n)-1n);return Number(this.seed>>BigInt(48-bits));}
    nextInt(bound){
      if((bound&-bound)===bound)return Math.floor((bound*this.next(31))/0x80000000);
      let bits,value;
      do{bits=this.next(31);value=bits%bound;}while(bits-value+bound-1>=0x80000000);
      return value;
    }
  }
  const randomText=(length,seed,variant)=>{
    const chars=variant===33?'0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ':'XYZ0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVW';
    const random=new JavaRandom(seed);
    return Array.from({length},()=>chars[random.nextInt(chars.length)]).join('');
  };
  const base64Encode=value=>{
    let output='';
    for(let offset=0;offset<value.length;offset+=3){
      const a=value.charCodeAt(offset),b=offset+1<value.length?value.charCodeAt(offset+1):0,c=offset+2<value.length?value.charCodeAt(offset+2):0;
      output+=BASE64[a>>2]+BASE64[((a&3)<<4)|(b>>4)];
      output+=offset+1<value.length?BASE64[((b&15)<<2)|(c>>6)]:'=';
      output+=offset+2<value.length?BASE64[c&63]:'=';
    }
    return output;
  };
  const base64Decode=value=>{
    const normalized=text(value).replace(/\./g,'=').replace(/[^A-Za-z0-9+/=]/g,'');
    let output='';
    for(let offset=0;offset<normalized.length;offset+=4){
      const a=BASE64.indexOf(normalized[offset]),b=BASE64.indexOf(normalized[offset+1]);
      const c=normalized[offset+2]==='='?-1:BASE64.indexOf(normalized[offset+2]);
      const d=normalized[offset+3]==='='?-1:BASE64.indexOf(normalized[offset+3]);
      if(a<0||b<0)continue;
      output+=String.fromCharCode((a<<2)|(b>>4));
      if(c>=0)output+=String.fromCharCode(((b&15)<<4)|(c>>2));
      if(d>=0)output+=String.fromCharCode(((c&3)<<6)|d);
    }
    return output;
  };
  const decodeField=value=>{
    const encoded=text(value);
    let restored='';
    for(let offset=0;offset<encoded.length;offset+=10)restored+=encoded.slice(offset,offset+10).split('').reverse().join('');
    return base64Decode(restored);
  };
  const envelope=()=>{
    const milliseconds=Date.now(),seconds=Math.floor(milliseconds/1000);
    const first=new JavaRandom(seconds).nextInt(800000000);
    const left=String(100000000+first)+String(900000000-first),right=String(milliseconds);
    let interleaved='';
    const common=Math.min(left.length,right.length);
    for(let index=0;index<common;index+=1)interleaved+=left[index]+right[index];
    interleaved+=left.slice(common)+right.slice(common);
    return '?sign='+randomText(60,seconds+60,33)+'&ssid='+base64Encode(interleaved).replace(/=/g,'.')+'&token='+randomText(38,seconds+38,88);
  };
  const requestHeaders=()=>({'User-Agent':USER_AGENT,Referer:'https://www.duboku.tv/'});
  const loadJson=async (path,queryTail)=>{
    const response=await dxplay.fetch({url:BASE+path+envelope()+text(queryTail),headers:requestHeaders()});
    if(response.status<200||response.status>=300)throw new Error('duboku.request-failed');
    try{return JSON.parse(response.body);}catch(_){throw new Error('duboku.response-invalid');}
  };
  const item=value=>{
    const id=decodeField(value.DId),poster=decodeField(value.TnId);
    return {id,sourceKey,name:text(value.Name)||id,...(poster?{poster}:{}),remark:value.Tag?text(value.Tag):(value.Rating!==undefined?text(value.Rating)+'分':'')};
  };

  dxplay.register({
    id:'org.dxsrc.jsm.duboku',name:'Duboku catalog',
    description:'Semantic rewrite of the public Duboku signed API, encoded catalog fields and final media resolution.',
    version: '1.0.0', protocol: 'catalog@1',
    async init(input){sourceKey=text(input.sourceKey)||'duboku';return {ready:true};},
    async home(){
      const payload=await loadJson('/home');
      const featured=[];
      (Array.isArray(payload)?payload:[]).forEach(section=>(Array.isArray(section.VodList)?section.VodList:[]).forEach(value=>featured.push(item(value))));
      return {categories:CATEGORIES.map(value=>({id:value[0],name:value[1],filters:FILTERS})),featured};
    },
    async category(input){
      const page=Math.max(1,Number(input.page)||1),filters=input.filters||{};
      const path='/vodshow/'+encodeURIComponent(text(input.categoryId))+'-'+encodeURIComponent(text(filters.area))+'-'+encodeURIComponent(text(filters.by))+'-'+encodeURIComponent(text(filters.class))+'-'+encodeURIComponent(text(filters.lang))+'----'+page+'---'+encodeURIComponent(text(filters.year));
      const payload=await loadJson(path);
      const values=payload&&Array.isArray(payload.VodList)?payload.VodList:[];
      return {page,pageCount:values.length?page+1:page,items:values.map(item)};
    },
    async search(input){
      const page=Math.max(1,Number(input.page)||1);
      if(page>1)return {page,pageCount:page,items:[]};
      const payload=await loadJson('/vodsearch','&wd='+encodeURIComponent(text(input.keyword)));
      const values=Array.isArray(payload)?payload:[];
      return {page,pageCount:1,items:values.map(item)};
    },
    async detail(input){
      const id=text(input.id);
      const payload=await loadJson(id);
      const playlist=Array.isArray(payload.Playlist)?payload.Playlist:[];
      const episodes=playlist.map((value,index)=>{
        const name=text(value.EpisodeName)||String(index+1);
        return {id:String(index+1),name,playId:decodeField(value.VId)+'|'+name+'|'+text(payload.Name)};
      }).filter(value=>value.playId[0]==='/');
      if(!payload.Name||!episodes.length)throw new Error('duboku.item-not-found');
      return {id,sourceKey,name:text(payload.Name),poster:decodeField(payload.TnId),year:text(payload.ReleaseYear),actors:Array.isArray(payload.Actor)?payload.Actor.join(' / '):text(payload.Actor),director:text(payload.Director),description:text(payload.Description),playGroups:[{id:'duboku',name:'独播库',episodes}]};
    },
    async play(input){
      const values=text(input.playId).split('|'),path=values[0];
      if(!path||!path.startsWith('/'))throw new Error('duboku.play-invalid');
      const payload=await loadJson(path);
      const url=decodeField(payload.HId);
      if(!/^https?:\/\//i.test(url))throw new Error('duboku.play-unavailable');
      return {sourceKey,flag:text(input.flag),episodeId:text(input.episodeId),rawUrl:url,headers:{'User-Agent':USER_AGENT,Origin:'https://w.duboku.io',Referer:'https://w.duboku.io/'},parse:false};
    },
    async destroy(){sourceKey='';},
  });
})();
