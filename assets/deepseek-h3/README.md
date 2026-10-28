# DeepSeek 鲸鱼娘 H3

以用户确认的透明 Q 版形象为唯一人物输入，MiniMax H3 生成八种动作；384×384、124帧、24fps、20步。每种动作单独保存源视频与工作流于 output/video/deepseek-h3-v1。

原图版384px、像素版192px，按时间戳约12fps采样，跨动作共用64色色板。像素采用二值透明度，原图保留平滑边缘；两版构图与动作时序一致。思考/工作/批准/休眠从持续段循环，完成/异常单次播放。

默认 deepseek/whale 使用这套资源，含原图和像素版本。旧版完整素材保留在 assets/deepseek，角色下可选择 whale-classic 恢复旧像素形象。provenance.json 记录输入、视频、模型和旧资源哈希。
