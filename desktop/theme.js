import {normalizeTheme} from '../src/ui-themes.js';
export function applyTheme(value){const theme=normalizeTheme(value);document.documentElement.dataset.theme=theme;try{sessionStorage.setItem('lingpet.theme',theme);}catch{}}
