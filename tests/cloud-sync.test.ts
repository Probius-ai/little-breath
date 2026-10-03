import assert from "node:assert/strict";
import test from "node:test";
import { createProject, clone } from "../src/project.ts";
import {
  ACCOUNT_CACHE_PREFIX,
  ProjectSync,
  cloudProject,
  sameProject,
  parseCloudRow,
  type CloudRow,
  type CloudTransport,
  type Mutation,
} from "../src/cloud/sync.ts";
import { cleanAuthURL, stripProviderTokens } from "../src/cloud/client.ts";
const A = "11111111-1111-4111-8111-111111111111",
  B = "22222222-2222-4222-8222-222222222222";
const account = (id = A) => ({ id, label: id === A ? "Alice" : "Bob" });
const row = (project = createProject(), revision = 1): CloudRow => ({
  project: clone(project),
  revision,
  updated_at: "2026-10-03T07:00:00Z",
});
function harness() {
  const store = new Map<string, string>();
  let guest = createProject(),
    current = clone(guest),
    online = true,
    fail = false;
  const db = new Map<string, CloudRow & { mutation?: string }>();
  const writes: { owner: string; mutation: Mutation }[] = [],
    reads: string[] = [];
  const transport: CloudTransport = {
    async read(owner) {
      reads.push(owner);
      if (fail) throw Error("offline");
      return clone(db.get(owner) ?? null);
    },
    async save(owner, mutation) {
      writes.push({ owner, mutation: clone(mutation) });
      if (fail) throw Error("offline");
      const old = db.get(owner);
      if (old?.mutation === mutation.mutationId)
        return { ...clone(old), status: "saved" };
      if (old && old.revision !== mutation.expectedRevision)
        return { ...clone(old), status: "conflict" };
      const next = {
        ...row(mutation.project, (old?.revision ?? 0) + 1),
        mutation: mutation.mutationId,
      };
      db.set(owner, next);
      return { ...clone(next), status: "saved" };
    },
  };
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
  const build = () =>
    new ProjectSync({
      storage,
      transport,
      getGuest: () => clone(guest),
      saveGuest: (p) => {
        guest = clone(p);
      },
      applyProject: (p) => {
        current = p;
      },
      changed() {},
      online: () => online,
    });
  const sync = build();
  return {
    sync,
    build,
    transport,
    store,
    storage,
    db,
    writes,
    reads,
    get guest() {
      return guest;
    },
    get current() {
      return current;
    },
    online: (v: boolean) => {
      online = v;
    },
    fail: (v: boolean) => {
      fail = v;
    },
  };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 10));
