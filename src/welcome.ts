import { stripVTControlCharacters } from "node:util";
import { keyText, type ExtensionAPI, type ExtensionContext, type Theme } from "@earendil-works/pi-coding-agent";
import { Text, sliceByColumn, truncateToWidth, visibleWidth, wrapTextWithAnsi, type Component } from "@earendil-works/pi-tui";
import { createResourceAdapter, startupText, startupTexts } from "./startup-resources.ts";

// Flat-color block π transcribed from the reference logo: a 4×4 cell glyph —
// coral top bar with its right curl, blue left leg with its foot bump, gold
// right leg. Each cell is 4×2 terminal characters so cells stay square.
const LOGO_CELLS = ["RRR.", "B.R.", "BB.Y", "B..Y"];
const LOGO_COLORS: Record<string, [number, number, number]> = {
  R: [240, 144, 130], // #F09082 coral top bar
  B: [77, 154, 191], // #4D9ABF blue left leg
  Y: [241, 190, 88], // #F1BE58 gold right leg
};
const CELL_WIDTH = 4;
const CELL_ROWS = 2;

export function renderLogo(color = true): string[] {
  const lines: string[] = [];
  for (const row of LOGO_CELLS) {
    const runs: { cell: string; count: number }[] = [];
    for (const cell of row) {
      const last = runs[runs.length - 1];
      if (last?.cell === cell) last.count++;
      else runs.push({ cell, count: 1 });
    }
    for (let repeat = 0; repeat < CELL_ROWS; repeat++) {
      lines.push(runs.map(({ cell, count }) => {
        const text = (cell === "." ? " " : "█").repeat(count * CELL_WIDTH);
        const rgb = LOGO_COLORS[cell];
        return rgb && color ? `\x1b[38;2;${rgb.join(";")}m${text}\x1b[39m` : text;
      }).join("").trimEnd());
    }
  }
  return lines;
}

// The native header drops its first line (logo top plus version); its second
// line pairs the 4-column half-block logo with the first hint line. Keep only
// the hints so reused help stays centered. Terminals the logo does not support
// (text wordmark fallback) already start that line directly with the hints.
export function stripNativeLogo(line: string): string {
  return stripVTControlCharacters(line).startsWith("█▀ █") ? sliceByColumn(line, 5, visibleWidth(line)) : line;
}

// Center one line of the given visible width inside the symmetric padding
// margins; content wider than the margins hugs the left gutter instead.
function centerIndent(width: number, padding: number, textWidth: number): string {
  const gutter = Math.min(padding, Math.max(0, width - 1));
  return " ".repeat(gutter + Math.max(0, Math.floor((width - 2 * gutter - textWidth) / 2)));
}

// Center every help line within the padded width; long lines wrap first so
// each visible line centers instead of hugging the left edge.
export function centerLines(text: string, width: number, padding = 1): string {
  const gutter = Math.min(padding, Math.max(0, width - 1));
  const inner = Math.max(1, width - 2 * gutter);
  return text.split("\n").flatMap((line) => (line === "" ? [""] : wrapTextWithAnsi(line, inner)))
    .map((line) => centerIndent(width, padding, visibleWidth(line)) + line)
    .join("\n");
}

export function estimateInitialTokens(systemPrompt: string, tools: { name: string; description: string; parameters: unknown }[]): number {
  const text = systemPrompt + (tools.length ? "\n" + JSON.stringify(tools.map(({ name, description, parameters }) => ({ name, description, parameters }))) : "");
  let ascii = 0, unicode = 0;
  for (const char of text) char.codePointAt(0)! <= 127 ? ascii++ : unicode++;
  return Math.ceil(ascii / 4 + unicode);
}

export function formatTokens(tokens: number): string {
  if (tokens < 1000) return String(tokens);
  return `${(tokens / 1000).toFixed(1)}k`;
}

