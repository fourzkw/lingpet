// Runs before styles and asynchronous asset loading, so a saved dark theme never flashes paper white.
(()=>{const ids=['paper-journal','pixel-workshop','warm-night','terminal-pulse'];let theme=new URLSearchParams(location.search).get('theme');try{theme=sessionStorage.getItem('lingpet.theme')||theme;}catch{}document.documentElement.dataset.theme=ids.includes(theme)?theme:'paper-journal';})();
