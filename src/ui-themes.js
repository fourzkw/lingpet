export const UI_THEMES=[
  {id:'paper-journal',name:'纸感手账',description:'暖纸、墨色与朱砂，像翻开一本手账。',background:'#F7F1E4',swatches:['#F7F1E4','#2B241C','#B4472F','#4F6E4B']},
  {id:'pixel-workshop',name:'像素工坊',description:'硬边、像素刻度与琥珀色，桌面的像素小工坊。',background:'#0a0a10',swatches:['#0a0a10','#ffa63d','#f2ead8','#59c9d6']},
  {id:'warm-night',name:'暖光夜桌',description:'柔和暖光与深色桌面，陪你安静工作。',background:'#0b0908',swatches:['#0b0908','#f0a860','#f6efe6','#9ccfae']},
  {id:'terminal-pulse',name:'终端脉动',description:'深绿、等宽状态与清晰线条，专注会话进展。',background:'#070A09',swatches:['#070A09','#54F0A6','#D8E2DB','#4FD8E8']},
];
export const DEFAULT_THEME='paper-journal';
export const normalizeTheme=value=>UI_THEMES.some(theme=>theme.id===value)?value:DEFAULT_THEME;
export function requireTheme(value){if(!UI_THEMES.some(theme=>theme.id===value))throw new Error('请选择有效的界面主题');return value;}
