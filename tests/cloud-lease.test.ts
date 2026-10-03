import assert from "node:assert/strict";
import test from "node:test";
import { AccountWorkspaceLease } from "../src/cloud/lease.ts";
function locks() {
  const held = new Set<string>();
  return {
    held,
    api: {
      async request(
        name: string,
        _options: unknown,
        callback: (lock: { name: string } | null) => Promise<void>,
      ) {
        if (held.has(name)) return callback(null);
        held.add(name);
        try {
          return await callback({ name });
        } finally {
          held.delete(name);
        }
      },
    } as unknown as LockManager,
  };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
test("only one tab can own an account cache; another account remains independent", async () => {
  const mock = locks(),
    a = new AccountWorkspaceLease(mock.api),
    b = new AccountWorkspaceLease(mock.api),
    c = new AccountWorkspaceLease(mock.api);
  try {
    assert.equal(await a.acquire("alice"), true);
    assert.equal(await b.acquire("alice"), false);
    assert.equal(await c.acquire("bob"), true);
    a.release();
    await tick();
    assert.equal(await b.acquire("alice"), true);
  } finally {
    a.release();
    b.release();
    c.release();
  }
});
test("releasing a lease invalidates a delayed acquisition", async () => {
  let invoke!: () => Promise<void>;
  const api = {
    request(
      _name: string,
      _options: unknown,
      callback: (lock: object) => Promise<void>,
    ) {
      return new Promise<void>((resolve) => {
        invoke = async () => {
          await callback({});
          resolve();
        };
      });
    },
  } as unknown as LockManager;
  const lease = new AccountWorkspaceLease(api),
    result = lease.acquire("alice");
  lease.release();
  await invoke();
  assert.equal(await result, false);
});
