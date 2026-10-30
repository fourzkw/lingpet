export const videoVendors=[
 {id:'seedance',name:'Seedance · 火山方舟',url:'https://ark.cn-beijing.volces.com/api/v3',protocols:[['seedance','Seedance']],modelHint:'Seedance 模型或接入点 ID'},
 {id:'minimax',name:'MiniMax · 海螺',url:'https://api.minimax.io',protocols:[['minimax-h3','MiniMax H3（v2）'],['minimax-hailuo','MiniMax Hailuo（v1）']],modelHint:'MiniMax 视频模型 ID'},
 {id:'grok',name:'Grok · xAI',url:'https://api.x.ai/v1',protocols:[['grok-video','Grok Imagine Video']],modelHint:'Grok 视频模型 ID'},
 {id:'gemini',name:'Gemini · Google',url:'https://generativelanguage.googleapis.com/v1beta',protocols:[['gemini-interactions','Gemini Omni · Interactions']],modelHint:'Gemini 视频模型 ID'},
];
export const videoProtocols=videoVendors.flatMap(v=>v.protocols.map(([id])=>id));
export const videoVendor=id=>videoVendors.find(v=>v.id===id);
export const videoReady=value=>Boolean(value?.url&&value?.model&&videoProtocols.includes(value.protocol));
