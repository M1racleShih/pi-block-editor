import { CustomEditor, type Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import type { Config } from "./config.ts";

// These markers are returned only by our protected border hooks and removed in
// the same synchronous render. Never inspect user text for box-drawing glyphs.
const TOP = "\x1b_pi-block-editor:top\x1b\\";
const BOTTOM = "\x1b_pi-block-editor:bottom\x1b\\";

export function backgroundAnsi(config: Config, theme: Theme): string {
  const color = config.background;
  if (color === "theme") return theme.getBgAnsi("userMessageBg");
  if (typeof color === "number") return `\x1b[48;5;${color}m`;
  const rgb = [1, 3, 5].map((i) => Number.parseInt(color.slice(i, i + 2), 16));
  return `\x1b[48;2;${rgb.join(";")}m`;
}

export function paint(line: string, width: number, bg: string): string {
  // Native cursor and paste styling contain SGR resets. Restore the background
  // after those resets, without touching inverse video or CURSOR_MARKER (APC).
  const padded = line + " ".repeat(Math.max(0, width - visibleWidth(line)));
  return bg + padded.replace(/\x1b\[(?:0|49)?m/g, (reset) => reset + bg) + "\x1b[49m";
}

export class BlockEditor extends CustomEditor {
  private blockConfig: Config;
  private currentTheme: () => Theme;

  constructor(
    tui: ConstructorParameters<typeof CustomEditor>[0],
    theme: ConstructorParameters<typeof CustomEditor>[1],
    keys: ConstructorParameters<typeof CustomEditor>[2],
    config: Config,
    currentTheme: () => Theme,
  ) {
    super(tui, theme, keys, { paddingX: config.paddingX });
    this.blockConfig = config;
    this.currentTheme = currentTheme;
  }

  // Pi reapplies its editorPaddingX after factory creation and in /settings.
  // Keep geometry native but make this plugin's padding authoritative.
  override setPaddingX(_padding: number): void {
    super.setPaddingX(this.blockConfig.paddingX);
  }

  protected override renderTopBorder(_width: number, _hidden: number): string { return TOP; }
  protected override renderBottomBorder(_width: number, _hidden: number): string { return BOTTOM; }

  override render(width: number): string[] {
    if (width < 1) return [];
    const lines = super.render(width);
    const top = lines.indexOf(TOP);
    const bottom = lines.indexOf(BOTTOM);
    const bg = backgroundAnsi(this.blockConfig, this.currentTheme());
    // Explicit hook boundaries, not first/last row assumptions. In particular,
    // completion rows AFTER BOTTOM are returned byte-for-byte unchanged.
    return lines.map((line, index) => {
      if (line === TOP || line === BOTTOM) return paint("", width, bg);
      return top >= 0 && bottom > top && index > top && index < bottom ? paint(line, width, bg) : line;
    });
  }
}
