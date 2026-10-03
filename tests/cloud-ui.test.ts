import assert from "node:assert/strict";
import test from "node:test";
import { CloudAccountUI } from "../src/cloud/ui.ts";
import { type CloudClient } from "../src/cloud/client.ts";
import { type ProjectSync, type SyncState } from "../src/cloud/sync.ts";

test("explicit logout still pauses and signs out when local storage is full", async () => {
  let logoutCalls = 0,
    pauses = 0;
  const messages: string[] = [];
  const sync = {
    state: {} as SyncState,
    pause() {
      pauses++;
    },
  } as unknown as ProjectSync;
  const client = {
    async logout() {
      logoutCalls++;
    },
  } as unknown as CloudClient;
  const ui = new CloudAccountUI({
    sync,
    client,
    modal() {},
    flushLocal() {
      throw new Error("Quota full, emergency copy retained");
    },
    reconnectAccount: async () => {},
    emergencyCopy: () => null,
    toast(message) {
      messages.push(message);
    },
  });
  ui.update = () => {};
  await (ui as unknown as { action(value: string): Promise<void> }).action(
    "logout",
  );
  assert.equal(logoutCalls, 1);
  assert.equal(pauses, 1);
  assert.match(messages[0], /Quota full/);
});

test("repeated logout does not start a second sign-out while the first is pending", async () => {
  let logoutCalls = 0,
    release!: () => void;
  const sync = { state: {} as SyncState, pause() {} } as unknown as ProjectSync;
  const client = {
    async logout() {
      logoutCalls++;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    },
  } as unknown as CloudClient;
  const ui = new CloudAccountUI({
    sync,
    client,
    modal() {},
    flushLocal() {},
    reconnectAccount: async () => {},
    emergencyCopy: () => null,
    toast() {},
  });
  ui.update = () => {};
  const actions = ui as unknown as { action(value: string): Promise<void> };
  const first = actions.action("logout");
  await actions.action("logout");
  assert.equal(logoutCalls, 1);
  release();
  await first;
});
