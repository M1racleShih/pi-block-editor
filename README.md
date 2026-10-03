# pi-block-editor

A lightweight Pi extension that turns the stock two-line editor into a borderless block with its own background color. Extends the native `CustomEditor`, keeps all native editing behavior, and installs only in TUI mode. [中文说明在此。](#安装)

独立、轻量的 Pi 输入框插件：将原生上下横线变成有背景色的无边框 block，并为新会话提供简洁居中的三色色块 π 欢迎区。无动画、无轮询、无额外状态栏，不修改 Pi 安装文件，不依赖 pi-hud。

## 安装

```bash
# npm（推荐）
pi install npm:pi-block-editor

# 或 GitHub
pi install git:github.com/M1racleShih/pi-block-editor

# 或仅试用（不写入配置）
pi -e /path/to/pi-block-editor/index.ts
```

安装后重启 Pi，或执行 `/reload`。仅 `ctx.mode === "tui"` 时安装，RPC / print / JSON 不操作编辑器。

## 使用

```text
/block-editor on       启用；有其他编辑器时拒绝覆盖
/block-editor off      停用；仅当本插件仍拥有编辑器时恢复原生
/block-editor reset    与 off 相同，不强制重置别人的编辑器
```

默认自动启用。启停选择作为本插件的 custom entry 保存在当前会话分支中，reload / resume 后恢复；新会话采用配置默认值，fork 继承所处分支的选择。命令不触发模型调用。

### 新会话首页

- 珊瑚红 `#F09082` / 蓝 `#4D9ABF` / 金黄 `#F1BE58` 三色平涂色块 π（16×8）；Logo、「Initial prompt」信息行与帮助文字整体居中（长行先换行再逐行居中）；窄于 40 列或低于 24 行的终端使用单行 `π`。设置 `NO_COLOR` 可关闭 Logo 配色。
- `Initial prompt ≈ … tokens`：系统提示（含已注入的项目说明和技能描述）加当前启用工具的名称、描述和参数 schema 的本地估算。ASCII 按约 4 字符/token，非 ASCII 按约 1 字符/token；**不是模型 tokenizer 或账单用量**。不计用户输入、未加载的技能全文、未展开的模板，以及提交时其他扩展才注入的内容或 provider 包装。
- 原生快捷键、完整帮助展开和 Pi 自说明保留；不重复 footer 的模型/项目。
- Extensions / Skills 折叠列表标题居中、网格整体居中，使用最多三列、缩短包名，重名保留来源；技能名本身简短（Pi 校验为小写 a-z、0-9、连字符），不缩短。完整路径仍在原生 Ctrl+O 展开详情中。其他资源与错误/警告不改动。
- 只在空白新会话显示；恢复/派生会话不插入欢迎区。输入时保留，提交 prompt 或执行 bash 后收起品牌与帮助区；原生资源列表仍可展开。不抢焦点、不联网、不写入模型上下文。
- `welcome: false` 可关闭此功能，独立于 `/block-editor on|off` 的编辑器开关。

**兼容边界：** Pi 暂无公开的资源列表定制接口。原生帮助复用和 Extensions / Skills 排版使用独立、可撤销、仅针对已验证版本（**0.85.1、0.87.1、0.99.1、1.0.0**）的组件结构适配层；不读取配置猜测已加载扩展，不修改扩展内容。在其他版本保留原生资源列表，欢迎区使用简短帮助。Header 与编辑器一样是单槽位；与其他自定义 header 插件同时启用时，由加载顺序决定显示，请仅启用一个欢迎页。适配层不会修改其他资源或诊断。

### 配置

复制 `examples/block-editor.json` 到 `~/.pi/agent/block-editor.json`；设置了 `PI_CODING_AGENT_DIR` 时改用该目录。只读取用户级配置，不读取项目内配置，不写配置文件。

```json
{
  "enabled": true,
  "welcome": true,
  "paddingX": 1,
  "background": "theme"
}
```

- `enabled`：新会话是否自动启用。已有会话的命令选择优先。
- `welcome`：是否启用新会话首页，默认 `true`。
- `paddingX`：左右各 1–8 列；极窄终端由原生布局压缩。插件启用时优先于 Pi 的 `editorPaddingX`。
- `background`：`"theme"`、`"#RRGGBB"` 或 0–255 色号。
- 修改后 `/reload` 生效。未知字段和非法值会报错，不静默安装。

默认使用**当前**主题的 `userMessageBg`，跟随深浅主题即时切换。自定义主题若将此颜色设成终端底色，应显式指定背景；插件不查询或猜测终端实际底色。十六进制颜色直接输出 truecolor；旧终端建议使用 256 色号。

可选原创“星空深蓝”配色见 `examples/starry-dark.json`（`#202838`）。这是深色氛围的纯色方案，不复制 Codex CLI 的源码、图片或品牌元素，也不添加星点、纹理或动画；固定深色背景应配合深色终端使用，浅色主题请保留 `"theme"`。

## 渲染与原生能力

继承 `CustomEditor`，不重写 `handleInput`。原生编辑逻辑继续负责快捷键、历史浏览、撤销、kill/yank、补全、括号粘贴、折叠粘贴、图片快捷键、换行和滚动。

覆盖 `renderTopBorder()` / `renderBottomBorder()`，以仅在本次同步渲染内存在的标记确定输入区边界，再把这两行变为背景空行；**不是删除首尾行，也不按横线字符猜测边框**。补全在下边框后，逐字节保留。上下各一空行，原生行数、鼠标坐标、滚动阈值不变。边框的隐藏行计数和 thinking/bash 边框颜色不再显示，这是无边框设计的取舍。

原生 `CURSOR_MARKER` 原样保留，ANSI 光标反色后的 reset 会重新铺背景，避免右侧底色断裂。必要时可遵循 Pi 文档启用 `PI_HARDWARE_CURSOR=1`。

### 启停的状态边界

Pi 的 `setEditorComponent()` 只迁移文本和应用回调，不迁移原编辑器实例的全部内部状态：

- 插件启用期间，历史、粘贴映射、撤销等均由原生实例正常维护。
- 安装时通过公开会话 API 重建当前分支最近 100 条用户消息历史。
- **启停、reload、会话切换不保证保留撤销栈、kill ring、光标位置、补全选中项或未持久化的命令历史。** 恢复默认输入框后使用 Pi 默认实例自己的历史；本插件期间新增历史不能通过公开 API 注入该实例。
- 本插件主动恢复原生前，会展开折叠粘贴，避免遗留失去映射的粘贴标记。其他插件主动抢占导致的状态丢失不在本插件控制范围内。
- 图片仍由 Pi 的附件处理管理；真实剪贴板及图片发送链路尚待人工验证。

## 与其他插件同时使用

- `pi-hud` 使用 footer / widget，不占用主编辑器，可同时使用；已进行本机组合 TUI 冒烟验证，未修改它。
- 主编辑器是**单槽位**。发现已有自定义工厂（例如 Vim 编辑器）时不安装，不尝试包装不认识的布局。
- 停用/清理前比较 `getEditorComponent() === 本插件工厂`；若后来被替换，不清除、不恢复、不抢回。
- 无法阻止其他插件无条件覆盖。加载顺序可能影响谁最终拥有编辑器；不会承诺与任意编辑器插件无缝组合。
- reload / 会话替换由 Pi 清理 UI 并创建新扩展实例；本插件也进行幂等、所有权受限的 shutdown 清理，不保留旧 ctx，不开定时器或监听器。

## 开发与验证

```bash
npm ci
npm run verify
npm run package:check

# 需要本机 pi、tmux、Python 3；隔离配置，不调用模型
python3 scripts/tui-smoke.py
python3 scripts/tui-smoke.py --fullscreen
python3 scripts/tui-smoke.py --hud ../pi-hud/index.ts
python3 scripts/welcome-smoke.py
python3 scripts/welcome-smoke.py --fullscreen
```

TUI 脚本只操作自己创建的独立 tmux server，使用临时配置并自动清理；ANSI 捕获保存在 `artifacts/`，不打包。测试 fixture 不进入发布包。

详见 [实现核对与验证记录](docs/verification.md)。**终端捕获及光标单元测试不代表桌面中文 IME 候选窗或真实剪贴板图片已通过。**

已核对并验证 **Pi 0.85.1、0.87.1、0.99.1 与 1.0.0**（`@earendil-works` 包，导入由 Pi 运行时解析，已用独立目录实测）。其余版本尚未验证；需要 `getEditorComponent` 和原生编辑器的两个 protected 边框钩子（0.85.1–1.0.0 间签名未变）。不支持旧 `@mariozechner` 发行版。加载时如缺少所需 API 会提示并保持原生输入框。

## 许可

MIT，见 [LICENSE](LICENSE)。Pi 为 peer dependency，不打包其源码。Logo 配色与字形转录自需求方提供的参考图。未引入 Codex CLI 素材；若以后引入外部素材，应单独核对许可与署名要求。
