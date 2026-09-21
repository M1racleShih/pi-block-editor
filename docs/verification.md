# 实现核对与验证

## 核对基线

本机 `pi --version`：**0.85.1**，Node **24.18.0**，Linux + tmux。开发依赖锁定相同 Pi/TUI 版本。没有修改 Pi 或相邻 pi-hud。

实施前完整阅读本机 Pi 的：

- `docs/extensions.md`、`docs/tui.md`
- 相关 `docs/themes.md`、`docs/packages.md`、`docs/keybindings.md`
- `examples/extensions/modal-editor.ts`、`rainbow-editor.ts`
- 验证阶段另读 `docs/environment-variables.md`、`docs/terminal-setup.md`

检查的是已安装包的实际 JS 和类型声明，不依赖示例对布局的假设：

| 实现 | 与设计相关的行为 |
| --- | --- |
| pi-tui `dist/components/editor.js` / `.d.ts` | `renderTopBorder`、`renderBottomBorder` 为 protected；输入可见行夹在两者之间，补全追加在后；padding 参与换行与鼠标命中；聚焦时补全打开也发出 `CURSOR_MARKER` |
| coding-agent `dist/modes/interactive/components/custom-editor.js` | 应用快捷键、图片粘贴回调由父类处理；默认不嵌入 working spinner |
| coding-agent `dist/modes/interactive/interactive-mode.js` | `getEditorComponent` 返回当前工厂身份；安装复制文本、回调、padding、补全设置；不复制内部历史/撤销/粘贴映射；UI reset 恢复默认工厂 |
| coding-agent `dist/modes/interactive/theme/theme.js` | `getBgAnsi` 可取当前主题背景；主题 reset/invalidate 需避免旧色缓存 |

因此不采用示例里的“最后一行是边框”假设；也不复制原生 `render()`、不探读编辑器私有字段。

## 自动化测试

`npm run verify`：TypeScript 检查 + Node 测试。

- 与真实 `CustomEditor` 对比，宽度 4/10/40/80 下空输入、中文、emoji、组合字符、横线文本、长行、多行及 PageUp/PageDown 的内容、行数和光标状态。
- 真实补全 provider，超过一页的选项：菜单区域（含末尾滚动信息）与原生逐字节相同，菜单打开时光标标记保留，Tab 行为相同。
- 历史浏览、kill/yank、折叠粘贴展开、图片快捷键回调。
- 深浅背景切换、reset 后重新铺色、配置校验。
- 工厂身份保护、幂等启停/清理、RPC / print / JSON 不写编辑器。

## 实际 TUI 验证（已执行）

以下均为安装版 Pi 的真实交互进程，不是模拟编辑器：

```text
python3 scripts/tui-smoke.py                         PASS
python3 scripts/tui-smoke.py --fullscreen            PASS
python3 scripts/tui-smoke.py --hud ../pi-hud/index.ts PASS
```

每轮使用临时 `PI_CODING_AGENT_DIR`，不读取真实用户配置，开启 offline，不发送模型请求。使用测试 fixture 通过公开 UI API 切主题、填充多行以及模拟第三方编辑器。

覆盖：

1. 自动启用，背景存在，空行边界。
2. 输入 `中文🙂`，tmux 硬件光标列为 **7**（1 列留白 + 6 列文本）；这不是 IME 候选窗测试。
3. `/block-editor ` 补全显示 on/off/reset，菜单不被背景框裁掉。
4. 40 行输入显示尾部窗口，90×28 → 45×20 后继续渲染。
5. off 恢复原生横线；off 后 reload 仍为原生；on 后 reload 仍为 block。
6. 运行中 light/dark 切换；不是只测启动配置。
7. `/new` 后重新安装。
8. 外来 `FOREIGN-EDITOR` 工厂安装后，本插件的 on/reset 均不覆盖它。
9. Ctrl+D 正常退出；测试自行清理 tmux server。

本次生成的捕获文件在 `artifacts/{regular,fullscreen,hud}/`，每轮包含 01–14 的 ANSI 屏幕捕获及 `cursor.txt`。它们是本地证据，不是截图，不加入 npm 包。测试脚本可重复生成。

开发过程中修正了冒烟脚本的两个时序问题：原生 Enter 在补全打开时先接受选项，因此命令提交前先 Escape；`setEditorText` 后用一次原生按键触发捕获前的重绘。没有为此修改产品输入逻辑。

## 尚未验证 / 已知边界

- **未验证桌面中文 IME 候选窗**（fcitx/ibus、macOS、Windows）：已验证标记和终端光标位置，但没有真实桌面输入法环境。
- **未验证真实剪贴板图片、终端图片协议及发送模型链路**：只验证父类图片快捷键回调，未宣称端到端图片通过。
- 实际 TUI 没有调用模型，未覆盖生成中 abort / follow-up / 模型切换等完整工作流；保留原生回调并不等于这些流程已经端到端验证。
- `/resume`、`/fork` 生命周期依据文档/实现处理，未做实际 TUI 回归；已实际测试 `/reload`、`/new`、退出。
- fullscreen 的键盘流程已验证；真实鼠标点击、拖选、滚轮待人工测试。
- 未验证 SSH、多种 GUI 终端、256 色真实设备、系统明暗自动切换；只验证主动切换 Pi 主题。
- 未验证宽度小于 4 列的退化终端；沿用原生宽字符布局限制。
- 恢复/重装无法无损迁移原生实例私有状态，详见 README。不是任意编辑器的组合器。
- 自定义主题/固定颜色与用户终端底色的实际视觉对比度需人工调整。未声称还原任何 Codex CLI 界面。

## 人工验收建议

在日常使用的真实终端中：开启中文输入法并移动候选窗；在补全打开、长行折行和滚动后输入；Ctrl+V 粘贴一张图片并发送；粘贴大段内容后启停；输入历史、undo、kill/yank；切换系统主题；与个人其他编辑器插件分别调整加载顺序。遇到原生同样存在的问题，应先关闭本插件对照。
