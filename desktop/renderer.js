import {paintPixelPet} from './pixel-pet.js';
import {appearanceInfo} from '../src/characters.js';
import {paintDragonAction} from './dragon-actions.js';
import {paintOriginalAction} from './original-actions.js';
import {isQVideoAsset,paintQVideoAction} from './q-video-actions.js';
import {syncCustomAppearances,paintCustomAppearance} from './custom-appearances.js';
import {paintDeepseekVideo} from './deepseek-video-actions.js';
import {paintWhiteDragonVideo} from './white-dragon-video-actions.js';
import {paintInteraction} from './interaction-actions.js';
export const ORDER=['idle','thinking','working','input','approval','done','error','sleep'];

export function paint(ctx,{settings,current,customAppearances,customCharacters,bundledAssets,animationKey,interaction},elapsed,width,height){
  if(customAppearances)syncCustomAppearances(customAppearances,customCharacters,bundledAssets);
  ctx.clearRect(0,0,width,height);
  const state=ORDER.includes(current.state)?current.state:'idle';
  const disabled=current.state==='offline';
  ctx.save();ctx.globalAlpha=disabled?0.55:1;
  const skin=appearanceInfo(settings),original=settings.variant==='original'&&skin.variants.includes('original');
  if(interaction&&paintInteraction(ctx,skin.asset,interaction,elapsed,width,height,original?'original':'pixel',animationKey)){}
  else if(paintCustomAppearance(ctx,skin.asset,state,elapsed,width,height,original?'original':'pixel',animationKey)){}
  else if(skin.asset==='deepseek-h3')paintDeepseekVideo(ctx,state,elapsed,width,height,original?'original':'pixel');
  else if(skin.asset==='chatgpt-white-dragon-h3')paintWhiteDragonVideo(ctx,state,elapsed,width,height,original?'original':'pixel');
  else if(isQVideoAsset(skin.asset))paintQVideoAction(ctx,skin.asset,state,elapsed,width,height,original?'original':'pixel');
  else if(original&&skin.asset==='chatgpt-dragon')paintDragonAction(ctx,state,elapsed,width,height,'original');
  else if(!original||!paintOriginalAction(ctx,skin.asset,state,elapsed,width,height))paintPixelPet(ctx,skin.asset,state,elapsed,width,height);
  ctx.restore();
}

export function frameLoop(callback){let last=0;function tick(now){if(now-last>32){last=now;callback(now);}requestAnimationFrame(tick);}requestAnimationFrame(tick);}
