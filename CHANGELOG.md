# 更新日志

## 0.1.0（2026-09-21）

首个版本。

- 继承 `CustomEditor` 的无边框 block 输入框：上下各一空行、整行背景、左右留白。
- 背景默认跟随主题 `userMessageBg`，可配置 `theme` / `#RRGGBB` / 256 色号。
- `/block-editor on|off|reset` 命令，启停状态按会话分支保存。
- 仅 TUI 模式安装；工厂所有权检查，不覆盖/不恢复其他自定义编辑器。
- 保留补全菜单、历史、kill/yank、粘贴折叠、图片快捷键与 `CURSOR_MARKER`。
- 对照真实 `CustomEditor` 的单元测试与真实 Pi TUI 冒烟（普通/fullscreen/与 pi-hud 同用）。

已核对 Pi 0.85.1；详见 [docs/verification.md](docs/verification.md)。
