import {
  createClient,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import {
  CLOUD_URL,
  CLOUD_PUBLISHABLE_KEY,
  AUTH_RETURN_URL,
  AUTH_STORAGE_KEY,
} from "./config";
import {
  cloudProject,
  parseCloudRow,
  type Account,
  type CloudTransport,
  type Mutation,
} from "./sync";

export function stripProviderTokens(value: string): string {
  try {
    const session = JSON.parse(value);
    if (session && typeof session === "object") {
      delete session.provider_token;
      delete session.provider_refresh_token;
      return JSON.stringify(session);
    }
  } catch {
    /* PKCE verifier values may be plain strings. */
  }
  return value;
}
export function cleanAuthURL(url: URL): {
  code: string | null;
  flowId: string | null;
  error: boolean;
  clean: string;
} {
  const code = url.searchParams.get("code"),
    flowId = url.searchParams.get("sb_flow_id");
  const fragment = new URLSearchParams(url.hash.slice(1));
  const error =
    url.searchParams.has("error") ||
    fragment.has("error") ||
    fragment.has("access_token");
  for (const key of [
    "code",
    "sb_flow_id",
    "error",
    "error_code",
    "error_description",
  ])
    url.searchParams.delete(key);
  if (
    fragment.has("error") ||
    fragment.has("access_token") ||
    fragment.has("refresh_token")
  )
    url.hash = "garden";
  return { code, flowId, error, clean: url.pathname + url.search + url.hash };
}
function accountOf(session: Session | null): Account | null {
  if (!session) return null;
  const name: unknown = session.user.user_metadata?.user_name;
  return {
    id: session.user.id,
    label: typeof name === "string" ? name.slice(0, 80) : "GitHub 사용자",
  };
}
export class CloudClient implements CloudTransport {
  readonly client: SupabaseClient;
  private authUnsubscribe?: () => void;
  private authEpoch = 0;
  constructor(storage: Storage = sessionStorage) {
    this.client = createClient(CLOUD_URL, CLOUD_PUBLISHABLE_KEY, {
      auth: {
        flowType: "pkce",
        detectSessionInUrl: false,
        persistSession: true,
        storageKey: AUTH_STORAGE_KEY,
        storage: {
          getItem: (key) => storage.getItem(key),
          setItem: (key, value) =>
            storage.setItem(key, stripProviderTokens(value)),
          removeItem: (key) => storage.removeItem(key),
        },
      },
    });
  }
  async initialize(
    onAccount: (account: Account | null) => void,
  ): Promise<string | null> {
    const callback = cleanAuthURL(new URL(location.href));
    // Consume and remove OAuth query/fragment before any #garden navigation can erase it.
    history.replaceState(null, "", callback.clean);
    const { data } = this.client.auth.onAuthStateChange(() => {
      // SDK BroadcastChannel events may describe another tab's session. Resolve only
      // this tab's own sessionStorage after leaving the auth lock callback.
      const epoch = ++this.authEpoch;
      setTimeout(() => {
        void this.client.auth.getSession().then(({ data: own, error }) => {
          if (!error && epoch === this.authEpoch)
            onAccount(accountOf(own.session));
        });
      }, 0);
    });
    this.authUnsubscribe = () => data.subscription.unsubscribe();
    if (callback.error)
      return "GitHub 로그인이 완료되지 않았어요. 로컬 친구는 그대로예요. 다시 로그인해 주세요.";
    if (callback.code) {
      const { error } = await this.client.auth.exchangeCodeForSession(
        callback.code,
        callback.flowId ? { flowId: callback.flowId } : undefined,
      );
      if (error)
        return "로그인 연결이 만료되었거나 취소되었어요. 같은 탭에서 다시 로그인해 주세요.";
    }
    const { data: sessionData, error } = await this.client.auth.getSession();
    if (error)
      return "로그인 상태를 확인하지 못했어요. 로컬 모드로 계속 사용할 수 있어요.";
    onAccount(accountOf(sessionData.session));
    return null;
  }
  async currentAccount(): Promise<Account | null> {
    const { data, error } = await this.client.auth.getSession();
    if (error) throw new Error("이 탭의 로그인 상태를 확인하지 못했어요.");
    return accountOf(data.session);
  }
  async login() {
    const { error } = await this.client.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: AUTH_RETURN_URL, scopes: "read:user user:email" },
    });
    if (error)
      throw new Error(
        "GitHub 로그인 연결을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.",
      );
  }
  async logout() {
    const { error } = await this.client.auth.signOut({ scope: "local" });
    if (error)
      throw new Error(
        "로그아웃을 완료하지 못했어요. 연결을 확인해 다시 시도해 주세요.",
      );
  }
  private async scoped(owner: string) {
    const { data, error } = await this.client.auth.getSession();
    if (error || data.session?.user.id !== owner)
      throw new Error("로그인 계정이 바뀌었어요. 다시 연결해 주세요.");
    const token = data.session.access_token;
    // Capture this request's JWT. A subsequent account switch cannot send A's project as B.
    return createClient(CLOUD_URL, CLOUD_PUBLISHABLE_KEY, {
      accessToken: async () => token,
    });
  }
  async read(owner: string, signal: AbortSignal) {
    const client = await this.scoped(owner);
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const { data, error } = await client
      .from("private_projects")
      .select("project,revision,updated_at")
      .eq("user_id", owner)
      .abortSignal(AbortSignal.any([signal, AbortSignal.timeout(15_000)]))
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    try {
      return parseCloudRow(data);
    } catch {
      throw { code: "INVALID_PROJECT" };
    }
  }
  async save(owner: string, mutation: Mutation, signal: AbortSignal) {
    const client = await this.scoped(owner);
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const { data, error } = await client
      .rpc("save_project", {
        p_project: cloudProject(mutation.project),
        p_expected_revision: mutation.expectedRevision,
        p_mutation_id: mutation.mutationId,
      })
      .abortSignal(AbortSignal.any([signal, AbortSignal.timeout(15_000)]));
    if (error) throw error;
    if (data?.status !== "saved" && data?.status !== "conflict")
      throw new Error("저장 결과를 확인하지 못했어요.");
    try {
      return {
        ...parseCloudRow(data),
        status: data.status as "saved" | "conflict",
      };
    } catch {
      throw { code: "INVALID_PROJECT" };
    }
  }
  dispose() {
    this.authUnsubscribe?.();
  }
}
