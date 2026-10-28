// Apply before CSS is parsed to avoid flashing the wrong theme between pages.
(()=>{
 const ids=['paper-journal','pixel-workshop','warm-night','terminal-pulse'];
 const read=()=>{try{const id=localStorage.getItem('lingpet.website.theme');return ids.includes(id)?id:ids[0];}catch{return ids[0];}};
 const apply=id=>{document.documentElement.dataset.theme=id;const select=document.getElementById('siteTheme');if(select)select.value=id;};
 apply(read());
 document.addEventListener('DOMContentLoaded',()=>{const select=document.getElementById('siteTheme');if(select){select.value=read();select.addEventListener('change',()=>{const id=ids.includes(select.value)?select.value:ids[0];apply(id);try{localStorage.setItem('lingpet.website.theme',id);}catch{}});}});
 window.addEventListener('storage',event=>{if(event.key==='lingpet.website.theme')apply(read());});
})();
