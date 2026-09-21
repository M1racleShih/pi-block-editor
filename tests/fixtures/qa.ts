// Test-only commands. Never included in the published Pi extension manifest.
import { CustomEditor, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
class ForeignEditor extends CustomEditor {
  protected override renderTopBorder(): string { return "FOREIGN-EDITOR"; }
}
export default function (pi: ExtensionAPI) {
  pi.registerCommand("qa-block-theme", { handler: async (args, ctx) => { ctx.ui.setTheme(args.trim()); } });
  pi.registerCommand("qa-block-lines", { handler: async (_args, ctx) => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    ctx.ui.setEditorText(Array.from({ length: 40 }, (_, i) => `QA-LINE-${i}`).join("\n"));
  } });
  pi.registerCommand("qa-block-foreign", { handler: async (_args, ctx) => {
    ctx.ui.setEditorComponent((tui, theme, keys) => new ForeignEditor(tui, theme, keys));
  } });
}