test("cloud serializer reconstructs the exact allowlist, dropping tokens/photos/weather at every level", () => {
  const p = createProject() as ReturnType<typeof createProject> &
    Record<string, unknown>;
  p.photo = "data:image/png,fixture";
  p.access_token = "fixture";
  p.weather = { secret: "fixture" };
  (p.pet as unknown as Record<string, unknown>).token = "fixture";
  (p.birth as unknown as Record<string, unknown>).coordinates = [1, 2];
  const output = JSON.stringify(cloudProject(p));
  assert.ok(!output.includes("fixture"));
  assert.ok(!output.includes("coordinates"));
  assert.deepEqual(Object.keys(cloudProject(p)), [
    "version",
    "pet",
    "birth",
    "createdAt",
    "updatedAt",
    "care",
    "preferences",
    "growth",
  ]);
});
test("local updatedAt is not a cloud revision or a content conflict", () => {
  const a = createProject(),
    b = clone(a);
  b.updatedAt = "2030-01-01T00:00:00Z";
  assert.equal(sameProject(a, b), true);
  b.care.meals++;
  assert.equal(sameProject(a, b), false);
  assert.throws(() =>
    parseCloudRow({ project: a, revision: 0, updated_at: a.updatedAt }),
  );
});
test("login alone neither reads nor uploads a project; explicit consent copies guest without changing it", async () => {
  const h = harness();
  try {
    const before = clone(h.guest);
    h.sync.setAccount(account());
    assert.equal(h.reads.length, 0);
    assert.equal(h.writes.length, 0);
    assert.equal(h.sync.state.enabled, false);
    await h.sync.enable();
    assert.equal(h.writes.length, 1);
    assert.equal(h.sync.state.phase, "synced");
    assert.deepEqual(h.guest, before);
    assert.deepEqual(h.db.get(A)!.project, before);
  } finally {
    h.sync.dispose();
  }
});
test("different remote project requires choice and preserves both copies before cloud replacement", async () => {
  const h = harness();
  try {
    const remote = createProject();
    remote.pet.name = "다른 기기의 친구";
    h.db.set(A, row(remote, 7));
    const local = clone(h.guest);
    h.sync.setAccount(account());
    await h.sync.enable();
    assert.equal(h.sync.state.phase, "conflict");
    assert.equal(h.writes.length, 0);
    await h.sync.resolve("cloud");
    assert.equal(h.current.pet.name, remote.pet.name);
    assert.equal(h.sync.state.recoveries.length, 1);
    assert.deepEqual(h.sync.state.recoveries[0].local, local);
    assert.deepEqual(h.sync.state.recoveries[0].cloud, remote);
    assert.deepEqual(h.guest, local);
  } finally {
    h.sync.dispose();
  }
});
test("choose local sends CAS against reviewed remote revision and preserves remote backup", async () => {
  const h = harness();
  try {
    const remote = createProject();
    h.db.set(A, row(remote, 3));
    h.sync.setAccount(account());
    await h.sync.enable();
    await h.sync.resolve("local");
    assert.equal(h.writes[0].mutation.expectedRevision, 3);
    assert.equal(h.db.get(A)!.revision, 4);
    assert.deepEqual(h.sync.state.recoveries[0].cloud, remote);
  } finally {
    h.sync.dispose();
  }
});
test("another device winning CAS surfaces conflict without silently overwriting", async () => {
  const h = harness();
  try {
    h.sync.setAccount(account());
    await h.sync.enable();
    const remote = clone(h.guest);
    remote.pet.name = "원격 수정";
    h.db.set(A, row(remote, 2));
    const local = clone(h.guest);
    local.pet.name = "내 수정";
    h.sync.write(local);
    await settle();
    assert.equal(h.sync.state.phase, "conflict");
    assert.equal(h.db.get(A)!.project.pet.name, "원격 수정");
    assert.equal(h.sync.state.local.pet.name, "내 수정");
  } finally {
    h.sync.dispose();
  }
});
test("offline pending survives reload, is account bound, and resumes only after explicit enable", async () => {
  const h = harness();
  let reloaded: ProjectSync | undefined;
  try {
    h.sync.setAccount(account());
    await h.sync.enable();
    h.online(false);
    const local = clone(h.guest);
    local.pet.name = "오프라인 수정";
    h.sync.write(local);
    const pending = h.sync.state;
    assert.equal(pending.phase, "pending");
    h.sync.dispose();
    reloaded = h.build();
    reloaded.setAccount(account());
    h.online(true);
    assert.equal(reloaded.state.local.pet.name, "오프라인 수정");
    assert.equal(h.writes.length, 1);
    await reloaded.enable();
    assert.equal(h.writes.length, 2);
    assert.equal(h.db.get(A)!.project.pet.name, "오프라인 수정");
  } finally {
    h.sync.dispose();
    reloaded?.dispose();
  }
});
test("lost response retries exact mutation id/payload even when newer edits arrive", async () => {
  const h = harness();
  try {
    const save = h.transport.save;
    let lose = true;
    h.transport.save = async (...args) => {
      const result = await save(...args);
      if (lose) {
        lose = false;
        throw Error("response lost");
      }
      return result;
    };
    h.sync.setAccount(account());
    await h.sync.enable();
    const first = clone(h.writes[0].mutation),
      newer = clone(h.guest);
    newer.pet.name = "더 새 친구";
    h.sync.write(newer);
    await settle();
    assert.equal(h.writes[1].mutation.mutationId, first.mutationId);
    assert.deepEqual(h.writes[1].mutation.project, first.project);
    assert.equal(h.db.get(A)!.revision, 2);
    assert.equal(h.db.get(A)!.project.pet.name, "더 새 친구");
  } finally {
    h.sync.dispose();
  }
});
test("account switch aborts outstanding work and restores guest, never copies A into B", async () => {
  const h = harness();
  try {
    const guest = clone(h.guest);
    let release!: (value: CloudRow | null) => void;
    h.transport.read = async () =>
      new Promise((resolve) => {
        release = resolve;
      });
    h.sync.setAccount(account());
    const enabling = h.sync.enable();
    h.sync.setAccount(account(B));
    release(row(createProject(), 2));
    await enabling;
    assert.equal(h.writes.length, 0);
    assert.equal(h.sync.state.account!.id, B);
    assert.equal(h.sync.state.enabled, false);
    assert.deepEqual(h.sync.state.local, guest);
    h.sync.setAccount(null);
    assert.deepEqual(h.current, guest);
  } finally {
    h.sync.dispose();
  }
});
test("logout during save ignores late result and leaves the original account queue recoverable", async () => {
  const h = harness();
  try {
    let release!: () => void;
    const save = h.transport.save;
    h.transport.save = async (...args) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return save(...args);
    };
    h.sync.setAccount(account());
    const enabling = h.sync.enable();
    await settle();
    h.sync.setAccount(null);
    release();
    await enabling;
    assert.equal(h.sync.state.phase, "guest");
    assert.equal(h.sync.state.accountWorkspace, false);
    assert.ok(JSON.parse(h.store.get(ACCOUNT_CACHE_PREFIX + A)!).pending);
  } finally {
    h.sync.dispose();
  }
});
test("paused sync keeps account edits local and logout returns unchanged guest", async () => {
  const h = harness();
  try {
    const guest = clone(h.guest);
    h.sync.setAccount(account());
    await h.sync.enable();
    h.sync.pause();
    const changed = clone(guest);
    changed.pet.name = "계정의 로컬 사본";
    h.sync.write(changed);
    await settle();
    assert.equal(h.writes.length, 1);
    h.sync.setAccount(null);
    assert.deepEqual(h.current, guest);
    h.sync.setAccount(account());
    assert.equal(h.current.pet.name, changed.pet.name);
    assert.equal(h.writes.length, 1);
  } finally {
    h.sync.dispose();
  }
});
test("invalid cached owner and malformed remote data are never applied", async () => {
  const h = harness();
  try {
    h.store.set(
      ACCOUNT_CACHE_PREFIX + A,
      JSON.stringify({ version: 1, owner: B }),
    );
    h.sync.setAccount(account());
    assert.equal(h.sync.state.phase, "error");
    assert.deepEqual(h.current, h.guest);
    assert.throws(() =>
      parseCloudRow({ project: {}, revision: 1, updated_at: "bad" }),
    );
  } finally {
    h.sync.dispose();
  }
});
test("OAuth callback removes auth parameters while preserving app route and rejects implicit token URLs", () => {
  const result = cleanAuthURL(
    new URL(
      "https://probius-ai.github.io/little-breath/?code=fixture&sb_flow_id=flow#rig",
    ),
  );
  assert.equal(result.code, "fixture");
  assert.equal(result.flowId, "flow");
  assert.equal(result.clean, "/little-breath/#rig");
  const error = cleanAuthURL(
    new URL(
      "https://probius-ai.github.io/little-breath/#access_token=fixture&refresh_token=fixture",
    ),
  );
  assert.equal(error.error, true);
  assert.equal(error.clean, "/little-breath/#garden");
});
test("GitHub provider tokens are excluded from tab session persistence", () => {
  assert.deepEqual(
    JSON.parse(
      stripProviderTokens(
        JSON.stringify({
          access_token: "app-session-fixture",
          provider_token: "github-fixture",
          provider_refresh_token: "github-refresh-fixture",
        }),
      ),
    ),
    { access_token: "app-session-fixture" },
  );
});

