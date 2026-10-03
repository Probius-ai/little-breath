import {
  CareGesture,
  clampPlacement,
  projectDrop,
  type CareItem,
} from "./care-placement";
import { worldBounds } from "./world";
import { FOOD_OPTIONS } from "./growth";
import type { Point } from "./engine/index";
import { icon } from "./icons";

export interface CareTrayState {
  open: boolean;
  selected: CareItem | null;
}
export interface CareTrayOptions {
  state: CareTrayState;
  onPlace: (item: CareItem, point: Point) => void;
  onMessage?: (message: string) => void;
}
const itemInfo = (item: CareItem) =>
  item === "water"
    ? { name: "물", icon: "💧" }
    : FOOD_OPTIONS.find((f) => f.id === item)!;
export function careTrayMarkup(state: CareTrayState): string {
  return `<div class="care-drawer ${state.open ? "open" : ""}"><button id="care-tray-toggle" class="care-tray-tab" aria-expanded="${state.open}" aria-controls="care-tray" aria-label="돌봄 서랍 ${state.open ? "닫기" : "열기"}">${icon("food")}<span>돌봄 서랍</span>${icon("arrow", "drawer-arrow")}</button><aside id="care-tray" aria-label="먹이와 물 돌봄 서랍" ${state.open ? "" : "hidden"}><div class="care-tray-heading"><span>작은 마음을 놓아요</span><span class="care-tray-spark">✦</span></div><div class="care-tray-items">${[...FOOD_OPTIONS.map((f) => ({ id: f.id, name: f.name, icon: f.icon, detail: `+${f.xp} XP` })), { id: "water", name: "물", icon: "💧", detail: "시원한 한 모금" }].map((f) => `<button type="button" class="care-tray-item" data-care-item="${f.id}" aria-label="${f.name} 선택해서 놓기" aria-pressed="false" aria-describedby="care-tray-instructions"><span class="care-item-symbol" aria-hidden="true">${f.icon}</span><span class="care-item-copy"><strong>${f.name}</strong><small>${f.detail}</small></span><span class="care-item-grip" aria-hidden="true">⠿</span></button>`).join("")}</div><p id="care-tray-instructions">정원으로 끌어 놓거나<br>선택한 뒤 정원을 눌러주세요</p></aside></div><div id="care-ground-guide" aria-hidden="true" hidden><span>걸을 수 있는 바닥</span></div><div id="care-drop-preview" aria-hidden="true" hidden><span class="care-preview-symbol"></span><span class="care-preview-ring"></span><span class="care-preview-label">여기에 놓여요</span></div><div id="care-drag-ghost" aria-hidden="true" hidden></div><div class="care-placement-instruction" id="care-placement-instruction" hidden>${icon("cursor")}<span>표시된 바닥에 놓여요 · 누르기 / Enter · Esc 취소</span><button type="button" id="care-placement-cancel" aria-label="먹이 또는 물 놓기 취소">${icon("close")}</button></div><div id="care-placement-status" class="sr-only" role="status" aria-live="polite"></div>`;
}

