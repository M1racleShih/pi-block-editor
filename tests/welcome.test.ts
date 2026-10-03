import { test } from "node:test";
import assert from "node:assert/strict";
import { stripVTControlCharacters as plain } from "node:util";
import { Container, Text, visibleWidth } from "@earendil-works/pi-tui";
import { type ExtensionAPI, type ExtensionContext, type Theme } from "@earendil-works/pi-coding-agent";
import { centerLines, createWelcome, estimateInitialTokens, renderLogo, renderWelcome, stripNativeLogo } from "../src/welcome.ts";
import { createResourceAdapter, extensionLabels, renderExtensions, renderSkills, startupText, startupTexts, VERIFIED_PI_VERSIONS } from "../src/startup-resources.ts";

const theme = { fg: (_color: string, text: string) => text, bold: (text: string) => text } as Theme;
class StartupText extends Text {
  getCollapsedText: () => string;
  getExpandedText: () => string;
  constructor(collapsed: () => string, expanded: () => string) {
    super(collapsed(), 0, 0);
    this.getCollapsedText = collapsed;
    this.getExpandedText = expanded;
  }
  setExpanded(value: boolean) { this.setText(value ? this.getExpandedText() : this.getCollapsedText()); }
}

test("initial estimate counts system prompt and tool schemas, excludes metadata", () => {
  assert.equal(estimateInitialTokens("abcdefgh", []), 2);
  assert.equal(estimateInitialTokens("中文", []), 2);
  const tool = { name: "read", description: "Read", parameters: { type: "object" } };
  assert.ok(estimateInitialTokens("abcdefgh", [tool]) > 2);
  assert.equal(estimateInitialTokens("", [tool]), estimateInitialTokens("", [{ ...tool, sourceInfo: "ignored" } as typeof tool]));
});

test("logo is flat-color blocks; widths, compact terminal and color opt-out", () => {
  const painted = renderLogo().join("\n");
  for (const rgb of ["240;144;130", "77;154;191", "241;190;88"]) assert.ok(painted.includes(`\x1b[38;2;${rgb}m`));
  assert.equal(renderLogo().join("\n"), renderLogo().join("\n"));
  const plainLogo = renderLogo(false).join("\n");
  assert.ok(!plainLogo.includes("\x1b") && plainLogo.includes("█"));
  assert.ok(plain(plainLogo).length === plainLogo.length);
  for (const width of [0, 1, 4, 20, 39, 40, 80, 120]) {
    const lines = renderWelcome(width, 12400, theme);
    assert.ok(lines.every((line) => visibleWidth(line) <= width));
    if (width >= 40) assert.ok(plain(lines.join("\n")).includes("≈ 12.4k tokens"));
  }
  assert.ok(renderWelcome(80, undefined, theme, 1, false, true).join("\n").includes("π\n"));
  assert.ok(renderWelcome(80, undefined, theme).join("\n").includes("unavailable"));
});

test("logo, info line and help text are centered within the padded width", () => {
  const filled = renderWelcome(120, 12400, theme, 2).map(plain).filter((line) => line.trim().length > 0);
  assert.ok(filled.length > 3);
  for (const line of filled) assert.ok(line.startsWith(" ".repeat(45)), JSON.stringify(line));
  // Compact screens center the one-line π the same way.
  assert.ok(renderWelcome(80, undefined, theme, 1, false, true)[1]!.startsWith(" ".repeat(39)));
});

test("help text wraps long lines and centers every visible line", () => {
  const lines = centerLines(`first\n\n${"word ".repeat(30).trim()}`, 40, 1).split("\n");
  assert.ok(lines.length > 4);
  assert.ok(lines.every((line) => visibleWidth(line) <= 40));
  assert.ok(lines[0]!.startsWith(" ".repeat(15)) && lines[0]!.trim() === "first");
  assert.equal(lines[1]!.trim(), "");
  assert.ok(lines.slice(2).every((line) => line.startsWith(" ")));
});

test("extension grid shortens names, disambiguates collisions and stays within width", () => {
  assert.deepEqual(extensionLabels(["@ff-labs/pi-fff:src", "@juicesharp/rpiv-todo", "local.ts"]), ["pi-fff", "todo", "local"]);
  assert.deepEqual(extensionLabels(["@a/foo", "@b/foo"]), ["@a/foo", "@b/foo"]);
  for (const width of [1, 10, 40, 80, 120]) {
    const lines = renderExtensions(["@ff-labs/pi-fff:src", "pi-block-editor", "pi-hud"], width, theme);
    assert.ok(lines.every((line) => visibleWidth(line) <= width));
    if (width >= 40) assert.ok(lines.join("\n").includes("Extensions · 3"));
  }
});

