// DSH browser modules use its lazy factory contract; React comes from the host.
window.__ModuleLoader__.load({id:'lingpet',factory:require=>{
  const React=require('react'),h=React.createElement;
  const BRAND_MARK="<svg aria-hidden=\"true\" xmlns=\"http://www.w3.org/2000/svg\" width=\"128\" height=\"128\" viewBox=\"0 0 128 128\"><defs><mask id=\"face\"><rect width=\"128\" height=\"128\" fill=\"white\"/><g fill=\"black\"><rect x=\"42\" y=\"54\" width=\"6\" height=\"10\" rx=\"3\"/><rect x=\"67\" y=\"54\" width=\"6\" height=\"10\" rx=\"3\"/><path d=\"M40 81Q56 96 75 81\" fill=\"none\" stroke=\"black\" stroke-width=\"5\" stroke-linecap=\"round\"/></g></mask></defs><g fill=\"currentColor\" mask=\"url(#face)\"><path d=\"M28 43 27 22Q27 17 32 20L49 30Q61 27 73 32L83 23Q88 19 89 26L92 48C102 66 95 91 77 101C57 112 31 102 24 83C19 68 21 54 28 43Z\"/><path d=\"m105 23 3.3 8.7L117 35l-8.7 3.3L105 47l-3.3-8.7L93 35l8.7-3.3Z\"/></g></svg>";
  const namespace='board-ai-pet';
  function PetSettings({form}){
    const state=React.useSyncExternalStore(listener=>form.subscribe(listener),()=>form.getSnapshot());
    const [busy,setBusy]=React.useState(false),[message,setMessage]=React.useState('');
    const [pet,setPet]=React.useState({loading:true}),[acting,setActing]=React.useState('');
    const [petItems,setPetItems]=React.useState([]);
    const disabled=busy||state.status!=='ready'||!state.writable;
    async function write(field,value){
      setBusy(true);setMessage('');
      try{const ok=await form.set(field,value);setMessage(ok?'已保存，即时生效':'未保存，配置可能已被其他页面修改，请重试。');}
      catch{setMessage('保存失败，请检查 DSH 连接后重试。');}
      finally{setBusy(false);}
    }
    async function reset(){
      setBusy(true);setMessage('');
      try{const ok=await form.mutate([{op:'unset',path:['autoStart']},{op:'unset',path:['includeSubagents']}]);setMessage(ok?'已恢复继承配置':'恢复失败，请刷新后重试。');}
      catch{setMessage('恢复失败，请检查 DSH 连接。');}finally{setBusy(false);}
    }
    // Status and commands travel over same-origin routes registered by the host plugin.
    React.useEffect(()=>{
      let alive=true;
      async function load(){
        try{const response=await fetch('/board-pet/status',{credentials:'same-origin'});const value=await response.json();if(alive)setPet({...value,loading:false});const list=await fetch('/board-pet/pets',{credentials:'same-origin'});const items=await list.json();if(alive)setPetItems(items.pets||[]);}
        catch{if(alive)setPet({loading:false,offline:true});}
      }
      void load();const timer=setInterval(()=>void load(),4000);
      return ()=>{alive=false;clearInterval(timer);};
    },[]);
    async function command(action){
      setActing(action);setMessage('');
      try{
        const response=await fetch(`/board-pet/${action}`,{method:'POST',credentials:'same-origin',headers:{'x-board-pet':'1'}});
        const value=await response.json();
        setPet(previous=>({...previous,...value,loading:false}));
        setMessage(value.ok?(action==='start'?(value.alreadyRunning?'桌宠已经在运行。':value.pending?'已请求启动桌宠；首次启动可能需要准备运行时，稍后会自动刷新状态。':'已请求启动桌宠，正在连接…'):action==='stop'?(value.alreadyStopped?'桌宠本来就没有运行。':'已请求关闭桌宠。'):'已打开桌宠工作台。'):(value.error||'操作失败，请稍后重试。'));
      }catch{setMessage('当前 DSH 界面无法连接管理接口，请在 DSH Web 中打开本页。');}
      finally{setActing('');}
    }
    const running=Boolean(pet.running),offline=Boolean(pet.offline);
    async function managePet(action,id,value){
      setActing('manage');try{const response=await fetch('/board-pet/manage',{method:'POST',credentials:'same-origin',headers:{'x-board-pet':'1','Content-Type':'application/json'},body:JSON.stringify({action,id,value})});const result=await response.json();if(!result.ok)throw new Error(result.error||'操作失败');setPetItems(result.pets||[]);setMessage('桌宠配置已更新。');}catch(error){setMessage(error.message);}finally{setActing('');}
    }
    const row=(field,title,description,fallback)=>h('label',{key:field,className:'lp-option',style:{display:'flex',gap:24,alignItems:'center',justifyContent:'space-between',padding:'18px 0',borderBottom:'1px solid color-mix(in srgb, currentColor 18%, transparent)'}},
      h('span',null,h('strong',null,title),h('span',{style:{display:'block',opacity:.65,fontSize:13,marginTop:6,lineHeight:1.6}},description)),
      h('input',{type:'checkbox',role:'switch','aria-label':title,checked:state.value?.[field]??fallback,disabled,onChange:event=>void write(field,event.target.checked),style:{width:18,height:18,flexShrink:0,accentColor:'#d68c67'}}));
    const button=(action,label,hint)=>h('button',{key:action,type:'button','data-pet-action':action,className:'lp-button',title:hint,disabled:Boolean(acting)||offline||(action==='start'?running:!running),onClick:()=>void command(action),style:{padding:'8px 14px',minHeight:38,border:'1px solid color-mix(in srgb, currentColor 25%, transparent)',borderRadius:8,color:'inherit',background:'transparent',cursor:'pointer'}},acting===action?'处理中…':label);
    return h('section',{'aria-label':'桌宠设置',className:'lp-settings'},
      h('style',null,`.lp-settings{max-width:800px;padding:20px 8px;color:inherit;font-size:13px;line-height:1.7}.lp-settings *{box-sizing:border-box}.lp-settings header{margin-bottom:28px}.lp-settings .lp-brand{display:flex;align-items:center;gap:10px;font-size:11px;letter-spacing:1.5px;opacity:.85}.lp-settings .lp-mark svg{display:block;width:30px;height:30px;color:var(--lp-accent,currentColor)}.lp-settings h2{font-size:28px;letter-spacing:-.6px;margin:9px 0;font-weight:650}.lp-settings header p{opacity:.65;font-size:13px;max-width:50ch}.lp-settings .lp-card{padding:22px;border:1px solid color-mix(in srgb,currentColor 15%,transparent);border-radius:14px;margin:0 0 18px;background:color-mix(in srgb,currentColor 3%,transparent)}.lp-settings h3{font-size:14px;margin:0 0 8px;font-weight:600}.lp-settings .lp-status{display:flex;align-items:center;gap:9px}.lp-settings .lp-status:before{content:'';width:7px;height:7px;border-radius:50%;background:#91a3b3}.lp-settings .lp-status.running:before{background:#69b590;box-shadow:0 0 0 4px #69b59015}.lp-settings .lp-detail{opacity:.65;font-size:12px;margin:10px 0 18px}.lp-settings .lp-actions{display:flex;gap:9px;flex-wrap:wrap}.lp-settings button{font:inherit;font-size:12px;min-height:38px;padding:8px 13px!important;border:1px solid color-mix(in srgb,currentColor 20%,transparent)!important;border-radius:9px!important;color:inherit;background:transparent;cursor:pointer}.lp-settings button:hover:not(:disabled){background:color-mix(in srgb,currentColor 7%,transparent)!important}.lp-settings button:disabled{opacity:.4;cursor:default}.lp-settings button:focus-visible{outline:2px solid #d79d76;outline-offset:3px}.lp-settings button[data-pet-action=dashboard]{background:#d79d76!important;color:#241c17!important;border-color:#d79d76!important;font-weight:600}.lp-settings .lp-pet{display:flex;gap:14px;align-items:center;justify-content:space-between;padding:14px 0;border-bottom:1px solid color-mix(in srgb,currentColor 10%,transparent)}.lp-settings .lp-pet>div{min-width:0;overflow-wrap:anywhere}.lp-settings .lp-pet>button{flex-shrink:0}.lp-settings .lp-pet strong{font-size:13px}.lp-settings .lp-pet small{display:block;font-size:11px;opacity:.6;margin-top:3px}.lp-settings .lp-option{padding:18px 0!important;gap:20px!important}.lp-settings .lp-option strong{font-size:13px;font-weight:500}.lp-settings .lp-option>span>span{font-size:11px!important;line-height:1.8!important}.lp-settings .lp-option input{width:18px;height:18px}.lp-settings .lp-footnote{font-size:11px;opacity:.6;line-height:1.9}.lp-settings .lp-message{font-size:12px;min-height:24px;margin:12px 0;color:inherit}.lp-settings .lp-add{margin-top:16px}.lp-settings .lp-reset{margin-top:18px}@media(max-width:420px){.lp-settings{padding:12px 0}.lp-settings .lp-card{padding:18px}.lp-settings .lp-actions{display:grid;grid-template-columns:1fr 1fr}.lp-settings .lp-actions>button:last-child{grid-column:1/-1}}`),
      h('header',null,h('div',{className:'lp-brand'},h('span',{className:'lp-mark','aria-hidden':true,dangerouslySetInnerHTML:{__html:BRAND_MARK}}),'LINGPET / 灵伴'),h('h2',null,'你的会话伙伴'),h('p',null,'让桌宠陪伴每一次思考与创作，在工作台管理形象和会话跟随。')),
      state.status==='loading'?h('p',{role:'status'},'正在加载配置…'):null,
      state.status==='unavailable'?h('p',{role:'alert'},'桌宠插件当前不可用，请检查是否已启用。'):null,
      state.status==='ready'&&!state.writable?h('p',{role:'status'},'当前配置只读。'):null,
      h('div',{className:'lp-card'},h('h3',{className:'lp-status'+(running?' running':'')},'桌宠运行状态'),
        h('p',{role:'status','aria-live':'polite',className:'lp-detail'},pet.loading?'正在检测桌宠…':offline?'当前界面无法连接管理接口，请在 DSH Web 中打开。':running?'桌宠正在运行，随时打开工作台调整形象。':'桌宠已关闭，点击启动即可恢复。'),
        h('div',{className:'lp-actions'},button('start','启动桌宠','在本机启动共享桌宠服务'),button('stop','关闭全部','退出所有桌宠并暂停自动唤起'),button('dashboard','打开工作台','管理形象与会话跟随'))),
      h('div',{className:'lp-card'},h('h3',null,'我的桌宠'),
        ...petItems.map(item=>h('div',{key:item.id,className:'lp-pet'},h('div',null,h('strong',null,item.name),h('small',null,item.follow?.mode==='global'?'全局自动跟随':['dsh','cursor','codex'].includes(item.follow?.mode)?item.follow.mode.toUpperCase()+' 自动跟随':item.follow?.mode==='source'?item.follow.source+' 自动跟随':'跟随指定会话')),
          h('button',{type:'button',disabled:Boolean(acting),onClick:()=>void managePet('update',item.id,{enabled:true,petVisible:!(item.enabled!==false&&item.petVisible!==false)})},item.enabled!==false&&item.petVisible!==false?'隐藏':'显示'))),
        !petItems.length?h('p',{className:'lp-detail'},'还没有桌宠，启动后添加第一位伙伴。'):null,
        h('button',{className:'lp-add',type:'button',disabled:!running||Boolean(acting),onClick:()=>void managePet('create',null,{name:'新桌宠'})},'＋ 新增桌宠')),
      h('div',{className:'lp-card'},h('h3',null,'会话偏好'),
        row('autoStart','自动启动桌宠','DSH 运行时自动唤起桌宠；关闭后，已运行的桌宠会继续保留。',true),
        row('includeSubagents','显示子 Agent','将子 Agent 的会话状态一起交给桌宠监控。',false),
        h('button',{className:'lp-reset',type:'button',disabled,onClick:()=>void reset()},'恢复继承配置')),
      h('p',{className:'lp-footnote'},'右键桌宠可打开快捷控制。更多形象、显示与跟随设置，均可在工作台中调整。'),
      h('p',{role:'status','aria-live':'polite',className:'lp-message'},busy?'正在保存…':message));
  }
  return {inject:['slots','configForms'],apply(ctx){
    const form=ctx.configForms.get(namespace);
    ctx.effect(()=>ctx.configForms.whileServed([namespace],()=>ctx.slots.inject('settings.section',()=>ctx.slots.register({name:'settings.section',id:'board-ai-pet',order:75,label:()=> '桌宠',inject:()=>({form})},PetSettings))));
  }};
}});