test("corrupt account cache blocks enabling instead of replacing it with guest data", async () => {
  const h = harness();
  try {
    const bad = JSON.stringify({ version: 1, owner: B });
    h.store.set(ACCOUNT_CACHE_PREFIX + A, bad);
    h.sync.setAccount(account());
    await h.sync.enable();
    assert.equal(h.sync.state.enabled, false);
    assert.equal(h.writes.length, 0);
    assert.equal(h.store.get(ACCOUNT_CACHE_PREFIX + A), bad);
  } finally {
    h.sync.dispose();
  }
});
test("storage quota failure pauses sync before the unpersisted edit can upload", async () => {
  const h = harness();
  try {
    h.sync.setAccount(account());
    await h.sync.enable();
    h.storage.setItem = () => {
      throw new DOMException("Quota full", "QuotaExceededError");
    };
    const changed = clone(h.guest);
    changed.pet.name = "보존해야 하는 친구";
    assert.throws(() => h.sync.write(changed));
    await settle();
    assert.equal(h.writes.length, 1);
    assert.equal(h.sync.state.enabled, false);
    assert.equal(h.sync.state.local.pet.name, changed.pet.name);
    assert.equal(h.sync.state.phase, "error");
  } finally {
    h.sync.dispose();
  }
});
test("quota failure while preserving conflict copies never replaces the visible local project", async () => {
  const h = harness();
  try {
    const remote = createProject();
    remote.pet.name = "remote";
    h.db.set(A, row(remote, 3));
    h.sync.setAccount(account());
    await h.sync.enable();
    const before = clone(h.sync.state.local);
    h.storage.setItem = () => {
      throw new DOMException("Quota full", "QuotaExceededError");
    };
    await h.sync.resolve("cloud");
    assert.deepEqual(h.sync.state.local, before);
    assert.ok(h.sync.state.conflict);
    assert.equal(h.writes.length, 0);
  } finally {
    h.sync.dispose();
  }
});

