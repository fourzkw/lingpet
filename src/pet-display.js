export const PET_SCALES=Object.freeze([.5,.625,.75,.875,1,1.125,1.25,1.375,1.5]);
export function scaleStep(scale=1){return Math.max(0,Math.min(8,Math.round((scale-.5)/.125)));}
export function normalizePetScale(scale){return PET_SCALES[scaleStep(scale)];}
export function scaleLabel(scale){return `${scale*100}%${scale===1?' · 正常':''}`;}

// Older integrations may still write enabled=false. Present that as hidden;
// showing the pet clears both legacy conditions in one action.
export function petIsVisible(pet){return pet?.enabled!==false&&pet?.petVisible!==false;}
export function visibilityPatch(visible){return {enabled:true,petVisible:Boolean(visible)};}
