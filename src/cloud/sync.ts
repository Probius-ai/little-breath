import { clone, validateProject, type Project } from "../project";

export const ACCOUNT_CACHE_PREFIX = "little-breath.account.v1.";
export const MAX_CLOUD_BYTES = 5 * 1024 * 1024;
export interface CloudRow {
  project: Project;
  revision: number;
  updated_at: string;
}
export interface Mutation {
  project: Project;
  expectedRevision: number;
  mutationId: string;
}
export interface CloudTransport {
  read(owner: string, signal: AbortSignal): Promise<CloudRow | null>;
  save(
    owner: string,
    mutation: Mutation,
    signal: AbortSignal,
  ): Promise<CloudRow & { status: "saved" | "conflict" }>;
}
export interface Account {
  id: string;
  label: string;
}
export interface Recovery {
  savedAt: string;
  local: Project;
  cloud: Project;
}
interface Cache {
  version: 1;
  owner: string;
  project: Project;
  revision: number;
  base: Project | null;
  pending: Mutation | null;
  conflict: CloudRow | null;
  recoveries: Recovery[];
}
export type SyncPhase =
  "guest" | "paused" | "checking" | "synced" | "pending" | "conflict" | "error";
export interface SyncState {
  account: Account | null;
  enabled: boolean;
  phase: SyncPhase;
  message: string;
  revision: number;
  local: Project;
  conflict: CloudRow | null;
  recoveries: Recovery[];
  accountWorkspace: boolean;
  workspaceBlocked: boolean;
}
interface Options {
  storage: Pick<Storage, "getItem" | "setItem">;
  transport: CloudTransport;
  getGuest(): Project;
  saveGuest(project: Project): void;
  applyProject(project: Project): void;
  changed(state: SyncState): void;
  online?: () => boolean;
  uuid?: () => string;
}
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const revisionOK = (n: unknown): n is number =>
  Number.isSafeInteger(n) && (n as number) >= 0;
export function cloudProject(value: unknown): Project {
  const project = validateProject(value);
  if (
    new TextEncoder().encode(JSON.stringify(project)).length > MAX_CLOUD_BYTES
  )
    throw new Error(
      "클라우드 저장은 5MB 이하만 가능해요. 파일로 내보내 주세요.",
    );
  return project;
}
export function sameProject(a: Project, b: Project): boolean {
  // Local save timestamps are not conflict revisions or user edits.
  return (
    JSON.stringify({ ...a, updatedAt: "" }) ===
    JSON.stringify({ ...b, updatedAt: "" })
  );
}
export function parseCloudRow(value: unknown): CloudRow {
  const row = value as CloudRow;
  if (
    !row ||
    !revisionOK(row.revision) ||
    row.revision < 1 ||
    typeof row.updated_at !== "string" ||
    !Number.isFinite(Date.parse(row.updated_at))
  )
    throw new Error("클라우드 저장 형식을 확인하지 못했어요.");
  return {
    project: cloudProject(row.project),
    revision: row.revision,
    updated_at: row.updated_at,
  };
}
function readCache(storage: Options["storage"], owner: string): Cache | null {
  const text = storage.getItem(ACCOUNT_CACHE_PREFIX + owner);
  if (!text) return null;
  const c = JSON.parse(text) as Cache;
  if (
    c.version !== 1 ||
    c.owner !== owner ||
    !revisionOK(c.revision) ||
    !Array.isArray(c.recoveries)
  )
    throw new Error(
      "계정의 로컬 사본을 읽지 못했어요. 저장소를 지우지 말고 파일로 백업해 주세요.",
    );
  const pending = c.pending;
  if (
    pending &&
    (!revisionOK(pending.expectedRevision) ||
      !uuidPattern.test(pending.mutationId))
  )
    throw new Error("대기 중인 저장 사본을 읽지 못했어요.");
  return {
    version: 1,
    owner,
    project: validateProject(c.project),
    revision: c.revision,
    base: c.base ? validateProject(c.base) : null,
    pending: pending
      ? {
          project: cloudProject(pending.project),
          expectedRevision: pending.expectedRevision,
          mutationId: pending.mutationId,
        }
      : null,
    conflict: c.conflict ? parseCloudRow(c.conflict) : null,
    recoveries: c.recoveries.map((r) => ({
      savedAt: String(r.savedAt),
      local: validateProject(r.local),
      cloud: validateProject(r.cloud),
    })),
  };
}

