const node=(class_type,inputs)=>({class_type,inputs});
export const MODEL_KEYS=['qwenModel','qwenClip','qwenVae','h3Model','h3Clip','h3Vae'];
export function environment(info,models={}){
  const choices={qwenModel:info.UNETLoader?.input.required.unet_name[0]||[],qwenClip:info.CLIPLoader?.input.required.clip_name[0]||[],qwenVae:info.VAELoader?.input.required.vae_name[0]||[]};
  Object.assign(choices,{h3Model:choices.qwenModel,h3Clip:choices.qwenClip,h3Vae:choices.qwenVae});
  const specs={qwen:['UNETLoader','CLIPLoader','VAELoader','TextEncodeQwenImage21','KSampler','VAEDecode','SaveImage','LoadImage','InvertMask','JoinImageWithAlpha','EmptyLatentImage'],h3:['UNETLoader','CLIPLoader','VAELoader','MiniMaxH3ImageToVideo','BasicGuider','RandomNoise','KSamplerSelect','BasicScheduler','SamplerCustomAdvanced','VAEDecodeTiled','CreateVideo','SaveVideo','LoadImage','ImageScale']};
  return {choices,optional:{qwenCache:Boolean(info.QwenImage21Cache),qwenPromptEnhancer:Boolean(info.TextGenerate)},profiles:Object.fromEntries(Object.entries(specs).map(([key,nodes])=>{
    const missingNodes=nodes.filter(n=>!info[n]),missingModels=['Model','Clip','Vae'].map(s=>key+s).filter(k=>!choices[k]?.includes(models[k]));
    return [key,{ready:!missingNodes.length&&!missingModels.length,missingNodes,missingModels}];
  }))};
}
export function qwenWorkflow(p,m,images,prefix){
  const editing=images.length>0;
  const g={'1':node('UNETLoader',{unet_name:m.qwenModel,weight_dtype:'default'}),'2':node('CLIPLoader',{clip_name:m.qwenClip,type:'qwen_image',device:'default'}),'3':node('VAELoader',{vae_name:m.qwenVae})};
  // Editing follows image_1 unless an explicit canvas is requested. Resolution
  // is an approximate area budget, not an output width or height; zero keeps refs.
  const inputs={clip:['2',0],prompt:p.prompt,negative_prompt:p.negativePrompt||'',resolution:p.size??(editing?0:1024)};
  if(editing)inputs.vae=['3',0];
  images.forEach((image,i)=>{const load=String(20+i*3),invert=String(21+i*3),join=String(22+i*3);g[load]=node('LoadImage',{image});g[invert]=node('InvertMask',{mask:[load,1]});g[join]=node('JoinImageWithAlpha',{image:[load,0],alpha:[invert,0]});inputs['images.image_'+(i+1)]=[join,0];});
  g['4']=node('TextEncodeQwenImage21',inputs);
  let latent=['4',2],model=['1',0];
  if(!editing||p.width!==undefined){
    const size=p.size||1024;g['8']=node('EmptyLatentImage',{width:p.width??size,height:p.height??size,batch_size:1});latent=['8',0];
  }
  if(p.cache){g['9']=node('QwenImage21Cache',{model,device:p.cacheDevice??'auto',dtype:p.cacheDtype??'default'});model=['9',0];}
  g['5']=node('KSampler',{model,positive:['4',0],negative:['4',1],latent_image:latent,seed:p.seed,steps:p.steps,cfg:p.cfg,sampler_name:p.sampler??'euler',scheduler:p.scheduler??'simple',denoise:1});
  g['6']=node('VAEDecode',{samples:['5',0],vae:['3',0]});g['7']=node('SaveImage',{images:['6',0],filename_prefix:prefix});return g;
}
export function h3Workflow(p,m,image,prefix){
  const g={'1':node('UNETLoader',{unet_name:m.h3Model,weight_dtype:'default'}),'2':node('CLIPLoader',{clip_name:m.h3Clip,type:'minimax',device:'default'}),'3':node('VAELoader',{vae_name:m.h3Vae}),'4':node('LoadImage',{image}),'8':node('ImageScale',{image:['4',0],upscale_method:'lanczos',width:p.size,height:p.size,crop:'disabled'}),'9':node('MiniMaxH3ImageToVideo',{clip:['2',0],vae:['3',0],prompt:p.prompt,width:p.size,height:p.size,length:p.frames,first_frame:['8',0]}),'10':node('BasicGuider',{model:['1',0],conditioning:['9',0]}),'11':node('RandomNoise',{noise_seed:p.seed}),'12':node('KSamplerSelect',{sampler_name:'res_multistep'}),'13':node('BasicScheduler',{model:['1',0],scheduler:'simple',steps:p.steps,denoise:1}),'14':node('SamplerCustomAdvanced',{noise:['11',0],guider:['10',0],sampler:['12',0],sigmas:['13',0],latent_image:['9',1]}),'15':node('VAEDecodeTiled',{samples:['14',0],vae:['3',0],tile_size:256,overlap:32,temporal_size:16,temporal_overlap:4}),'16':node('CreateVideo',{images:['15',0],fps:24,codec:'h264',color_space:'sRGB',bit_depth:8}),'17':node('SaveVideo',{video:['16',0],filename_prefix:prefix,format:'auto',codec:'auto'})};
  if(p.returnToStart)g['9'].inputs.last_frame=['8',0];return g;
}
