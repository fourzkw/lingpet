const pages={pets:'petView',market:'marketView',app:'appView',integrations:'integrationsView'};
const buttons={pets:'showMyPets',market:'openMarket',app:'openAppSettings',integrations:'openIntegrations'};
export function navigate(page){
  if(!pages[page])return;
  for(const [key,id] of Object.entries(pages)){const view=document.getElementById(id);if(view)view.hidden=key!==page;const button=document.getElementById(buttons[key]);button?.classList.toggle('selected',key===page);button?.setAttribute('aria-pressed',String(key===page));}
  document.querySelector('.pet-more')?.removeAttribute('open');
  if(document.body.dataset.page!==page){document.body.dataset.page=page;window.scrollTo(0,0);document.dispatchEvent(new CustomEvent('lingpet:navigate',{detail:page}));}
}
