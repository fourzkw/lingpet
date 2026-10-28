# 创作项目、版本与恢复

项目记录由可用的插件工具保存；宿主允许本地文件时也可写入独立项目目录。相对路径或资源 ID 必须能解析到真实产物，不把聊天正文当作唯一进度记录。

## 最少需要保存

| 记录 | 必需内容 |
|---|---|
| 项目 | ID、目标角色/形象、用户需求、当前阶段、状态 |
| 参考素材 | 文件/资源 ID、身份/风格/姿势用途、内容哈希 |
| 形象版本 | 候选 ID、父版本、实际提示词、模型/后端、输出、选定状态 |
| 用户反馈 | 原意、结构化约束、适用版本；不要把局部反馈改成全局默认 |
| 角色分析与动作方案 | 可见特征/明确设定/创作推断、各状态动作及道具、分镜时间、目标与实际时长、帧数、持续段与循环策略 |
| 工作流 | 实际 API JSON 或可解析版本 ID、节点/模型绑定、最终参数 |
| 任务 | 任务 ID、项目所有权、输入形象版本及哈希、动作、状态、时间、错误、输出 |
| 后处理 | 尺寸、色板、透明度、裁切/对齐、时序、循环点、局部合成范围 |
| 验证与接入 | 实际检查结果、导出清单、导入/激活状态、旧配置保留情况 |

固定随机种子和工作流有助于追踪，不保证不同硬件、模型版本或运行环境产生完全相同像素。

## 建议目录

```text
project/
  project.json
  references/
  candidates/
  prompts/
  workflows/
  jobs/
  videos/
  previews/
  export/
```

只创建实际需要的目录。不要将认证凭证、机器私有绝对路径或大型模型复制到可分享项目中；后端连接使用宿主配置 ID。

以下是基础图阶段的记录示例，不是可直接提交的生成请求：

```json
{
  "recordVersion": 1,
  "projectId": "pet-example-01",
  "target": {"characterId": "custom-character", "appearanceId": "reference-v1"},
  "brief": {
    "identity": "用户参考图定义的角色",
    "style": "用户指定的 Q 版插画",
    "constraints": [],
    "requestedVariants": ["original", "pixel"]
  },
  "phase": "base-image",
  "status": "draft",
  "selectedBaseVersion": null,
  "references": [],
  "baseVersions": [],
  "jobs": [],
  "artifacts": [],
  "validation": [],
  "imported": false,
  "activated": false
}
```

记录版本是本 Skill 的建议格式，不代表当前插件已实现该项目 API。接入真实工具时使用其实际结构，并保留上表信息。

当前 `board_pet_project update` 接受 `brief` 和 `constraints`，没有独立的动作方案字段。可将带状态标题的动作方案保存到 `brief`，保留原需求文本；角色约束放入 `constraints`，更新时保留已有条目。不要向严格输入接口传入不存在的 `actionPlan` 字段。实际生成请求的 `prompt/frames` 由任务记录保存；基础图改变时复核动作方案中的比例、道具布局和循环假设。

## 停止与恢复

阶段可采用 `brief → base-image → base-review → sample-video → sample-review → actions → processing → validation → export → import`。状态另存 `draft / queued / running / succeeded / failed / stopped`，不要用“已完成”同时代表阶段结束和整个创作结束。

用户叫停时记录 `stopped`、已完成文件、取消结果和剩余动作。用户随后只询问流程时保留停止状态。

用户明确恢复后：读取项目和用户最新约束；确认选定基础图的哈希；查询仍可能存在的旧任务；确认产物确实属于该版本。只跳过已成功且文件可读的匹配任务。缺失、失败或旧基础图的产物不能靠文件名判定完成。

基础图或核心参数改变时建立新修订并记录依赖失效范围。保留旧结果用于对比，不覆盖不相关形象或用户原有桌宠配置。