test("blocked second tab cannot read or overwrite an account cache", async () => {
  const h = harness();
  try {
    h.sync.setAccount(account());
    await h.sync.enable();
    h.online(false);
    const edit = clone(h.guest);
    edit.pet.name = "첫 탭의 미전송 사본";
    h.sync.write(edit);
    const before = h.store.get(ACCOUNT_CACHE_PREFIX + A);
    const other = h.build();
    try {
      other.setAccount(account(), false);
      await other.enable();
      const guestEdit = clone(h.guest);
      guestEdit.pet.name = "둘째 탭의 게스트";
      other.write(guestEdit);
      assert.equal(other.state.workspaceBlocked, true);
      assert.equal(h.store.get(ACCOUNT_CACHE_PREFIX + A), before);
      assert.equal(h.writes.length, 1);
    } finally {
      other.dispose();
    }
  } finally {
    h.sync.dispose();
  }
});
test("oversized edit arriving during save remains local and pauses instead of retrying forever", async () => {
  const h = harness();
  try {
    let release!: () => void;
    const save = h.transport.save;
    h.transport.save = async (...args) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return save(...args);
    };
    h.sync.setAccount(account());
    const enabling = h.sync.enable();
    await settle();
    const big = clone(h.guest);
    big.pet.strokes = Array.from({ length: 10 }, (_, i) => ({
      id: `large-${i}`,
      color: "#665744",
      width: 0.02,
      points: Array.from({ length: 12000 }, () => ({
        x: 0.1234567890123456,
        y: 0.9876543210987654,
        pressure: 0.1234567890123456,
      })),
    }));
    assert.throws(() => cloudProject(big));
    h.sync.write(big);
    release();
    await enabling;
    assert.equal(h.sync.state.enabled, false);
    assert.equal(h.sync.state.phase, "error");
    assert.match(h.sync.state.message, /5MB/);
    const cache = JSON.parse(h.store.get(ACCOUNT_CACHE_PREFIX + A)!);
    assert.equal(cache.revision, 1);
    assert.equal(cache.pending, null);
    assert.equal(cache.project.pet.strokes.length, 10);
  } finally {
    h.sync.dispose();
  }
});

test("server size/format rejection is permanent and preserves local data instead of retrying forever", async () => {
  const h = harness();
  try {
    h.transport.save = async () => {
      throw { code: "23514", message: "synthetic JSONB size constraint" };
    };
    h.sync.setAccount(account());
    await h.sync.enable();
    assert.equal(h.sync.state.enabled, false);
    assert.equal(h.sync.state.phase, "error");
    assert.equal(
      JSON.parse(h.store.get(ACCOUNT_CACHE_PREFIX + A)!).pending,
      null,
    );
    assert.deepEqual(h.sync.state.local.pet, h.guest.pet);
  } finally {
    h.sync.dispose();
  }
});

test("oversized local conflict resolution retains both choices and the original revision", async () => {
  const h = harness();
  try {
    const remote = createProject();
    remote.pet.name = "원격 사본";
    h.db.set(A, row(remote, 5));
    h.sync.setAccount(account());
    await h.sync.enable();
    const big = clone(h.guest);
    big.pet.strokes = Array.from({ length: 10 }, (_, i) => ({
      id: `large-conflict-${i}`,
      color: "#665744",
      width: 0.02,
      points: Array.from({ length: 12000 }, () => ({
        x: 0.1234567890123456,
        y: 0.9876543210987654,
        pressure: 0.1234567890123456,
      })),
    }));
    h.sync.write(big);
    const before = h.sync.state;
    await h.sync.resolve("local");
    assert.equal(h.sync.state.revision, before.revision);
    assert.deepEqual(h.sync.state.conflict, before.conflict);
    assert.equal(h.sync.state.recoveries.length, 0);
    assert.equal(h.sync.state.local.pet.strokes.length, 10);
    assert.match(h.sync.state.message, /5MB/);
    assert.equal(h.writes.length, 0);
    await h.sync.resolve("cloud");
    assert.equal(h.sync.state.local.pet.name, "원격 사본");
    assert.equal(h.sync.state.recoveries[0].local.pet.strokes.length, 10);
  } finally {
    h.sync.dispose();
  }
});
