import {videoVendors,videoVendor} from '../src/creation/video-providers.js';

export function createGenerationAPIForm({kind,config={},video=false,toast,onSaved,onCancel}){
 const form=document.createElement('form');form.className='market-form';
 form.innerHTML=(video?'<label>厂家<select name="vendor"></select></label><label>服务名称<input name="name" maxlength="100" placeholder="例如：主账号 · 720p"></label><label>接口协议<select name="protocol"></select></label>':'')+
  '<label>API 基础地址<input name="url" type="url" maxlength="2048" required autocomplete="off"></label><label>模型名称<input name="model" maxlength="2048" required autocomplete="off"></label><label>API 密钥<input name="apiKey" type="password" maxlength="8192" autocomplete="new-password" spellcheck="false"></label><label class="generation-clear-key"><input name="clearApiKey" type="checkbox"> 清除已保存的密钥</label><button class="button secondary" type="button" data-action="models">获取模型</button><label data-models hidden>可用模型<select name="availableModel"></select></label><p class="quiet">可获取列表后选择，也可手动填写模型 ID。请选用支持视频生成的模型；中转服务需兼容所选厂家的接口协议。</p><button class="button secondary" type="submit">保存'+(video?'视频':'生图')+' API 配置</button><p role="status" class="quiet"></p>';
 const f=form.elements,status=form.querySelector('[role=status]'),modelsLabel=form.querySelector('[data-models]'),modelsButton=form.querySelector('[data-action=models]'),save=form.querySelector('[type=submit]');
 if(!video)form.querySelector('p.quiet').textContent='可获取列表后选择，也可手动填写图像模型 ID。列表可能包含其他用途的模型。';
 f.url.value=config.url||'';f.model.value=config.model||'';f.apiKey.placeholder=config.hasApiKey?'已保存密钥，留空保留':'输入 API Key（可选）';
 let revision=0,busy=false;
 const clearModels=()=>{revision++;f.availableModel.replaceChildren();modelsLabel.hidden=true;};
 const values=()=>({url:f.url.value,model:f.model.value,apiKey:f.apiKey.value,clearApiKey:f.clearApiKey.checked,protocol:video?f.protocol.value:'openai-images',...(video?{vendor:f.vendor.value,name:f.name.value}:{})});
 const setBusy=value=>{busy=value;for(const button of form.querySelectorAll('button'))button.disabled=value;};
 if(video){
  for(const vendor of videoVendors){const option=document.createElement('option');option.value=vendor.id;option.textContent=vendor.name;f.vendor.append(option);}
  f.vendor.value=config.vendor||videoVendors[0].id;f.name.value=config.name||'';
  function vendorChanged(initial=false){const vendor=videoVendor(f.vendor.value);
   f.protocol.replaceChildren();for(const [id,name]of vendor.protocols){const option=document.createElement('option');option.value=id;option.textContent=name;f.protocol.append(option);}
   if(initial&&vendor.protocols.some(([id])=>id===config.protocol))f.protocol.value=config.protocol;
   f.url.placeholder=vendor.url;f.model.placeholder=vendor.modelHint;
   if(!initial||!config.url)f.url.value=vendor.url;
   if(!initial){f.model.value='';f.apiKey.value='';f.clearApiKey.checked=false;clearModels();}
  }
  vendorChanged(true);f.vendor.onchange=()=>vendorChanged();
 }else{f.url.placeholder='https://your-service.example/v1';f.model.placeholder='图像模型 ID';}
 for(const name of ['url','apiKey','clearApiKey','protocol']){const input=f[name];if(input)input.addEventListener(['clearApiKey','protocol'].includes(name)?'change':'input',clearModels);}
 f.availableModel.onchange=()=>{if(f.availableModel.value)f.model.value=f.availableModel.value;};
 modelsButton.onclick=async()=>{if(busy)return;setBusy(true);clearModels();const version=revision;status.textContent='正在获取模型…';
  try{const rows=await window.pet.system({action:'generation-api-models',kind,values:values()});if(revision!==version){status.textContent='配置已变更，请重新获取模型。';return;}if(!rows.length){status.textContent='服务未返回可用模型，请手动填写模型名称。';return;}
   const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='请选择模型';f.availableModel.append(placeholder);
   for(const id of rows){const option=document.createElement('option');option.value=id;option.textContent=id;f.availableModel.append(option);}
   f.availableModel.value=rows.includes(f.model.value)?f.model.value:'';modelsLabel.hidden=false;status.textContent='已获取 '+rows.length+' 个模型，选择后请保存配置。';
  }catch(error){status.textContent=error.message;}finally{setBusy(false);}
 };
 form.onsubmit=async event=>{event.preventDefault();if(busy)return;setBusy(true);status.textContent='正在保存…';
  try{const next=await window.pet.system(video?{action:'generation-video-save',id:kind==='video-api'?undefined:kind,values:values()}:{action:'generation-api-configure',kind:'image',values:values()});
   if(!video){f.apiKey.value='';f.clearApiKey.checked=false;f.url.value=next.image.url;f.apiKey.placeholder=next.image.hasApiKey?'已保存密钥，留空保留':'输入 API Key（可选）';}
   status.textContent='配置已保存。';onSaved(next);toast(video?'视频 API 已保存并加入优先级':'生图 API 配置已保存');
  }catch(error){status.textContent=error.message;}finally{setBusy(false);}
 };
 if(onCancel){const cancel=document.createElement('button');cancel.type='button';cancel.className='text-button';cancel.textContent='取消';cancel.onclick=onCancel;save.after(cancel);}
 return form;
}