function permanentFailure(error: unknown): string | null {
  const code = (error as { code?: string } | null)?.code;
  if (code === "23514" || code === "22023" || code === "INVALID_PROJECT")
    return "서버의 프로젝트 크기·형식 제한에 맞지 않아 동기화를 멈췄어요. 파일로 백업한 뒤 그림을 줄이거나 올바른 파일을 불러와 주세요.";
  if (code === "42501" || code === "PGRST301" || code === "PGRST302")
    return "계정 저장 권한을 확인하지 못해 동기화를 멈췄어요. 다시 로그인해 주세요.";
  if (code === "P0002")
    return "기존 클라우드 사본이 없어 동기화를 멈췄어요. 로컬 사본을 파일로 백업한 뒤 계정 저장소를 확인해 주세요.";
  return null;
}

/** Consent and all persisted work are scoped to one auth.uid. No session/token is stored here. */
export class ProjectSync {
  private account: Account | null = null;
  private enabled = false;
  private cacheBlocked = false;
  private cache: Cache | null = null;
  private local: Project;
  private phase: SyncPhase = "guest";
  private message = "이 브라우저에 저장됨";
  private epoch = 0;
  private request: AbortController | null = null;
  private busy = false;
  private ready = false;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private retryDelay = 1500;
  constructor(private options: Options) {
    this.local = validateProject(options.getGuest());
  }
  get state(): SyncState {
    return {
      account: this.account ? { ...this.account } : null,
      enabled: this.enabled,
      phase: this.phase,
      message: this.message,
      revision: this.cache?.revision ?? 0,
      local: clone(this.local),
      conflict: this.cache?.conflict ? clone(this.cache.conflict) : null,
      recoveries: clone(this.cache?.recoveries ?? []),
      accountWorkspace: !!this.cache,
      workspaceBlocked: this.cacheBlocked,
    };
  }
  private notify() {
    this.options.changed(this.state);
  }
  private cancel() {
    this.epoch++;
    this.request?.abort();
    this.request = null;
    this.busy = false;
    this.ready = false;
    clearTimeout(this.retryTimer);
  }
  private persist() {
    try {
      if (this.cache)
        this.options.storage.setItem(
          ACCOUNT_CACHE_PREFIX + this.cache.owner,
          JSON.stringify(this.cache),
        );
    } catch {
      this.cancel();
      this.enabled = false;
      const message =
        "기기 저장 공간이 부족해 동기화를 멈췄어요. 지금 프로젝트를 파일로 내보내 주세요.";
      this.error(message);
      throw new Error(message);
    }
  }
  private error(message: string) {
    this.phase = "error";
    this.message = message;
    this.notify();
  }
  setAccount(account: Account | null, writable = true) {
    if (account?.id === this.account?.id && !this.cacheBlocked) return;
    this.cancel();
    this.enabled = false;
    this.account = account;
    this.cache = null;
    this.cacheBlocked = false;
    this.local = validateProject(this.options.getGuest());
    if (account && !writable) {
      this.cacheBlocked = true;
      this.options.applyProject(clone(this.local));
      this.error(
        "다른 탭이 이 계정을 사용 중이거나 이 브라우저가 안전한 탭 잠금을 지원하지 않아요. 다른 탭을 닫고 다시 확인해 주세요. 지금은 게스트로 사용할 수 있어요.",
      );
      return;
    }
    if (account) {
      if (!uuidPattern.test(account.id)) {
        this.account = null;
        this.error("로그인 계정을 확인하지 못했어요.");
        return;
      }
      try {
        this.cache = readCache(this.options.storage, account.id);
        if (this.cache) this.local = clone(this.cache.project);
      } catch {
        this.cacheBlocked = true;
        this.options.applyProject(clone(this.local));
        this.error(
          "계정의 로컬 사본을 읽지 못했어요. 저장소를 지우지 말고 파일로 백업해 주세요.",
        );
        return;
      }
    }
    this.phase = account ? "paused" : "guest";
    this.message = account
      ? "로그인됨 · 동기화는 꺼져 있어요"
      : "이 브라우저에 저장됨";
    this.options.applyProject(clone(this.local));
    this.notify();
  }
  write(project: Project) {
    this.local = validateProject(project);
    if (!this.cache) {
      this.options.saveGuest(this.local);
      this.notify();
      return;
    }
    this.cache.project = clone(this.local);
    this.persist();
    // Never change a sent mutation: retry that exact id/payload after a lost response.
    if (
      this.enabled &&
      this.ready &&
      !this.cache.conflict &&
      !this.cache.pending &&
      (!this.cache.base || !sameProject(this.local, this.cache.base))
    ) {
      try {
        this.queue();
      } catch (error) {
        this.cancel();
        this.enabled = false;
        this.error((error as Error).message);
        return;
      }
    }
    this.persist();
    this.notify();
    if (this.enabled && this.ready) void this.flush();
  }
  private queue() {
    if (!this.cache) return;
    this.cache.pending = {
      project: cloudProject(this.local),
      expectedRevision: this.cache.revision,
      mutationId: (this.options.uuid ?? (() => crypto.randomUUID()))(),
    };
    this.phase = "pending";
    this.message = "기기에 저장됨 · 클라우드 저장 대기";
  }
  async enable() {
    if (!this.account || this.enabled || this.cacheBlocked) return;
    try {
      cloudProject(this.local);
      if (!this.cache)
        this.cache = {
          version: 1,
          owner: this.account.id,
          project: clone(this.local),
          revision: 0,
          base: null,
          pending: null,
          conflict: null,
          recoveries: [],
        };
      this.persist();
    } catch (e) {
      this.error((e as Error).message);
      return;
    }
    this.enabled = true;
    await this.refresh();
  }
  pause() {
    this.cancel();
    this.enabled = false;
    this.phase = this.account ? "paused" : "guest";
    this.message = this.account
      ? "동기화 꺼짐 · 계정 사본은 이 기기에 보관돼요"
      : "이 브라우저에 저장됨";
    this.notify();
  }
  private isCurrent(owner: string, epoch: number) {
    return (
      this.enabled &&
      this.account?.id === owner &&
      this.cache?.owner === owner &&
      this.epoch === epoch
    );
  }
  private online() {
    return this.options.online?.() ?? navigator.onLine;
  }
  private later() {
    clearTimeout(this.retryTimer);
    if (!this.enabled || !this.online() || this.cache?.conflict) return;
    this.retryTimer = setTimeout(() => void this.retry(), this.retryDelay);
    this.retryDelay = Math.min(this.retryDelay * 2, 30000);
  }
  async retry() {
    if (!this.enabled || this.busy) return;
    if (!this.ready) await this.refresh();
    else await this.flush();
  }
  async refresh() {
    if (!this.enabled || !this.cache || this.busy) return;
    if (!this.online()) {
      this.phase = "pending";
      this.message = "오프라인 · 이 기기의 사본을 보관하고 있어요";
      this.notify();
      return;
    }
    const owner = this.cache.owner,
      epoch = this.epoch;
    this.request = new AbortController();
    this.busy = true;
    this.phase = "checking";
    this.message = "클라우드 사본 확인 중…";
    this.notify();
    try {
      const row = await this.options.transport.read(owner, this.request.signal);
      if (!this.isCurrent(owner, epoch)) return;
      this.ready = true;
      // Pending requests may already have committed. Replay first using their original id/revision.
      if (this.cache!.pending) {
        this.cache!.conflict = null;
      } else if (row && sameProject(this.local, row.project)) {
        this.cache!.revision = row.revision;
        this.cache!.base = clone(row.project);
        this.cache!.conflict = null;
      } else if (row && row.revision !== this.cache!.revision) {
        this.cache!.conflict = row;
        this.phase = "conflict";
        this.message = "다른 사본이 있어요 · 덮어쓰지 않고 기다리는 중";
      } else if (!row && this.cache!.revision > 0) {
        this.ready = false;
        throw { code: "P0002" };
      } else this.queue();
      this.persist();
      if (!this.cache!.conflict && !this.cache!.pending) {
        this.phase = "synced";
        this.message = "클라우드에 저장됨";
      }
      this.notify();
    } catch (e) {
      if (!this.isCurrent(owner, epoch)) return;
      const permanent = permanentFailure(e);
      if (permanent) {
        this.cancel();
        this.enabled = false;
        this.error(permanent);
        return;
      }
      this.phase = "pending";
      this.message = "클라우드 연결을 기다려요 · 로컬 사본은 유지돼요";
      this.notify();
      this.later();
    } finally {
      if (this.epoch === epoch) {
        this.busy = false;
        this.request = null;
      }
    }
    if (this.isCurrent(owner, epoch) && this.ready && !this.cache?.conflict)
      await this.flush();
  }
  async flush() {
    if (
      !this.enabled ||
      !this.ready ||
      this.busy ||
      !this.cache ||
      this.cache.conflict
    )
      return;
    if (!this.cache.pending) return;
    if (!this.online()) {
      this.phase = "pending";
      this.message = "오프라인 · 다시 연결되면 저장해요";
      this.notify();
      return;
    }
    const owner = this.cache.owner,
      epoch = this.epoch,
      mutation = clone(this.cache.pending);
    this.request = new AbortController();
    this.busy = true;
    this.phase = "pending";
    this.message = "기기에 저장됨 · 클라우드에 저장 중…";
    this.notify();
    try {
      const result = await this.options.transport.save(
        owner,
        mutation,
        this.request.signal,
      );
      if (!this.isCurrent(owner, epoch)) return;
      if (result.status === "conflict") {
        this.cache!.conflict = result;
        this.cache!.pending = null;
        this.phase = "conflict";
        this.message = "다른 기기에서 바뀌었어요 · 두 사본을 확인해 주세요";
      } else {
        this.cache!.revision = result.revision;
        this.cache!.base = clone(result.project);
        this.cache!.pending = null;
        if (!sameProject(this.local, result.project)) {
          try {
            this.queue();
          } catch (error) {
            this.persist();
            this.cancel();
            this.enabled = false;
            this.error((error as Error).message);
            return;
          }
        } else {
          this.phase = "synced";
          this.message = "클라우드에 저장됨";
        }
        this.retryDelay = 1500;
      }
      this.persist();
      this.notify();
    } catch (error) {
      if (!this.isCurrent(owner, epoch)) return;
      const permanent = permanentFailure(error);
      if (permanent) {
        this.cache!.pending = null;
        try {
          this.persist();
        } catch {
          return;
        }
        this.cancel();
        this.enabled = false;
        this.error(permanent);
        return;
      }
      this.phase = "pending";
      this.message =
        "저장 응답을 기다려요 · 같은 사본으로 안전하게 다시 시도해요";
      this.notify();
      this.later();
    } finally {
      if (this.epoch === epoch) {
        this.busy = false;
        this.request = null;
      }
    }
    if (
      this.isCurrent(owner, epoch) &&
      this.cache?.pending &&
      this.cache.pending.mutationId !== mutation.mutationId
    )
      await this.flush();
  }
  async resolve(choice: "local" | "cloud") {
    if (!this.enabled || !this.cache?.conflict || this.busy) return;
    const before = clone(this.cache),
      row = this.cache.conflict;
    try {
      // Validate the proposed upload before changing conflict/revision state.
      if (choice === "local") cloudProject(this.local);
      this.cache.recoveries.push({
        savedAt: new Date().toISOString(),
        local: clone(this.local),
        cloud: clone(row.project),
      });
      this.cache.revision = row.revision;
      this.cache.base = clone(row.project);
      this.cache.conflict = null;
      this.cache.pending = null;
      if (choice === "cloud") this.cache.project = clone(row.project);
      else this.queue();
      this.persist();
    } catch (error) {
      this.cache = before;
      this.error(
        error instanceof Error
          ? error.message
          : "두 사본을 보관하지 못했어요. 먼저 두 파일을 내려받아 주세요.",
      );
      return;
    }
    if (choice === "cloud") {
      this.local = clone(row.project);
      this.options.applyProject(clone(this.local));
      this.phase = "synced";
      this.message = "클라우드 사본을 열었어요 · 이전 사본도 보관됨";
    }
    this.notify();
    await this.flush();
  }
  dispose() {
    this.cancel();
  }
}
