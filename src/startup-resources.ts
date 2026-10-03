import { stripVTControlCharacters } from "node:util";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";

// Pi has no public resource-list customization API. Keep the bridge isolated,
// shape-checked and reversible; never reconstruct an inventory from
// tools/commands (that would omit UI-only extensions).
// Pi versions whose internal startup components (ExpandableText sections with
// `[Name]\n` collapsed text, the builtInHeader onboarding line) have been
// verified to match this bridge. Extend only after checking both structures.
export const VERIFIED_PI_VERSIONS = new Set(["0.85.1", "0.87.1", "0.99.1", "1.0.0"]);
interface StartupText extends Component {
  getCollapsedText?: () => string;
  getExpandedText?: () => string;
  build?: () => string;
  state?: { expanded: boolean };
  setExpanded(expanded: boolean): void;
}

// 0.99.1 uses ThemedText.build and an expansion state instead of exposed
// text getters. Reading either view is synchronous and restores the state;
// no render, invalidation or expansion notifications occur during inspection.
export function startupText(node: StartupText, expanded: boolean): string {
  const getter = expanded ? node.getExpandedText : node.getCollapsedText;
  if (getter) return getter.call(node);
  if (!node.build || !node.state) return "";
  const previous = node.state.expanded;
  try { node.state.expanded = expanded; return node.build(); }
  finally { node.state.expanded = previous; }
}

export function startupTexts(root: unknown): StartupText[] {
  const found: StartupText[] = [];
  const seen = new Set<unknown>();
  const queue: unknown[] = [root];
  while (queue.length && seen.size < 500) {
    const item = queue.shift();
    if (!item || typeof item !== "object" || seen.has(item)) continue;
    seen.add(item);
    const node = item as Record<string, unknown>;
    const methods = ["render", "invalidate", "setExpanded"].every((key) => typeof node[key] === "function");
    const getters = ["getCollapsedText", "getExpandedText"].every((key) => typeof node[key] === "function");
    const state = node.state as { expanded?: unknown } | undefined;
    const builder = typeof node.build === "function" && state !== null && typeof state?.expanded === "boolean";
    if (methods && (getters || builder)) found.push(item as StartupText);
    if (Array.isArray(node.children)) queue.push(...node.children);
  }
  return found;
}

export function extensionLabels(labels: string[]): string[] {
  const short = labels.map((label) => {
    const name = label.replace(/^@[^/]+\//, "").split(":")[0]!;
    return name.replace(/^rpiv-/, "").replace(/\.(?:ts|js)$/, "");
  });
  return short.map((name, index) => short.indexOf(name) !== short.lastIndexOf(name) ? labels[index]! : name);
}

export function renderResourceGrid(title: string, names: string[], width: number, theme: Pick<Theme, "fg">): string[] {
  if (width <= 0 || names.length === 0) return [];
  const available = Math.max(1, width - 2);
  const cell = Math.max(1, ...names.map(visibleWidth)) + 3;
  const columns = Math.max(1, Math.min(3, Math.floor((available + 3) / cell)));
  const titleText = truncateToWidth(`${title} · ${names.length}`, available);
  const rows: string[] = [];
  for (let i = 0; i < names.length; i += columns) {
    const row = names.slice(i, i + columns).map((name, col, entries) =>
      col === entries.length - 1 ? name : name + " ".repeat(cell - visibleWidth(name))).join("");
    rows.push(truncateToWidth(row, available));
  }
  // Center the grid as one block to preserve column alignment. Center its
  // heading independently; narrow terminals clip safely instead of overflowing.
  const gridWidth = Math.max(...rows.map(visibleWidth));
  const indent = " ".repeat(Math.max(0, Math.floor((width - gridWidth) / 2)));
  const headingIndent = " ".repeat(Math.max(0, Math.floor((width - visibleWidth(titleText)) / 2)));
  return [theme.fg("muted", headingIndent + titleText), "",
    ...rows.map((row) => theme.fg("dim", indent + row))];
}

export function renderExtensions(labels: string[], width: number, theme: Pick<Theme, "fg">): string[] {
  return renderResourceGrid("Extensions", extensionLabels(labels), width, theme);
}

// Skill names are already short and validated by Pi (lowercase a-z, 0-9,
// hyphens); unlike extension paths they need no shortening or disambiguation.
export function renderSkills(names: string[], width: number, theme: Pick<Theme, "fg">): string[] {
  return renderResourceGrid("Skills", names, width, theme);
}

// Collapsed startup sections restyled as a grid. Native expanded details,
// other sections and diagnostics are never touched.
const GRID_SECTIONS = [
  { prefix: "[Extensions]\n", title: "Extensions", display: extensionLabels },
  { prefix: "[Skills]\n", title: "Skills", display: (names: string[]) => names },
] as const;

export function createResourceAdapter(root: unknown, getTheme: () => Theme, version: string, isExpanded = () => false) {
  const restores: (() => void)[] = [];
  return {
    refresh() {
      if (!VERIFIED_PI_VERSIONS.has(version) || restores.length) return;
      const texts = startupTexts(root);
      for (const { prefix, title, display } of GRID_SECTIONS) {
        const section = texts.find((node) =>
          stripVTControlCharacters(startupText(node, false)).startsWith(prefix));
        if (!section) continue;
        const original = section.render;
        const originalExpand = section.setExpanded;
        let expanded = isExpanded();
        const wrappedExpand = (value: boolean) => { expanded = value; originalExpand.call(section, value); };
        section.setExpanded = wrappedExpand;
        const wrapped: Component["render"] = function (width) {
          const collapsed = startupText(section, false);
          // Expanded details and all other sections/diagnostics stay native.
          if (expanded) return original.call(section, width);
          const body = stripVTControlCharacters(collapsed).slice(prefix.length).trim();
          // Skill/extension labels never contain the ", " separator themselves.
          const labels = body.split(", ").filter(Boolean);
          return labels.length ? renderResourceGrid(title, display(labels), width, getTheme()) : original.call(section, width);
        };
        section.render = wrapped;
        restores.push(() => {
          if (section.render === wrapped) section.render = original;
          if (section.setExpanded === wrappedExpand) section.setExpanded = originalExpand;
        });
      }
    },
    dispose() { for (const restore of restores) restore(); restores.length = 0; },
  };
}
