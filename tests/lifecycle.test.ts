import { test } from "node:test";
import assert from "node:assert/strict";
import extension from "../index.ts";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

function harness(mode = "tui") {
  const handlers = new Map<string, Function>();
  let command: Function;
  let current: unknown; let writes = 0;
  const entries: unknown[] = [];
  const pi = {
    on: (event: string, fn: Function) => handlers.set(event, fn),
    registerCommand: (_name: string, spec: { handler: Function }) => { command = spec.handler; },
    appendEntry: (customType: string, data: unknown) => entries.push({ type: "custom", customType, data }),
  } as unknown as ExtensionAPI;
  const ctx = { mode, sessionManager: { getBranch: () => entries }, ui: {
    getEditorComponent: () => current,
    setEditorComponent: (factory: unknown) => { current = factory; writes++; },
    notify() {},
  } } as unknown as ExtensionContext;
  extension(pi);
  return {
    event: (name: string, event = {}) => handlers.get(name)?.(event, ctx),
    command: (arg: string) => command(arg, ctx),
    get current() { return current; }, get writes() { return writes; },
    replace: () => { current = () => {}; },
  };
}

test("install, idempotent enable, reset and cleanup", async () => {
  const h = harness(); await h.command("on"); assert.equal(h.writes, 1);
  await h.command("on"); assert.equal(h.writes, 1);
  await h.command("reset"); assert.equal(h.current, undefined);
  h.event("session_shutdown"); assert.equal(h.writes, 2);
});
test("never replace or restore another factory", async () => {
  const h = harness(); h.replace(); const other = h.current;
  await h.command("on"); assert.equal(h.current, other); assert.equal(h.writes, 0);
  await h.command("off"); assert.equal(h.current, other);
  const second = harness(); await second.command("on"); second.replace(); const replacement = second.current;
  second.event("session_shutdown"); assert.equal(second.current, replacement); assert.equal(second.writes, 1);
});
for (const mode of ["rpc", "json", "print"]) test(`no editor writes in ${mode}`, async () => {
  const h = harness(mode); h.event("session_start"); await h.command("on"); await h.command("off"); h.event("session_shutdown");
  assert.equal(h.writes, 0);
});