test("skills grid keeps plain names and stays within width", () => {
  assert.deepEqual(renderSkills([], 80, theme), []);
  for (const width of [1, 10, 40, 80, 120]) {
    const lines = renderSkills(["commit-style", "release-notes", "pdf-report"], width, theme);
    assert.ok(lines.every((line) => visibleWidth(line) <= width));
    if (width >= 40) assert.ok(lines.join("\n").includes("Skills · 3"));
  }
});

test("resource adapter preserves expanded paths, diagnostics and restores ownership", () => {
  const root = new Container();
  const section = new StartupText(() => "[Extensions]\n  @ff-labs/pi-fff:src, pi-block-editor", () => "[Extensions]\n  /full/path/extension.ts");
  const skills = new StartupText(() => "[Skills]\n  commit-style, release-notes", () => "[Skills]\n  /full/path/skills/commit-style");
  const warning = new Text("[Extension issues]\nerror", 0, 0);
  root.addChild(skills); root.addChild(section); root.addChild(warning);
  const original = section.render;
  const originalSkills = skills.render;
  const adapter = createResourceAdapter(root, () => theme, "0.85.1");
  adapter.refresh();
  assert.ok(section.render(80).join("\n").includes("Extensions · 2"));
  assert.ok(skills.render(80).join("\n").includes("Skills · 2"));
  section.setExpanded(true);
  assert.ok(section.render(80).join("\n").includes("/full/path/extension.ts"));
  section.setExpanded(false);
  skills.setExpanded(true);
  assert.ok(skills.render(80).join("\n").includes("/full/path/skills/commit-style"));
  skills.setExpanded(false);
  assert.ok(warning.render(80).join("\n").includes("error"));
  adapter.dispose();
  assert.equal(section.render, original); assert.equal(skills.render, originalSkills);
  createResourceAdapter(root, () => theme, "future").refresh(); assert.equal(section.render, original);
  // 0.87.1 shares the verified ExpandableText section shape and must stay active.
  const verified = createResourceAdapter(root, () => theme, "0.87.1"); verified.refresh();
  assert.notEqual(section.render, original);
  verified.dispose(); assert.equal(section.render, original);
  const again = createResourceAdapter(root, () => theme, "0.85.1"); again.refresh();
  const replacement = () => ["other extension"];
  section.render = replacement; again.dispose(); assert.equal(section.render, replacement);
});

function harness(mode = "tui", entries: unknown[] = [], logo: "block" | "wordmark" = "block") {
  const handlers = new Map<string, Function>();
  let header: any;
  let writes = 0;
  const root = new Container();
  // Mirrors the native built-in header: two-line half-block logo plus version
  // on the first line, or the text wordmark fallback where hints start line two.
  const first = logo === "block" ? "▀▀█  v0\n█▀ █ " : "Pi v0\n";
  const native = new StartupText(
    () => `${first}CUSTOM interrupt · / commands\nPress CUSTOM for more\n\nPi can explain its own features`,
    () => `${first}ALL HELP\nPi can explain its own features`,
  );
  root.addChild(native);
  const tui = Object.assign(root, { terminal: { rows: 40 }, requestRender() {} });
  const pi = {
    on(name: string, fn: Function) { handlers.set(name, fn); },
    getActiveTools: () => ["read"],
    getAllTools: () => [{ name: "read", description: "Read", parameters: {} }, { name: "inactive", description: "x".repeat(20000), parameters: {} }],
  } as unknown as ExtensionAPI;
  const ctx = {
    mode, getSystemPrompt: () => "system prompt", sessionManager: { getBranch: () => entries },
    ui: { theme, getToolsExpanded: () => false, setHeader(factory: Function) { writes++; header = factory(tui); } },
  } as unknown as ExtensionContext;
  const welcome = createWelcome(pi);
  return { welcome, ctx, get header() { return header; }, get writes() { return writes; }, event: (name: string) => handlers.get(name)?.() };
}

test("welcome retains native help, expands, excludes inactive tools, hides on submit", () => {
  for (const logo of ["block", "wordmark"] as const) {
    const h = harness("tui", [], logo); h.welcome.start(h.ctx, "startup", 1);
    const text = plain(h.header.render(120).join("\n"));
    assert.ok(text.includes("Initial prompt")); assert.ok(text.includes("CUSTOM interrupt"));
    assert.ok(text.split("\n").find((line) => line.includes("CUSTOM interrupt"))!.startsWith(" ".repeat(30)));
    assert.ok(!text.includes("5.0k")); assert.ok(!text.includes("v0"));
    assert.ok(!text.includes("▀▀█") && !text.includes("█▀ █"));
    h.header.setExpanded(true); assert.ok(h.header.render(120).join("\n").includes("ALL HELP"));
    h.event("input"); assert.deepEqual(h.header.render(120), []);
    h.welcome.shutdown();
  }
});

