import { downloadFile, type Project } from "../project";
import { escapeHtml as e } from "../icons";
import { type CloudClient } from "./client";
import { type ProjectSync, type SyncState } from "./sync";
interface Options {
  sync: ProjectSync;
  client: CloudClient;
  modal(title: string, body: string): void;
  flushLocal(): void;
  reconnectAccount(): Promise<void>;
  emergencyCopy(): Project | null;
  toast(message: string): void;
}
const time = (value: string) => new Date(value).toLocaleString("ko-KR");
export class CloudAccountUI {
  private working = false;
  private actionEpoch = 0;
  constructor(private options: Options) {}
  open() {
    try {
      this.options.flushLocal();
    } catch (error) {
      this.options.toast((error as Error).message);
    }
    this.options.modal("어디서든, 같은 친구", '<div id="cloud-panel"></div>');
    this.update(this.options.sync.state);
  }
  update(state: SyncState) {
    const pill = document.querySelector("#cloud-status");
    if (pill)
      pill.textContent = state.account
        ? state.enabled
          ? "동기화"
          : "계정"
        : "로그인";
    const status = document.querySelector("#save-status");
    if (status && state.accountWorkspace) status.textContent = state.message;
    const panel = document.querySelector<HTMLDivElement>("#cloud-panel");
    if (!panel) return;
    const consent =
      !!panel.querySelector<HTMLInputElement>("#cloud-consent")?.checked;
    const focused = document.activeElement as HTMLElement | null;
    const hadPanelFocus = !!focused && panel.contains(focused);
    const focus = focused?.dataset.cloud;
    const focusId = focused?.id;
    const account = state.account;
    panel.innerHTML = `<p class="modal-intro">로그인 없이도 이 브라우저에서 계속 함께할 수 있어요. 다른 기기에서 같은 친구를 만나고 싶을 때만 연결해 주세요.</p>
      <div class="cloud-account"><span class="cloud-mark" aria-hidden="true">☁</span><div><strong>${account ? e(account.label) : "나만의 작은 정원"}</strong><p>${account ? "GitHub로 로그인됨" : "현재는 게스트 · 기기에만 저장"}</p></div></div>
      <p class="cloud-status-line" role="status">${e(state.message)}</p>
      ${
        !account
          ? `<button type="button" data-cloud="login" class="primary full-width" ${this.working ? "disabled" : ""}>GitHub로 로그인</button><p class="inspector-help">GitHub 기본 프로필과 이메일로 계정을 구분해요. 저장소 접근 권한은 요청하지 않아요. 로그인만으로 그림은 업로드되지 않아요. 로그인은 이 탭을 닫을 때까지 유지돼요.</p>`
          : `
      <div class="privacy-note cloud-disclosure"><p><strong>동기화를 켜면 전송되는 정보</strong><br>그림의 선·관절·이름, 탄생 날짜 또는 계절·도시·성격, 돌봄 횟수·성장 기록, 움직임 설정, 생성·수정 시간이 작은숨 전용 Supabase 저장소(서울 리전)에 내 계정으로 저장돼요. 사진 밑그림, 날씨 응답, API 키는 포함하지 않아요.</p></div>
      ${state.workspaceBlocked ? `<button type="button" data-cloud="reconnect" class="outline full-width">계정 연결 다시 확인</button>` : !state.enabled ? `<label class="cloud-consent"><input id="cloud-consent" type="checkbox" ${consent ? "checked" : ""}>위 정보를 Supabase에 저장하고 다른 기기에서 불러오는 데 동의해요</label><button type="button" data-cloud="enable" class="primary full-width" ${!consent || this.working ? "disabled" : ""}>${state.accountWorkspace ? "동기화 다시 켜기" : "동기화 켜기"}</button><p class="inspector-help">처음 연결할 때 이 기기의 친구를 계정 사본으로 복사해요. 기존 게스트 사본은 그대로 보관돼요. 다른 클라우드 사본이 있으면 먼저 선택할 수 있어요.</p>` : `<div class="cloud-actions"><button type="button" data-cloud="retry" class="outline" ${this.working || state.phase === "checking" ? "disabled" : ""}>지금 확인</button><button type="button" data-cloud="pause" class="quiet">동기화 끄기</button></div>`}
      <button type="button" data-cloud="logout" class="text-link" >로그아웃 · 게스트로 돌아가기</button>
      <p class="inspector-help">로그아웃하면 계정 사본은 별도 보관되고 기존 게스트 친구가 열려요. 공유 기기에서는 사용 후 로그아웃해 주세요. 동기화를 끄거나 로그아웃해도 클라우드 사본은 삭제되지 않아요.</p>`
      }
      ${state.conflict ? `<section class="cloud-conflict" aria-labelledby="cloud-conflict-title"><h3 id="cloud-conflict-title">두 사본 중 어떤 친구를 이어갈까요?</h3><p>자동으로 덮어쓰지 않았어요. 선택하면 두 사본을 이 기기에 보관해요. 먼저 파일로도 저장할 수 있어요.</p><div class="cloud-copy"><strong>이 기기 · ${e(state.local.pet.name)}</strong><span>${e(time(state.local.updatedAt))}</span><button type="button" data-cloud="download-local" class="text-link">기기 사본 내려받기</button></div><div class="cloud-copy"><strong>클라우드 · ${e(state.conflict.project.pet.name)}</strong><span>서버 수정 ${e(time(state.conflict.updated_at))} · 버전 ${state.conflict.revision}</span><button type="button" data-cloud="download-cloud" class="text-link">클라우드 사본 내려받기</button></div><div class="cloud-actions"><button type="button" data-cloud="use-local" class="outline" ${!state.enabled || this.working ? "disabled" : ""}>이 기기 사본으로 저장</button><button type="button" data-cloud="use-cloud" class="primary" ${!state.enabled || this.working ? "disabled" : ""}>클라우드 사본 열기</button></div></section>` : ""}
      ${this.options.emergencyCopy() ? `<div class="cloud-conflict"><p>기기 저장에 실패한 사본을 임시로 보관하고 있어요. 이 탭을 닫기 전에 파일로 저장해 주세요.</p><button type="button" data-cloud="emergency" class="outline">임시 사본 내려받기</button></div>` : ""}
      ${state.recoveries.length ? `<details class="cloud-recoveries"><summary>충돌 전 사본 ${state.recoveries.length}쌍 보관 중</summary><p>프로젝트 파일로 내려받은 뒤 ‘불러오기’에서 복원할 수 있어요.</p>${state.recoveries.map((r, i) => `<div><span>${e(time(r.savedAt))}</span><button type="button" data-cloud="recovery-local-${i}" class="text-link">기기 사본</button><button type="button" data-cloud="recovery-cloud-${i}" class="text-link">클라우드 사본</button></div>`).join("")}</details>` : ""}`;
    panel
      .querySelector<HTMLInputElement>("#cloud-consent")
      ?.addEventListener("change", (ev) => {
        panel.querySelector<HTMLButtonElement>(
          '[data-cloud="enable"]',
        )!.disabled = !(ev.target as HTMLInputElement).checked || this.working;
      });
    panel
      .querySelectorAll<HTMLButtonElement>("[data-cloud]")
      .forEach((b) =>
        b.addEventListener("click", () => void this.action(b.dataset.cloud!)),
      );
    if (hadPanelFocus) {
      const matching = focus
        ? panel.querySelector<HTMLElement>(
            `[data-cloud="${focus}"]:not([disabled])`,
          )
        : focusId
          ? panel.querySelector<HTMLElement>(`#${focusId}`)
          : null;
      (
        matching ??
        panel.querySelector<HTMLElement>(
          "button:not([disabled]),input:not([disabled])",
        ) ??
        document.querySelector<HTMLElement>("#modal-close")
      )?.focus();
    }
  }
  private download(value: unknown, label: string) {
    downloadFile(
      JSON.stringify(value, null, 2),
      `little-breath-${label}-${new Date().toISOString().slice(0, 10)}.json`,
    );
  }
  private async action(action: string) {
    const { sync, client } = this.options;
    const state = sync.state;
    if (action === "emergency") {
      const copy = this.options.emergencyCopy();
      if (copy) this.download(copy, "unsaved-recovery");
      return;
    }
    if (action === "download-local") {
      this.download(state.local, "local");
      return;
    }
    if (action === "download-cloud" && state.conflict) {
      this.download(state.conflict.project, "cloud");
      return;
    }
    if (action.startsWith("recovery-")) {
      const [, side, i] = action.split("-");
      const recovery = state.recoveries[Number(i)];
      if (recovery && (side === "local" || side === "cloud"))
        this.download(recovery[side], `recovery-${side}-${i}`);
      return;
    }
    if (action === "pause") {
      this.actionEpoch++;
      sync.pause();
      this.working = false;
      this.update(sync.state);
      return;
    }
    if (action === "logout" && this.working) {
      sync.pause();
      this.working = false;
    }
    if (this.working) return;
    if (
      action === "enable" &&
      !document.querySelector<HTMLInputElement>("#cloud-consent")?.checked
    )
      return;
    const epoch = ++this.actionEpoch;
    this.working = true;
    try {
      this.options.flushLocal();
      this.update(sync.state);
      if (action === "login") await client.login();
      if (action === "reconnect") await this.options.reconnectAccount();
      if (action === "enable") await sync.enable();
      if (action === "pause") sync.pause();
      if (action === "retry") await sync.refresh();
      if (action === "use-local") await sync.resolve("local");
      if (action === "use-cloud") await sync.resolve("cloud");
      if (action === "logout") {
        sync.pause();
        await client.logout();
      }
    } catch (error) {
      this.options.toast((error as Error).message);
    } finally {
      if (epoch === this.actionEpoch) {
        this.working = false;
        this.update(sync.state);
      }
    }
  }
}
