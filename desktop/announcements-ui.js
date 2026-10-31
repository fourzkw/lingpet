const TAGS={info:'普通',important:'重要',critical:'紧急'};
const GLYPHS={info:'i',important:'!',critical:'!'};

function stamp(value){
  const date=value?new Date(value):null;
  if(!date||Number.isNaN(date.getTime()))return '';
  const pad=n=>String(n).padStart(2,'0');
  return (date.getMonth()+1)+'月'+date.getDate()+'日 '+pad(date.getHours())+':'+pad(date.getMinutes());
}

export function initAnnouncements({toast}={}){
  const host=document.createElement('section');
  host.id='announcementBanner';host.className='announcement-banner';host.hidden=true;
  host.setAttribute('role','region');host.setAttribute('aria-label','应用公告');host.setAttribute('aria-live','polite');
  host.innerHTML='<span class="announcement-banner-rail" aria-hidden="true"></span>'+
    '<span class="announcement-banner-glyph" aria-hidden="true"></span>'+
    '<div class="announcement-banner-copy">'+
      '<div class="announcement-banner-meta"><span class="announcement-chip" id="announcementBannerLevel"></span>'+
      '<span class="announcement-banner-count" id="announcementBannerCount"></span>'+
      '<span class="announcement-banner-time" id="announcementBannerTime"></span></div>'+
      '<strong class="announcement-banner-title" id="announcementBannerTitle"></strong>'+
      '<p class="announcement-banner-body" id="announcementBannerBody"></p>'+
    '</div>'+
    '<div class="announcement-banner-actions">'+
      '<button type="button" class="text-button" id="announcementBannerDismiss">知道了</button>'+
      '<button type="button" class="button primary compact" id="announcementBannerOpen">查看公告</button>'+
    '</div>';
  const glyph=host.querySelector('.announcement-banner-glyph');
  const bannerLevel=host.querySelector('#announcementBannerLevel');
  const bannerCount=host.querySelector('#announcementBannerCount');
  const bannerTime=host.querySelector('#announcementBannerTime');
  const bannerTitle=host.querySelector('#announcementBannerTitle');
  const bannerBody=host.querySelector('#announcementBannerBody');
  const bannerOpen=host.querySelector('#announcementBannerOpen');
  const bannerDismiss=host.querySelector('#announcementBannerDismiss');

  const dialog=document.createElement('dialog');
  dialog.id='announcementDialog';dialog.className='announcement-dialog';
  dialog.innerHTML='<div class="announcement-dialog-sheet">'+
    '<header class="announcement-dialog-head"><div class="announcement-dialog-tags">'+
      '<span class="announcement-chip" id="announcementLevel"></span>'+
      '<span class="announcement-dialog-time" id="announcementTime"></span></div>'+
      '<button type="button" class="announcement-dialog-close" id="announcementClose" aria-label="关闭公告">×</button>'+
    '</header>'+
    '<h2 class="announcement-dialog-title" id="announcementTitle"></h2>'+
    '<div class="announcement-dialog-body" id="announcementBody"></div>'+
    '<footer class="announcement-dialog-foot"><p class="announcement-dialog-hint" id="announcementHint"></p>'+
      '<div class="dialog-actions"><button type="button" class="button secondary compact" id="announcementLink" hidden></button>'+
      '<button type="button" class="button primary" id="announcementDismiss">我知道了</button></div></footer>'+
    '</div>';
  const closeButton=dialog.querySelector('#announcementClose');
  const levelChip=dialog.querySelector('#announcementLevel');
  const timeLabel=dialog.querySelector('#announcementTime');
  const titleNode=dialog.querySelector('#announcementTitle');
  const bodyNode=dialog.querySelector('#announcementBody');
  const hintNode=dialog.querySelector('#announcementHint');
  const linkButton=dialog.querySelector('#announcementLink');
  const dismissButton=dialog.querySelector('#announcementDismiss');

  const main=document.querySelector('main');
  if(main){main.prepend(host);document.body.append(dialog);}
  let items=[],current=null,loading=false;

  function unreadForce(){return items.filter(item=>item.forceShow&&!item.read);}
  function unreadItems(){return items.filter(item=>!item.read);}

  function renderBanner(){
    const list=unreadItems(),item=list[0];
    if(!item||dialog.open){host.hidden=true;return;}
    host.dataset.level=item.level;
    glyph.textContent=GLYPHS[item.level]||'i';
    bannerLevel.textContent=TAGS[item.level]||'通知';
    bannerCount.textContent=list.length>1?'还有 '+(list.length-1)+' 条未读':'';
    bannerTime.textContent=stamp(item.updatedAt)?'· '+stamp(item.updatedAt):'';
    bannerTitle.textContent=item.title;
    bannerBody.textContent=String(item.body||'').replace(/\s+/g,' ').trim();
    host.hidden=false;
  }

  function show(item){
    current=item;
    dialog.dataset.level=item.level;
    levelChip.textContent=TAGS[item.level]||'通知';
    timeLabel.textContent=stamp(item.updatedAt)?'更新于 '+stamp(item.updatedAt):'';
    titleNode.textContent=item.title;
    bodyNode.textContent=item.body;
    hintNode.textContent=item.forceShow?'请确认已阅读后继续使用':'确认后不再重复提醒';
    linkButton.hidden=!item.link;
    linkButton.textContent=(item.linkLabel||'了解详情')+' ↗';
    closeButton.hidden=!!item.forceShow;
    if(!dialog.open)dialog.showModal();
    renderBanner();
  }

  async function mark(item){
    try{
      await window.pet.market({action:'announcement-read',id:item.id});
      item.read=true;
      if(current?.id===item.id&&dialog.open)dialog.close();
      const next=unreadForce()[0];
      if(next)show(next);else renderBanner();
    }catch(error){toast?.(error.message);}
  }

  function closeDialog(){
    if(current?.forceShow&&!current.read)return;
    if(dialog.open)dialog.close();
    current=null;renderBanner();
  }

  bannerOpen.onclick=()=>{const item=unreadItems()[0];if(item)show(item);};
  bannerDismiss.onclick=()=>{
    const item=unreadItems()[0];
    if(!item)return;
    if(item.forceShow){show(item);return;}
    void mark(item);
  };
  dismissButton.onclick=()=>{if(current)void mark(current);};
  closeButton.onclick=closeDialog;
  linkButton.onclick=async()=>{
    if(!current?.link)return;
    try{await window.pet.market({action:'announcement-link',id:current.id});}catch(error){toast?.(error.message);}
  };
  dialog.addEventListener('cancel',event=>{
    if(current?.forceShow&&!current.read){event.preventDefault();return;}
    current=null;renderBanner();
  });

  async function refresh(){
    if(loading)return;loading=true;
    try{
      const result=await window.pet.market({action:'announcements'});
      items=result.items||[];
      const forced=unreadForce()[0];
      if(forced)show(forced);else renderBanner();
    }catch{items=[];renderBanner();}
    finally{loading=false;}
  }

  void refresh();
  document.addEventListener('lingpet:navigate',()=>renderBanner());
  return {refresh,render:renderBanner};
}
