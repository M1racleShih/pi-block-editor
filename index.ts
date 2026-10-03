import { join } from "node:path";
import { CustomEditor, getAgentDir, type ExtensionAPI, type ExtensionContext, type ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { BlockEditor } from "./src/block-editor.ts";
import { createWelcome } from "./src/welcome.ts";
import { defaults, loadConfig, type Config } from "./src/config.ts";

const STATE = "pi-block-editor:enabled";
type Factory = NonNullable<ReturnType<ExtensionUIContext["getEditorComponent"]>>;

export default function blockEditor(pi: ExtensionAPI): void {
  const welcome = createWelcome(pi);
  let config: Config = { ...defaults };
  let factory: Factory | undefined;
  let editor: BlockEditor | undefined;

  function supported(ctx: ExtensionContext): boolean {
    return ctx.mode === "tui" && typeof ctx.ui.getEditorComponent === "function" &&
      "renderTopBorder" in CustomEditor.prototype && "renderBottomBorder" in CustomEditor.prototype;
  }

  function enable(ctx: ExtensionContext): boolean {
    if (!supported(ctx)) return false;
    const current = ctx.ui.getEditorComponent();
    if (factory && current === factory) return true;
    if (current !== undefined) {
      ctx.ui.notify("pi-block-editor：已有其他自定义编辑器，未覆盖。请先停用它。", "warning");
      return false;
    }
    factory = (tui, theme, keys) => {
      editor = new BlockEditor(tui, theme, keys, config, () => ctx.ui.theme);
      // Pi's factory switch copies only text, not history. Rebuild submitted
      // user history through the public session API (no private state copying).
      const prompts: string[] = [];
      for (const entry of ctx.sessionManager.getBranch()) {
        if (entry.type !== "message" || entry.message.role !== "user") continue;
        const content = entry.message.content;
        const text = typeof content === "string" ? content : content.filter((p) => p.type === "text").map((p) => p.text).join("\n");
        if (text.trim()) prompts.push(text);
      }
      for (const text of prompts.slice(-100)) editor.addToHistory(text);
      return editor;
    };
    ctx.ui.setEditorComponent(factory);
    return true;
  }

  function disable(ctx: ExtensionContext): boolean {
    const owned = supported(ctx) && factory !== undefined && ctx.ui.getEditorComponent() === factory;
    if (owned) {
      // Avoid leaving orphaned collapsed paste markers in Pi's default editor.
      if (editor && editor.getText() !== editor.getExpandedText()) editor.setText(editor.getExpandedText());
      ctx.ui.setEditorComponent(undefined);
    }
    factory = undefined;
    editor = undefined;
    return owned;
  }

  pi.on("session_start", (event, ctx) => {
    if (ctx.mode !== "tui") return;
    try { config = loadConfig(join(getAgentDir(), "block-editor.json")); }
    catch (error) {
      ctx.ui.notify(`pi-block-editor 配置错误，未启用：${String(error)}`, "error");
      return;
    }
    let enabled = config.enabled;
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type === "custom" && entry.customType === STATE && typeof entry.data === "boolean") enabled = entry.data;
    }
    if (!supported(ctx)) {
      ctx.ui.notify("pi-block-editor：此 Pi 缺少所需编辑器 API；已保持原生输入框。已验证版本：0.85.1、0.87.1、0.99.1、1.0.0。", "warning");
      return;
    }
    if (enabled) enable(ctx);
    if (config.welcome) welcome.start(ctx, event.reason, config.paddingX);
  });

  pi.on("session_shutdown", (_event, ctx) => { welcome.shutdown(); disable(ctx); });

  pi.registerCommand("block-editor", {
    description: "Block 输入框：on / off / reset（恢复原生）",
    getArgumentCompletions: (prefix) => ["on", "off", "reset"].filter((v) => v.startsWith(prefix)).map((value) => ({ value, label: value })),
    handler: async (args, ctx) => {
      if (ctx.mode !== "tui") return;
      const action = args.trim();
      if (action === "on") {
        if (enable(ctx)) pi.appendEntry(STATE, true);
      } else if (action === "off" || action === "reset") {
        const restored = disable(ctx);
        pi.appendEntry(STATE, false);
        if (!restored && ctx.ui.getEditorComponent?.()) ctx.ui.notify("pi-block-editor：当前编辑器属于其他插件，未恢复或覆盖它。", "info");
      } else {
        ctx.ui.notify("用法：/block-editor on | off | reset", "info");
      }
    },
  });
}