/** PointerEvents controller shared by touch, pen, and mouse; DOM listeners have one owner. */
export class CareTrayController {
  private abort = new AbortController();
  private gesture = new CareGesture();
  private scene: HTMLCanvasElement;
  private tray: HTMLElement;
  private drawer: HTMLElement;
  private toggle: HTMLButtonElement;
  private preview: HTMLElement;
  private ghost: HTMLElement;
  private guide: HTMLElement;
  private instructions: HTMLElement;
  private live: HTMLElement;
  private resize: ResizeObserver;
  private captured: Element | null = null;
  private target: Point | null = null;
  private ignorePointerClick = false;
  private lastRect: { width: number; height: number };
  constructor(
    private host: HTMLElement,
    private options: CareTrayOptions,
  ) {
    this.scene = host.querySelector("#scene")!;
    this.tray = host.querySelector("#care-tray")!;
    this.drawer = host.querySelector(".care-drawer")!;
    this.toggle = host.querySelector("#care-tray-toggle")!;
    this.preview = host.querySelector("#care-drop-preview")!;
    this.ghost = host.querySelector("#care-drag-ghost")!;
    this.guide = host.querySelector("#care-ground-guide")!;
    this.instructions = host.querySelector("#care-placement-instruction")!;
    this.live = host.querySelector("#care-placement-status")!;
    const rect = this.scene.getBoundingClientRect();
    this.lastRect = { width: rect.width, height: rect.height };
    const signal = this.abort.signal;
    this.toggle.addEventListener(
      "click",
      () => this.setOpen(!options.state.open),
      { signal },
    );
    host
      .querySelector("#care-placement-cancel")!
      .addEventListener("click", () => this.cancel(true), { signal });
    this.tray
      .querySelectorAll<HTMLButtonElement>("[data-care-item]")
      .forEach((button) => {
        button.addEventListener("dragstart", (ev) => ev.preventDefault(), {
          signal,
        });
        button.addEventListener(
          "pointerdown",
          (ev) => {
            if (!ev.isPrimary || ev.button !== 0 || this.gesture.active) return;
            if (
              this.gesture.begin(
                ev.pointerId,
                button.dataset.careItem as CareItem,
                { x: ev.clientX, y: ev.clientY },
              )
            ) {
              this.ignorePointerClick = true;
              ev.preventDefault();
              button.focus({ preventScroll: true });
              this.capture(button, ev.pointerId);
            }
          },
          { signal },
        );
        button.addEventListener(
          "click",
          (ev) => {
            if (ev.detail !== 0 && this.ignorePointerClick) {
              this.ignorePointerClick = false;
              return;
            }
            this.choose(button.dataset.careItem as CareItem, ev.detail === 0);
          },
          { signal },
        );
      });
    this.scene.addEventListener(
      "pointerdown",
      (ev) => {
        if (
          !this.options.state.selected ||
          !ev.isPrimary ||
          ev.button !== 0 ||
          this.gesture.active
        )
          return;
        if (
          this.gesture.begin(
            ev.pointerId,
            this.options.state.selected,
            { x: ev.clientX, y: ev.clientY },
            "scene",
          )
        ) {
          ev.preventDefault();
          this.capture(this.scene, ev.pointerId);
          this.updatePointer(ev);
        }
      },
      { signal },
    );
    this.scene.addEventListener(
      "pointermove",
      (ev) => {
        if (
          !this.gesture.active &&
          this.options.state.selected &&
          ev.isPrimary
        ) {
          this.target = projectDrop(
            { x: ev.clientX, y: ev.clientY },
            this.scene.getBoundingClientRect(),
          );
          this.showPreview(this.target, this.options.state.selected);
        }
      },
      { signal },
    );
    this.scene.addEventListener("keydown", (ev) => this.onKey(ev), { signal });
    document.addEventListener("pointermove", (ev) => this.updatePointer(ev), {
      signal,
      passive: false,
    });
    document.addEventListener("pointerup", (ev) => this.finishPointer(ev), {
      signal,
    });
    document.addEventListener(
      "pointercancel",
      (ev) => {
        if (this.gesture.active?.pointerId === ev.pointerId)
          this.cancel(false, "놓기가 취소됐어요. 다시 선택해 주세요.");
      },
      { signal },
    );
    document.addEventListener(
      "lostpointercapture",
      (ev) => {
        if (this.gesture.active?.pointerId === ev.pointerId) this.cancel(false);
      },
      { signal },
    );
    document.addEventListener(
      "keydown",
      (ev) => {
        if (ev.key === "Escape" && this.isPlacing) {
          ev.preventDefault();
          this.cancel(true, "놓기를 취소했어요.");
        } else if (
          ev.key === "Escape" &&
          this.options.state.open &&
          this.drawer.contains(document.activeElement)
        ) {
          ev.preventDefault();
          this.setOpen(false);
        }
      },
      { signal },
    );
    window.addEventListener("blur", () => this.cancel(false), { signal });
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.hidden) this.cancel(false);
      },
      { signal },
    );
    this.resize = new ResizeObserver(() => {
      const r = this.scene.getBoundingClientRect();
      if (
        Math.abs(r.width - this.lastRect.width) > 0.5 ||
        Math.abs(r.height - this.lastRect.height) > 0.5
      ) {
        const placing = this.isPlacing;
        this.cancel(
          false,
          placing
            ? "화면 크기가 바뀌어 놓기를 취소했어요. 다시 골라주세요."
            : "",
        );
        this.lastRect = { width: r.width, height: r.height };
      }
    });
    this.resize.observe(this.scene);
    this.host.classList.toggle("care-tray-open", this.options.state.open);
    this.paintSelection();
  }
  get isPlacing() {
    return !!this.options.state.selected || !!this.gesture.active;
  }
  reveal(item?: CareItem) {
    this.setOpen(true);
    if (item) {
      this.choose(item, false);
      this.tray
        .querySelector<HTMLButtonElement>(`[data-care-item="${item}"]`)
        ?.focus({ preventScroll: true });
    }
  }
  private setOpen(open: boolean) {
    this.options.state.open = open;
    this.tray.hidden = !open;
    this.drawer.classList.toggle("open", open);
    this.host.classList.toggle("care-tray-open", open);
    this.toggle.setAttribute("aria-expanded", String(open));
    this.toggle.setAttribute(
      "aria-label",
      `돌봄 서랍 ${open ? "닫기" : "열기"}`,
    );
    if (!open) {
      this.cancel(false);
      this.toggle.focus({ preventScroll: true });
    }
  }
  private capture(element: Element, pointerId: number) {
    this.captured = element;
    try {
      element.setPointerCapture(pointerId);
    } catch {
      this.cancel(false);
    }
  }
  private release() {
    const active = this.gesture.active;
    this.gesture.cancel();
    if (active && this.captured?.hasPointerCapture(active.pointerId)) {
      try {
        this.captured.releasePointerCapture(active.pointerId);
      } catch {
        /* Detached targets are already cancelled. */
      }
    }
    this.captured = null;
  }
  private isBlocked(client: Point) {
    const r = this.drawer.getBoundingClientRect();
    return (
      client.x >= r.left &&
      client.x <= r.right &&
      client.y >= r.top &&
      client.y <= r.bottom
    );
  }
  private updatePointer(ev: PointerEvent) {
    const active = this.gesture.active;
    if (!active || active.pointerId !== ev.pointerId) return;
    const p = { x: ev.clientX, y: ev.clientY };
    this.target = this.gesture.move(
      ev.pointerId,
      p,
      this.scene.getBoundingClientRect(),
      this.isBlocked(p),
    );
    const next = this.gesture.active;
    if (!next?.dragging) return;
    ev.preventDefault();
    this.options.state.selected = next.item;
    this.paintSelection();
    this.ghost.hidden = false;
    this.ghost.textContent = itemInfo(next.item).icon;
    this.ghost.style.left = `${ev.clientX}px`;
    this.ghost.style.top = `${ev.clientY}px`;
    this.ghost.classList.toggle("invalid", !this.target);
    this.showPreview(this.target, next.item);
  }
  private finishPointer(ev: PointerEvent) {
    const active = this.gesture.active;
    if (!active || active.pointerId !== ev.pointerId) return;
    const p = { x: ev.clientX, y: ev.clientY };
    const result = this.gesture.finish(
      ev.pointerId,
      p,
      this.scene.getBoundingClientRect(),
      this.isBlocked(p),
    );
    this.captured = null;
    this.ghost.hidden = true;
    if (result?.type === "select") {
      this.choose(result.item, false);
      return;
    }
    if (result?.type === "place") {
      this.commit(result.item, result.point);
      return;
    }
    this.cancel(
      false,
      active.dragging ? "정원 밖에서는 놓이지 않아요. 다시 끌어주세요." : "",
    );
  }
  private choose(item: CareItem, keyboard: boolean) {
    this.options.state.selected = item;
    const r = this.scene.getBoundingClientRect();
    this.target = clampPlacement(
      this.target ?? { x: r.width * 0.4, y: r.height * 0.82 },
      r.width,
      r.height,
    );
    this.paintSelection();
    this.showPreview(this.target, item);
    this.announce(
      `${itemInfo(item).name} 선택. 정원의 원하는 위치를 누르거나 방향키로 이동한 뒤 Enter를 누르세요. 높이는 걸을 수 있는 바닥으로 맞춰져요.`,
    );
    if (keyboard) this.scene.focus({ preventScroll: true });
  }
  private paintSelection() {
    const selected = this.options.state.selected;
    this.tray
      .querySelectorAll<HTMLButtonElement>("[data-care-item]")
      .forEach((button) => {
        const active = button.dataset.careItem === selected;
        button.classList.toggle("selected", active);
        button.setAttribute("aria-pressed", String(active));
      });
    this.instructions.hidden = !selected;
    this.scene.classList.toggle("placing-care", !!selected);
    this.host.classList.toggle("care-placement-active", !!selected);
    this.guide.hidden = !selected;
    if (selected) {
      const r = this.scene.getBoundingClientRect(),
        b = worldBounds(r.width);
      this.guide.style.left = `${b.minX}px`;
      this.guide.style.width = `${b.maxX - b.minX}px`;
      this.guide.style.top = `${r.height * 0.82}px`;
    }
  }
  private showPreview(point: Point | null, item: CareItem) {
    this.preview.hidden = !point;
    if (!point) return;
    this.preview.style.left = `${point.x}px`;
    this.preview.style.top = `${point.y}px`;
    this.preview.querySelector(".care-preview-symbol")!.textContent =
      itemInfo(item).icon;
  }
  private onKey(ev: KeyboardEvent) {
    const item = this.options.state.selected;
    if (!item) return;
    const r = this.scene.getBoundingClientRect(),
      b = worldBounds(r.width);
    this.target = clampPlacement(
      this.target ?? { x: r.width * 0.4, y: 0 },
      r.width,
      r.height,
    );
    if (
      [
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
      ].includes(ev.key)
    ) {
      ev.preventDefault();
      const step = ev.shiftKey ? 32 : 12;
      this.target.x =
        ev.key === "Home"
          ? b.minX
          : ev.key === "End"
            ? b.maxX
            : this.target.x +
              (ev.key === "ArrowRight"
                ? step
                : ev.key === "ArrowLeft"
                  ? -step
                  : 0);
      this.target = clampPlacement(this.target, r.width, r.height);
      this.showPreview(this.target, item);
      this.announce(
        `${itemInfo(item).name} 놓을 위치 ${Math.round(((this.target.x - b.minX) / Math.max(1, b.maxX - b.minX)) * 100)}%. Enter로 놓기, Esc로 취소.`,
      );
    } else if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      this.commit(item, this.target);
    }
  }
  private commit(item: CareItem, point: Point) {
    const exact = { ...point };
    this.release();
    this.options.state.selected = null;
    this.target = null;
    this.preview.hidden = true;
    this.ghost.hidden = true;
    this.paintSelection();
    this.announce(`${itemInfo(item).name}를 놓았어요. 친구가 찾아갈 거예요.`);
    this.options.onPlace(item, exact);
  }
  private announce(message: string) {
    this.live.textContent = message;
  }
  cancel(returnFocus = false, message = "") {
    const item = this.options.state.selected;
    this.release();
    this.options.state.selected = null;
    this.target = null;
    this.preview.hidden = true;
    this.ghost.hidden = true;
    this.paintSelection();
    if (message) this.announce(message);
    if (returnFocus) {
      const button =
        item && this.options.state.open
          ? this.tray.querySelector<HTMLButtonElement>(
              `[data-care-item="${item}"]`,
            )
          : this.toggle;
      button?.focus({ preventScroll: true });
    }
  }
  dispose() {
    this.abort.abort();
    this.resize.disconnect();
    this.cancel(false);
  }
}