export function renderWelcome(width: number, tokens: number | undefined, theme: Pick<Theme, "fg" | "bold">, padding = 1, color = true, compact = false): string[] {
  if (width <= 0) return [];
  const logo = width < 40 || compact ? ["π"] : renderLogo(color);
  const count = tokens === undefined ? "unavailable" : `≈ ${formatTokens(tokens)} tokens`;
  // The logo centers as one block so its cells keep their grid alignment;
  // the info line centers on its own visible width.
  const logoIndent = centerIndent(width, padding, Math.max(...logo.map((line) => visibleWidth(line))));
  const info = theme.fg("muted", "Initial prompt  ") + theme.bold(count);
  const lines = ["", ...logo.map((line) => logoIndent + line), "",
    centerIndent(width, padding, visibleWidth(info)) + info, ""];
  return lines.map((line) => truncateToWidth(line, width));
}

export function createWelcome(pi: ExtensionAPI) {
  let dismiss: (() => void) | undefined;
  let cleanup: (() => void) | undefined;
  // No keyboard interception: typing, completion and model selection retain focus.
  pi.on("input", () => { dismiss?.(); });
  pi.on("before_agent_start", () => { dismiss?.(); });
  pi.on("user_bash", () => { dismiss?.(); });

  return {
    start(ctx: ExtensionContext, reason: string | undefined, padding: number) {
      cleanup?.();
      cleanup = undefined;
      dismiss = undefined;
      if (ctx.mode !== "tui" || typeof ctx.ui.setHeader !== "function") return;
      if (reason === "resume" || reason === "fork" || ctx.sessionManager.getBranch().some((entry) =>
        entry.type === "message" || entry.type === "compaction" || entry.type === "branch_summary")) return;

      ctx.ui.setHeader((tui) => {
        // Preserve the actual native help and keybindings rather than copying a
        // static shortcut list. The built-in header is found by its content, not
        // by version number; layouts without it use a minimal fallback.
        const native = startupTexts(tui).find((node) =>
          stripVTControlCharacters(startupText(node, false)).includes("Pi can explain its own features"));
        const resources = createResourceAdapter(tui, () => ctx.ui.theme, () => ctx.ui.getToolsExpanded());
        let visible = true;
        let expanded = ctx.ui.getToolsExpanded();
        let disposed = false;
        let cachedSource = "", cachedTokens: number | undefined;
        const help = new Text("", 0, 0);
        const component: Component & { setExpanded(value: boolean): void; dispose(): void } = {
          render(width) {
            resources.refresh();
            if (!visible) return [];
            try {
              const active = new Set(pi.getActiveTools());
              const tools = pi.getAllTools().filter((tool) => active.has(tool.name));
              const prompt = ctx.getSystemPrompt();
              const source = JSON.stringify([prompt, tools]);
              if (source !== cachedSource) {
                cachedTokens = estimateInitialTokens(prompt, tools);
                cachedSource = source;
              }
            } catch { cachedTokens = undefined; }
            const theme = ctx.ui.theme;
            const helpText = native
              ? startupText(native, expanded).split("\n").slice(1).map((line, index) =>
                  index === 0 ? stripNativeLogo(line) : line).join("\n")
              : `${keyText("app.interrupt")} interrupt · ${keyText("app.clear")}/${keyText("app.exit")} clear/exit · / commands · ! bash · ${keyText("app.tools.expand")} more\nPress ${keyText("app.tools.expand")} to show full startup help and loaded resources.\n\nPi can explain its own features and look up its docs. Ask it how to use or extend Pi.`;
            help.setText(theme.fg("dim", centerLines(helpText, width, padding)));
            // The 8-row block logo plus info and help needs ~24 rows to clear
            // the editor; shorter terminals fall back to the one-line π.
            return [...renderWelcome(width, cachedTokens, theme, padding, !process.env.NO_COLOR, tui.terminal.rows < 24), ...help.render(width)];
          },
          setExpanded(value) { expanded = value; help.invalidate(); },
          invalidate() { help.invalidate(); },
          dispose() { disposed = true; resources.dispose(); },
        };
        dismiss = () => { if (!disposed && visible) { visible = false; tui.requestRender(); } };
        // Pi owns the single header slot. Do not restore an unknown replacement
        // during shutdown; the host resets extension UI during session teardown.
        cleanup = () => component.dispose();
        return component;
      });
    },
    shutdown() { cleanup?.(); cleanup = undefined; dismiss = undefined; },
  };
}
