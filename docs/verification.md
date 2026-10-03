# 实现核对与验证

## 核对基线

本机 `pi --version`：**1.0.0**（经 0.85.1 → 0.87.1 → 0.99.1 → 1.0.0 升级适配），Node **24.18.0**，Linux + tmux。开发依赖锁定相同 Pi/TUI 版本（1.0.0）。没有修改 Pi 或相邻 pi-hud。

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

## 新会话首页验证

新增 `src/welcome.ts`（渐变字标、初始估算、生命周期）和 `src/startup-resources.ts`（原生资源展示适配层，限已验证 Pi 版本 0.85.1 / 0.87.1 / 0.99.1 / 1.0.0），通过 `setHeader` 接入，不修改 Pi 安装文件。

- `tests/welcome.test.ts` 覆盖估算口径、渐变/纯文本、窄屏裁剪、扩展简称冲突、技能名不缩短、完整路径展开、诊断保留、适配层恢复、原生帮助复用、提交收起、resume/fork/已有消息不显示、非 TUI 不操作。
- `python3 scripts/welcome-smoke.py` 和 `python3 scripts/welcome-smoke.py --fullscreen` 均通过。真实终端检查首页 token/Logo、输入时保留、Ctrl+O 完整帮助/路径及折叠网格（含临时 agent 目录注入的两个真实技能 fixture）、36 列窄屏、`! true` 后收起、`/new` 恢复。窄屏检查高度 36 行：新增 Skills 区块多占 4 行，30 行视口会把欢迎字标顶出屏幕，属原生滚动行为。
- 编辑器原有 regular/fullscreen 冒烟脚本再次通过。
- 首页 ANSI 捕获在 `artifacts/welcome-{regular,fullscreen}/`；不是桌面截图，不包含用户配置或模型调用。
- Token 为启发式本地估算，不是精确 tokenizer 计数；未对照真实 provider 的请求用量。
- Extensions / Skills 的精简显示依赖已验证版本（0.85.1 / 0.87.1 / 0.99.1 / 1.0.0，`src/startup-resources.ts` 的 `VERIFIED_PI_VERSIONS`）内部可展开组件结构，并非公开资源 API；形状/版本不符时保留原生列表。原生帮助复用同样限定这些版本。0.86–0.87 的升级核对见下方「0.87.1 升级核对」。折叠列表解析依赖 Pi 对技能名（小写 a-z、0-9、连字符）的校验，名称内不会出现 `, ` 分隔符。

## 0.87.1 升级核对

对照 0.85.1 → 0.87.1（含 0.86.0/0.86.1/0.87.0/0.87.1）CHANGELOG 与发布产物逐项核对：

- `CustomEditor` 边框钩子 `renderTopBorder`/`renderBottomBorder` 签名未变；`CustomEditorOptions` 仅语义扩展（`embedWorkingStatus` 现涵盖 working/compaction/summarization/retry），本插件未启用，spinner 降级到 `statusContainer` 独立渲染，与 0.85 行为一致。
- pi-tui `components/editor.d.ts` 逐字相同，`render()` 流程（边框标记、补全行在底边框之后）不变；导出仅新增 `getNativeClipboard`。
- `getEditorComponent`/`setEditorComponent`、`session_start`/`session_shutdown`、`registerCommand`、`appendEntry`、`getBranch`、`notify`、`theme`、`getToolsExpanded`、`setHeader`、`keyText`、`VERSION`、`getAgentDir` 全部存在；`pi.on()` 新增返回取消订阅函数，向后兼容。
- 0.86/0.87 全部 breaking changes（`shouldStopAfterTurn` 移除、`SessionEntry`/`ContextEditEntry`、`TurnEndEvent` 形状、`user_bash` fail-closed、pi-ai `Context`→`TranscriptContext`）均不涉及本插件 API 面。
- 0.87.1 `showLoadedResources` 仍使用 `sectionHeader` = `[Name]` 的 `ExpandableText` 折叠段，`builtInHeader` 仍含「Pi can explain its own features」，与适配层探测字符串同构；版本门由单一字符串改为 `VERIFIED_PI_VERSIONS` 集合 {0.85.1, 0.87.1}，新增 0.87.1 的适配层往返测试。

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

## Pi 0.99.1 升级核对

- 开发宿主及 TUI 依赖升级到 0.99.1；类型检查与 30 项测试通过。
- 新版 ExpandableText 不再暴露文本 getters，使用 ThemedText.build 与 state.expanded；适配层同步读取两种视图并在 finally 恢复状态，不触发展开或渲染副作用。
- 新版原生启动 Header 为两行小 Logo；复用帮助时移除 Logo 与版本，保留首条快捷键。
- Extensions / Skills 标题独立居中，网格作为整体居中，保留列对齐；展开路径、其他资源与诊断不改动。
- 真实 Pi 0.99.1 的 regular / fullscreen tmux smoke：折叠、Ctrl+O 展开还原、输入中文、窄屏、bash 提交及 /new；隔离配置、无凭据、无模型请求。证据位于 artifacts/welcome-{regular,fullscreen}/。

## Pi 1.0.0 升级核对

症状：升级到 Pi 1.0.0 后新会话首页的 Extensions / Skills 等启动资源列表不再居中——适配层版本门未含 1.0.0，回落到原生左对齐紧凑列表；原生帮助复用的 Logo 裁剪也硬编码在 0.99.1。

- 开发宿主及 TUI 依赖升级到 1.0.0；类型检查与 32 项测试通过。
- 结构核对：`ExpandableText`（ThemedText.build + state.expanded）未变；`showLoadedResources` 仅 showListing 条件改为 `shouldShowStartupDetails()`，`[Name]` 折叠段与 `", "` 紧凑列表同构；`builtInHeader` 仍为两行半块 Logo + 版本 + 快捷键，onboarding 行同文；`piLogoLines` 字形未变，新增 `supportsPiLogo`/`piWordmark` 文本回退（Apple Terminal）。
- 修复：`VERIFIED_PI_VERSIONS` 纳入 1.0.0；帮助复用的 Logo 裁剪改为字形探测（`src/welcome.ts` 的 `stripNativeLogo`）——行首为半块 Logo 底行 `█▀ █` 时裁去 5 列，否则原样保留（文本字标回退时提示行本就从行首开始，不再误裁）。
- `scripts/tui-smoke.py` 的方块背景断言不再硬编码旧调色板（Pi 1.0.0 dark 主题 `userMessageBg` 由 #343541 改为蓝调 #213B49），改为首屏记录实际背景色并断言切换主题后随之改变。
- 真实 Pi 1.0.0 的四组 tmux smoke 全部通过：welcome regular/fullscreen（居中网格、Ctrl+O 展开还原、窄屏、提交收起、/new）与编辑器 regular/fullscreen（CJK 光标、补全、滚动、缩放、off/on、reload、明暗主题、工厂归属）。隔离配置、无凭据、无模型请求。证据位于 artifacts/。
- 仍适用的边界：1.0.0 未验证桌面中文 IME 候选窗、真实鼠标与剪贴板图片；`quietStartup: true` 时本插件欢迎页仍显示，与此前行为一致。
