import { test } from "node:test";
import assert from "node:assert/strict";
import { homedir } from "node:os";
import { groupExtensionLabels, type ExtensionSummaryGroup } from "../src/extension-groups.ts";

const group: ExtensionSummaryGroup = {
  label: "my-suite", root: "/work/my-suite", packageLabels: ["owner/my-suite", "my-suite"],
};
const details = (paths: string[]) => `[Extensions]\n  user\n${paths.map((path) => `    ${path}`).join("\n")}`;

test("local package summary uses only paths in the native inventory and retains unrelated extensions", () => {
  const labels = ["clear.ts", "pi-hud", "rea.ts", "extensions", "pi-fff:src"];
  const expanded = details(["/work/my-suite/extensions/clear.ts", "/work/my-suite/node_modules/pi-hud",
    "/project/.pi/extensions/rea.ts", "/work/my-suite/node_modules/picker/extensions"]);
  assert.deepEqual(groupExtensionLabels(labels, expanded, [group]), ["my-suite", "rea.ts", "pi-fff:src"]);
  assert.deepEqual(groupExtensionLabels(["pi-hud", "rea.ts"], details(["/project/.pi/extensions/rea.ts"]), [group]), ["pi-hud", "rea.ts"]);
});

test("Git and npm resource suffixes group under the declared package name", () => {
  const labels = ["owner/my-suite:clear.ts", "other/my-suite:src", "owner/my-suite:node_modules/pi-hud", "my-suite:editor.ts", "other"];
  assert.deepEqual(groupExtensionLabels(labels, "[Extensions]\n  user", [group]), ["my-suite", "other/my-suite:src", "other"]);
});

test("filtered or failed entries are never invented and a single remaining member still has the suite name", () => {
  assert.deepEqual(groupExtensionLabels(["pi-hud"], details(["/work/my-suite/node_modules/pi-hud"]), [group]), ["my-suite"]);
  assert.deepEqual(groupExtensionLabels(["unrelated.ts"], details(["/work/my-suite/node_modules/pi-hud", "/project/unrelated.ts"]), [group]), ["unrelated.ts"]);
  assert.deepEqual(groupExtensionLabels([], details(["/work/my-suite/node_modules/pi-hud"]), [group]), []);
});

test("ambiguous labels, duplicate labels and overlapping roots remain native", () => {
  const expanded = details(["/work/my-suite/extensions/clear.ts", "/elsewhere/clear.ts", "/work/my-suite/node_modules/pi-hud"]);
  assert.deepEqual(groupExtensionLabels(["clear.ts"], expanded, [group]), ["clear.ts"]);
  assert.deepEqual(groupExtensionLabels(["pi-hud", "pi-hud"], expanded, [group]), ["pi-hud", "pi-hud"]);
  assert.deepEqual(groupExtensionLabels(["pi-hud"], expanded, [group, { label: "outer", root: "/work" }]), ["pi-hud"]);
  assert.deepEqual(groupExtensionLabels(["elsewhere/clear.ts", "extensions/clear.ts"], expanded, [group]), ["elsewhere/clear.ts", "my-suite"]);
});

test("group roots have a path boundary and package labels have a colon boundary", () => {
  const labels = ["clear.ts", "owner/my-suite-other:src", "owner/my-suite"];
  assert.deepEqual(groupExtensionLabels(labels, details(["/work/my-suite-other/clear.ts"]), [group]), labels);
});

test("home-shortened and Windows-style native paths match their roots", () => {
  assert.deepEqual(groupExtensionLabels(["clear.ts"], details(["~/suite/extensions/clear.ts"]), [{ label: "home-suite", root: `${homedir()}/suite` }]), ["home-suite"]);
  assert.deepEqual(groupExtensionLabels(["clear.ts"], details(["C:\\work\\suite\\extensions\\clear.ts"]), [{ label: "windows-suite", root: "C:\\work\\suite" }]), ["windows-suite"]);
});

test("unknown details format and unconfigured consumers remain unchanged", () => {
  const labels = ["clear.ts", "pi-hud"];
  assert.equal(groupExtensionLabels(labels, details([]), []), labels);
  assert.equal(groupExtensionLabels(labels, "Changed native inventory format", [group]), labels);
});
