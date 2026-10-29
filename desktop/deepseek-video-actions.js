import {optionalVideo} from './optional-video.js';
const player=optionalVideo(new URL('../assets/deepseek-h3/actions-v1/',import.meta.url));
export const readyDeepseekVideoState=player.readyState;
export const paintDeepseekVideo=player.paint;
