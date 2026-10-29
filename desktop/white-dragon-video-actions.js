import {optionalVideo} from './optional-video.js';
const player=optionalVideo(new URL('../assets/chatgpt-white-dragon-h3/actions-v1/',import.meta.url));
export const readyWhiteDragonVideoState=player.readyState;
export const paintWhiteDragonVideo=player.paint;
