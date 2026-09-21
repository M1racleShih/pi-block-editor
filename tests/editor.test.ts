import { test } from "node:test";
import assert from "node:assert/strict";
import { stripVTControlCharacters } from "node:util";
import { readFileSync } from "node:fs";
import { CustomEditor, Theme } from "@earendil-works/pi-coding-agent";
import { CURSOR_MARKER, visibleWidth, type EditorTheme } from "@earendil-works/pi-tui";
import { BlockEditor, paint, backgroundAnsi } from "../src/block-editor.ts";
import { defaults, parseConfig } from "../src/config.ts";

const identity = (s: string) => s;
const editorTheme: EditorTheme = { borderColor: identity, selectList: {
  selectedPrefix: identity, selectedText: identity, description: identity, scrollInfo: identity, noMatch: identity,
} };
const theme = new Theme({ muted: "", text: "", thinkingXhigh: "" } as never, { userMessageBg: "#25282d", selectedBg: "" } as never, "truecolor");
const tui = { terminal: { rows: 30 }, requestRender() {} } as ConstructorParameters<typeof CustomEditor>[0];
const keys = { matches(data: string, action: string) {
  return (action === "app.clipboard.pasteImage" && data === "\x16") || (action === "app.interrupt" && data === "\x1b");
} } as ConstructorParameters<typeof CustomEditor>[2];
const make = () => new BlockEditor(tui, editorTheme, keys, { ...defaults }, () => theme);
const native = () => new CustomEditor(tui, editorTheme, keys, { paddingX: 1 });
const plain = (s: string) => stripVTControlCharacters(s);

for (const width of [4, 10, 40, 80]) {
  test(`native geometry/cursor/scroll at width ${width}`, () => {
    const block = make(); const base = native();
    block.focused = base.focused = true;
    for (const text of ["", "中文🙂é", "─".repeat(30), "hello world ".repeat(30), Array.from({ length: 40 }, (_, i) => `行${i}`).join("\n")]) {
      block.setText(text); base.setText(text);
      for (const key of ["", "\x1b[A", "\x1b[5~", "\x01", "\x1b[6~"]) {
        if (key) { block.handleInput(key); base.handleInput(key); }
        const actual = block.render(width); const expected = base.render(width);
        assert.equal(actual.length, expected.length);
        assert.equal(plain(actual[0]), " ".repeat(width));
        assert.equal(plain(actual.at(-1)!), " ".repeat(width));
        assert.deepEqual(actual.slice(1, -1).map(plain), expected.slice(1, -1).map(plain));
        assert.deepEqual(block.getCursor(), base.getCursor());
        assert.equal(actual.filter((l) => l.includes(CURSOR_MARKER)).length, 1);
        for (const line of actual) assert.ok(visibleWidth(line) <= width);
      }
    }
  });
}

test("completion stays outside block, including final option and cursor marker", async () => {
  const block = make(); const base = native();
  const provider = {
    getSuggestions: async () => ({ prefix: "/", items: Array.from({ length: 12 }, (_, i) => ({ value: `/item${i}`, label: `option${i}` })) }),
    applyCompletion: () => ({ lines: ["/item0"], cursorLine: 0, cursorCol: 6 }),
  };
  for (const editor of [block, base]) {
    editor.focused = true; editor.setAutocompleteProvider(provider); editor.handleInput("/");
  }
  await new Promise((r) => setTimeout(r, 30));
  assert.ok(block.isShowingAutocomplete());
  const actual = block.render(40); const expected = base.render(40);
  assert.ok(actual.length > 3);
  assert.deepEqual(actual.slice(3), expected.slice(3));
  assert.ok(actual[1].includes(CURSOR_MARKER));
  block.handleInput("\t"); base.handleInput("\t");
  assert.equal(block.getText(), base.getText());
});

test("history, kill/yank, paste expansion, image shortcut delegate natively", () => {
  const block = make(); const base = native();
  for (const editor of [block, base]) {
    editor.addToHistory("历史输入"); editor.handleInput("\x1b[A");
    assert.equal(editor.getText(), "历史输入");
    editor.handleInput("\x05"); editor.handleInput("\x15"); editor.handleInput("\x19");
    editor.handleInput("\x1b[200~" + "多行文本\n".repeat(30) + "\x1b[201~");
  }
  assert.equal(block.getText(), base.getText());
  assert.equal(block.getExpandedText(), base.getExpandedText());
  assert.ok(block.getExpandedText().includes("多行文本\n".repeat(30)));
  let image = false; block.onPasteImage = () => { image = true; }; block.handleInput("\x16"); assert.ok(image);
});

test("theme is resolved each render; SGR reset restores background", () => {
  let active = theme;
  const block = new BlockEditor(tui, editorTheme, keys, defaults, () => active);
  assert.ok(block.render(20)[0].includes("48;2;37;40;45"));
  active = new Theme({ muted: "", text: "", thinkingXhigh: "" } as never, { userMessageBg: "#eeeeee", selectedBg: "" } as never, "truecolor");
  block.invalidate(); assert.ok(block.render(20)[0].includes("48;2;238;238;238"));
  assert.ok(paint("\x1b[7mx\x1b[0m", 10, "BG").includes("\x1b[0mBG"));
  assert.equal(backgroundAnsi({ ...defaults, background: 236 }, theme), "\x1b[48;5;236m");
});

test("bundled example configs validate, including original starry-dark color", () => {
  for (const name of ["block-editor", "starry-dark"]) {
    const config = parseConfig(JSON.parse(readFileSync(new URL(`../examples/${name}.json`, import.meta.url), "utf8")));
    if (name === "starry-dark") assert.equal(backgroundAnsi(config, theme), "\x1b[48;2;32;40;56m");
  }
});

test("configuration rejects bad types, escape injection and unknown keys", () => {
  for (const value of [null, [], { enabled: 1 }, { paddingX: 0 }, { background: "\x1b[0m" }, { background: 256 }, { typo: true }]) {
    assert.throws(() => parseConfig(value));
  }
  assert.deepEqual(parseConfig({}), defaults);
  assert.equal(parseConfig({ background: "#abcdef" }).background, "#abcdef");
});
