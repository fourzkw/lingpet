// Model bindings from the local Qwen Image 2.1 / MiniMax H3 setup.
// Keep machine-specific Python paths and advanced switches out of shared defaults.
export const DEFAULT_COMFY_MODELS=Object.freeze({
 qwenModel:'qwen_image_2.1_int8_convrot.safetensors',
 qwenClip:'qwen3vl_8b_int8_convrot.safetensors',
 qwenVae:'qwen_image_2.1_vae_bf16.safetensors',
 h3Model:'minimax_h3_fl2va_pruned_int8_convrot.safetensors',
 h3Clip:'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',
 h3Vae:'minimax_h3_video_vae_fp16.safetensors',
});
