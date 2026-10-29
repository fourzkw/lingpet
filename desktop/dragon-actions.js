import {optionalVideo} from './optional-video.js';
const player=optionalVideo(new URL('../assets/chatgpt-dragon/actions-v1/',import.meta.url));
export const readyDragonState=player.readyState;
export const paintDragonAction=player.paint;
export const readyDragonActions=()=>player.readyState('idle');