test("native help drops the two-line logo but keeps unadorned hint lines", () => {
  assert.equal(plain(stripNativeLogo("\x1b[34m█▀\x1b[0m \x1b[33m█\x1b[0m escape interrupt · more")), "escape interrupt · more");
  assert.equal(stripNativeLogo("escape interrupt · more"), "escape interrupt · more");
  // The wordmark fallback puts hints at the line start; nothing must be cut.
  assert.equal(stripNativeLogo("Pi escape interrupt"), "Pi escape interrupt");
});

for (const event of ["before_agent_start", "user_bash"]) test(`${event} dismisses welcome`, () => {
  const h = harness(); h.welcome.start(h.ctx, "new", 1); h.event(event);
  assert.deepEqual(h.header.render(80), []);
});

for (const mode of ["rpc", "json", "print"]) test(`welcome does not touch ${mode}`, () => {
  const h = harness(mode); h.welcome.start(h.ctx, "startup", 1); assert.equal(h.writes, 0);
});

test("resume/fork and non-empty branches keep native header; blank reload is welcome", () => {
  for (const reason of ["resume", "fork"]) {
    const h = harness(); h.welcome.start(h.ctx, reason, 1); assert.equal(h.writes, 0);
  }
  const existing = harness("tui", [{ type: "message", message: { role: "user" } }]);
  existing.welcome.start(existing.ctx, "startup", 1); assert.equal(existing.writes, 0);
  const blank = harness(); blank.welcome.start(blank.ctx, "reload", 1); assert.equal(blank.writes, 1);
});

class ThemedStartupText extends Text {
  state = { expanded: false };
  build: () => string;
  constructor(collapsed: string, expanded: string) {
    super("", 0, 0);
    this.build = () => this.state.expanded ? expanded : collapsed;
  }
  setExpanded(value: boolean) { this.state.expanded = value; this.invalidate(); }
  override render(width: number) { this.setText(this.build()); return super.render(width); }
}

test("themed startup sections (0.99.1, 1.0.0) preserve state, expanded paths and ownership", () => {
  for (const version of ["0.99.1", "1.0.0"]) {
    const root = new Container();
    const section = new ThemedStartupText("[Extensions]\n  pi-hud, pi-block-editor", "[Extensions]\n  /full/path/index.ts");
    root.addChild(section);
    const original = section.render;
    assert.equal(startupTexts(root).length, 1);
    assert.ok(startupText(section, true).includes("/full/path"));
    assert.equal(section.state.expanded, false);
    const adapter = createResourceAdapter(root, () => theme, version);
    adapter.refresh();
    assert.ok(section.render(80).join("\n").includes("Extensions · 2"));
    section.setExpanded(true);
    assert.ok(section.render(80).join("\n").includes("/full/path"));
    assert.equal(section.state.expanded, true);
    assert.ok(startupText(section, false).includes("pi-hud"));
    assert.equal(section.state.expanded, true);
    adapter.dispose();
    assert.equal(section.render, original);
    section.build = () => { throw new Error("builder failure"); };
    assert.throws(() => startupText(section, false), /builder failure/);
    assert.equal(section.state.expanded, true);
  }
});

test("every verified Pi version activates the resource bridge", () => {
  assert.deepEqual([...VERIFIED_PI_VERSIONS].sort(), ["0.85.1", "0.87.1", "0.99.1", "1.0.0"]);
  for (const version of VERIFIED_PI_VERSIONS) {
    const root = new Container();
    const section = new ThemedStartupText("[Extensions]\n  pi-hud, pi-block-editor", "[Extensions]\n  /full/path/index.ts");
    root.addChild(section);
    const original = section.render;
    const adapter = createResourceAdapter(root, () => theme, version);
    adapter.refresh();
    assert.ok(section.render(80).join("\n").includes("Extensions · 2"), version);
    adapter.dispose();
    assert.equal(section.render, original);
  }
});

test("resource heading centers independently and grid columns center as one block", () => {
  for (const width of [40, 80, 120]) {
    const lines = renderExtensions(["aaa", "bbb", "ccc", "ddd"], width, theme).map(plain);
    const heading = lines[0]!;
    assert.equal(heading.length - heading.trimStart().length, Math.floor((width - heading.trim().length) / 2));
    const rows = lines.slice(2);
    const widest = Math.max(...rows.map((row) => row.trim().length));
    for (const row of rows) assert.equal(row.length - row.trimStart().length, Math.floor((width - widest) / 2));
  }
});
