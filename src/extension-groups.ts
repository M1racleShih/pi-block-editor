import { homedir } from "node:os";

/** An aggregator may name its own resources without changing their load identity. */
export interface ExtensionSummaryGroup {
  label: string;
  /** Absolute package directory, used only against paths present in the native expanded list. */
  root: string;
  /** Native npm/Git compact prefixes, e.g. @scope/package or owner/repository. */
  packageLabels?: readonly string[];
}

function normalized(path: string): string {
  const unix = path.replace(/\\/g, "/");
  const expanded = unix.startsWith("~/") ? homedir().replace(/\\/g, "/") + unix.slice(1) : unix;
  return expanded.replace(/\/+$/, "");
}

/**
 * Transform only native collapsed labels. Local members must have exactly one
 * matching path in the native expanded inventory; never infer loaded resources
 * from settings, a directory scan, commands or the declared group alone.
 * Unknown formats, duplicate labels and overlapping groups remain ungrouped.
 */
export function groupExtensionLabels(labels: string[], details: string, groups: readonly ExtensionSummaryGroup[]): string[] {
  if (!groups.length || !details.startsWith("[Extensions]\n")) return labels;
  // Pi's shape-checked scope view uses four spaces for standalone paths and six
  // for package-relative paths. Package headings are not standalone file paths.
  const paths = details.split("\n").filter((line) => /^ {4}\S/.test(line))
    .map((line) => normalized(line.trim()))
    .filter((path) => path.startsWith("/") || /^[A-Za-z]:\//.test(path));
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  const emitted = new Set<ExtensionSummaryGroup>();
  const result: string[] = [];
  for (const label of labels) {
    if (counts.get(label) !== 1) { result.push(label); continue; }
    const packaged = groups.filter((group) => group.packageLabels?.some((prefix) => prefix && label.startsWith(`${prefix}:`)));
    const suffix = normalized(label);
    const matches = paths.filter((path) => path === suffix || path.endsWith(`/${suffix}`));
    const candidates = packaged.length ? packaged : matches.length === 1
      ? groups.filter((group) => {
        const root = normalized(group.root);
        return root && (matches[0] === root || matches[0]!.startsWith(`${root}/`));
      }) : [];
    if (candidates.length !== 1) { result.push(label); continue; }
    const group = candidates[0]!;
    if (!emitted.has(group)) { result.push(group.label); emitted.add(group); }
  }
  return result;
}
