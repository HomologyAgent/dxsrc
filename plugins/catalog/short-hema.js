/* global dxplay */
(() => {
  'use strict';
  const BASE='https://freevideo.zqqds.cn';
  const KEY='dzkjgfyxgshylgzm',IV='apiupdownedcrypt';
  let sourceKey='',registration='';
  const text=value=>value===undefined||value===null?'':String(value);
  const uuid=()=>{
    const seed=String(Date.now())+String(Math.random());
    let offset=0;
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,kind=>{
      const code=seed.charCodeAt(offset++%seed.length),value=(code+Math.floor(Math.random()*16))&15;
      return (kind==='x'?value:(value&3)|8).toString(16);
    });
  };
  const dateStamp=()=>{
    const value=new Date(),part=number=>String(number).padStart(2,'0');
    return value.getFullYear()+part(value.getMonth()+1)+part(value.getDate())+part(value.getHours())+part(value.getMinutes())+part(value.getSeconds());
  };
  const encrypt=value=>dxplay.crypto.aesEncrypt({mode:'cbc',text:JSON.stringify(value),key:KEY,iv:IV});
  const decrypt=value=>JSON.parse(dxplay.crypto.aesDecrypt({mode:'cbc',base64:text(value),key:KEY,iv:IV}));
  const createRegistration=()=>{
    const session=uuid();
    return encrypt({version:'3.6.0',pname:'com.dz.hmjc',channelCode:'HMJC1000001',utdidTmp:'A'+dateStamp()+'TVBX',token:'',utdid:'7d2e96f3ed64e228ef1b337de386cdce',os:'android',osv:30,brand:'Redmi',model:'M2012K10C',manu:'Xiaomi',userId:'',launch:'shortcut',mchid:'HMJC1000001',nchid:'HMJC1000004',session1:session,session2:session,startScene:'shortcut',recSwitch:true,installTime:Date.now(),p:36});
  };
  const request=async (path,payload,retry)=>{
    if(!registration)registration=createRegistration();
    const response=await dxplay.fetch({url:BASE+path,method:'POST',headers:{'User-Agent':'okhttp/4.10.0','Content-Type':'application/json; charset=utf-8',alg:'HG45LKBS',datas:registration,'x-request-id':uuid()},body:encrypt(payload)});
    if(response.status<200||response.status>=300)throw new Error('shorthema.request-failed');
    let envelope;
    try{envelope=JSON.parse(response.body);}catch(_){throw new Error('shorthema.response-invalid');}
    if(envelope.code===8&&!retry){registration=createRegistration();return request(path,payload,true);}
    if(envelope.code!==undefined&&Number(envelope.code)!==0&&!envelope.data&&!envelope.datas)throw new Error('shorthema.api-failed');
    const encoded=text(envelope.data||envelope.datas);
    return encoded?decrypt(encoded):envelope;
  };
  const item=value=>{
    const state=text(value.finishStatusCn)+(value.updateNum?'/'+text(value.updateNum)+'集':'')+(value.videoStarsNum?'/'+text(value.videoStarsNum)+'分':'');
    return {id:text(value.bookId),sourceKey,name:text(value.bookName)||text(value.bookId),...(value.coverWap?{poster:text(value.coverWap)}:{}),remark:state};
  };
  const collectItems=payload=>{
    const values=[];
    (Array.isArray(payload.columnData)?payload.columnData:[]).forEach(column=>(Array.isArray(column.videoData)?column.videoData:[]).forEach(value=>values.push(item(value))));
    if(!values.length)(Array.isArray(payload.videoData)?payload.videoData:[]).forEach(value=>values.push(item(value)));
    return values;
  };
  const mediaUrl=(value,bookId)=>{
    if(typeof value==='string')return /^https?:\/\//i.test(value)?value:'';
    if(Array.isArray(value)){for(const entry of value){const found=mediaUrl(entry,bookId);if(found)return found;}return '';}
    if(!value||typeof value!=='object')return '';
    if(bookId&&value[bookId]){const found=mediaUrl(value[bookId],bookId);if(found)return found;}
    if(/^https?:\/\//i.test(text(value.mp4Url)))return text(value.mp4Url);
    const switched=mediaUrl(value.mp4SwitchUrl,bookId);if(switched)return switched;
    for(const key of Object.keys(value)){const found=mediaUrl(value[key],bookId);if(found)return found;}
    return '';
  };

  dxplay.register({
    id:'org.dxsrc.jsm.shorthema',name:'Hema short drama catalog',
    description:'Semantic rewrite of the public Hema encrypted short-drama API and per-episode direct playback.',
    version: '1.0.0', protocol: 'catalog@1',
    async init(input){sourceKey=text(input.sourceKey)||'shorthema';registration=createRegistration();return {ready:true};},
    async home(){
      const payload=await request('/free-video-portal/portal/1125',{recSwitch:true,pageFlag:'',theaterSubscriptSwitch:true});
      const categories=(Array.isArray(payload.channelGroupData)?payload.channelGroupData:[]).map(group=>{
        const options=(Array.isArray(group.channelData)?group.channelData:[]).map(value=>({name:text(value.channelName),value:text(value.channelId)+'@'+text(value.channelName)}));
        return {id:text(group.channelGroupId),name:text(group.channelGroupName)==='全部'?'推荐':text(group.channelGroupName),...(options.length?{filters:[{key:'class',name:'类型',initialValue:options[0].value,options}]}:{})};
      }).filter(value=>value.id&&value.name);
      return {categories,featured:collectItems(payload)};
    },
    async category(input){
      const page=Math.max(1,Number(input.page)||1),filter=text(input.filters&&input.filters.class),channel=Number(filter.split('@')[0])||0;
      const requestBody={recSwitch:true,pageFlag:page>1?String(page-1):'',theaterSubscriptSwitch:true,channelGroupId:Number(input.categoryId)};
      if(channel>0)requestBody.channelId=channel;
      const payload=await request('/free-video-portal/portal/1125',requestBody),items=collectItems(payload);
      return {page,pageCount:payload.hasMore||items.length>=18?page+1:page,items};
    },
    async search(input){
      const page=Math.max(1,Number(input.page)||1);if(page>1)return {page,pageCount:page,items:[]};
      const payload=await request('/free-video-portal/portal/1803',{keyword:text(input.keyword).trim(),page:1,size:15,hotWordType:2});
      const values=Array.isArray(payload.searchVos)?payload.searchVos:(Array.isArray(payload.content)?payload.content:[]);
      return {page,pageCount:1,items:values.map(item)};
    },
    async detail(input){
      const id=text(input.id),payload=await request('/free-video-portal/portal/1131',{bookId:id,needNextChapter:0,isNeedAlias:'',bookAlias:'',resolutionRate:'1080P'});
      const info=payload.videoInfo&&typeof payload.videoInfo==='object'?payload.videoInfo:payload;
      const chapters=Array.isArray(payload.chapterList)?payload.chapterList:(Array.isArray(info.chapterList)?info.chapterList:[]);
      const episodes=chapters.map((value,index)=>({id:text(value.chapterId)||String(index+1),name:text(value.chapterName)||'第'+(index+1)+'集',playId:id+'@'+text(value.chapterId)})).filter(value=>!value.playId.endsWith('@'));
      if(!info.bookName||!episodes.length)throw new Error('shorthema.item-not-found');
      return {id,sourceKey,name:text(info.bookName),poster:text(info.coverWap),actors:text(info.protagonist),description:text(info.introduction),remark:text(info.finishStatusCn),playGroups:[{id:'hema',name:'河马',episodes}]};
    },
    async play(input){
      const values=text(input.playId).split('@'),bookId=values[0],chapterId=values[1];
      if(!bookId||!chapterId)throw new Error('shorthema.play-invalid');
      const payload=await request('/free-video-portal/portal/1139',{bookId,chapterId,unClockType:'load',tierPlaySource:null,chapterIds:[chapterId],omap:{expId:null,logId:null,originName:'bigdata_rec',recId:null,scene:'dzmf_video_sc_reco',sceneId:'dzmf_video_sc_reco',strategyId:'godum7go',strategyName:'omap'}});
      const chapter=Array.isArray(payload.chapterInfo)?payload.chapterInfo[0]:payload.chapterInfo;
      let url=chapter?mediaUrl(chapter.content,bookId):'';
      if(!url&&payload.ad)url=mediaUrl(payload.ad.content,bookId);
      if(!/^https?:\/\//i.test(url))throw new Error('shorthema.play-unavailable');
      return {sourceKey,flag:text(input.flag),episodeId:text(input.episodeId),rawUrl:url,headers:{'User-Agent':'aliplayer(appv=2.7.1&av=7.1.0&av2=7.1.0_46933858&os=android&ov=11&dm=M2012K10C)'},parse:false};
    },
    async destroy(){sourceKey='';registration='';},
  });
})();
