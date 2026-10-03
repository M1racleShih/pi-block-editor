# 更新日志

## 未发布

- 适配 Pi 0.87.1：开发依赖升级到 `@earendil-works` 0.87.1；欢迎页/资源适配层版本门从单一 0.85.1 改为已验证版本集合（0.85.1、0.87.1），新增 0.87.1 适配层往返测试。逐项核对 0.86–0.87 变更：编辑器边框钩子、pi-tui `Editor.render()` 流程、编辑器工厂与扩展 API 均兼容；未启用 `embedWorkingStatus`，状态 spinner 降级为独立渲染，行为与 0.85 一致。
- 新会话首页 Logo 改为三色色块 π（珊瑚红 #F09082 / 蓝 #4D9ABF / 金黄 #F1BE58 平涂，16×8，字形与配色转录自参考图），Logo、「Initial prompt」信息行与帮助文字整体居中（长行先换行再逐行居中）；窄于 40 列或低于 24 行的终端退化为单行 `π`。
- 新会话首页的折叠资源列表：Skills 与 Extensions 一样用「标题 · 数量 + 最多三列网格」展示；Ctrl+O 展开仍显示原生完整路径。技能名本身简短，不做包名缩短。
- 适配 Pi 1.0.0：修复升级到 1.0.0 后 Extensions / Skills 等启动资源列表不再居中的问题。适配层版本门纳入 1.0.0（内部可展开组件结构逐项核对未变）；原生帮助复用的 Logo 裁剪从固定 0.99.1 改为按字形探测（`stripNativeLogo`），兼容 Apple Terminal 文本字标回退；开发依赖升级到 1.0.0，编辑器冒烟脚本不再硬编码主题调色板。

## 0.1.0（2026-09-21）

首个版本。

- 继承 `CustomEditor` 的无边框 block 输入框：上下各一空行、整行背景、左右留白。
- 背景默认跟随主题 `userMessageBg`，可配置 `theme` / `#RRGGBB` / 256 色号。
- `/block-editor on|off|reset` 命令，启停状态按会话分支保存。
- 仅 TUI 模式安装；工厂所有权检查，不覆盖/不恢复其他自定义编辑器。
- 保留补全菜单、历史、kill/yank、粘贴折叠、图片快捷键与 `CURSOR_MARKER`。
- 对照真实 `CustomEditor` 的单元测试与真实 Pi TUI 冒烟（普通/fullscreen/与 pi-hud 同用）。

已核对 Pi 0.85.1；详见 [docs/verification.md](docs/verification.md)。
