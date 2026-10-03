import "./style.css";
import {
  createPetState,
  updatePet,
  setPetAction,
  renderPet,
  type PetDrawing,
  type Point,
} from "./engine/index";
import {
  createProject,
  createSample,
  clone,
  History,
  uid,
  loadProject,
  saveProject,
  parseProject,
  downloadFile,
  type Project,
  type BirthSeason,
} from "./project";
import {
  createDemoWeather,
  fetchLiveWeather,
  CITY_PRESETS,
  SCENE_OPTIONS,
  type SceneId,
  type TimeOfDay,
} from "./weather";
import { renderScene } from "./scene";
import { worldBounds, clampWorldX, placeResource } from "./world";
import { icon, escapeHtml as e } from "./icons";
import {
  FOOD_OPTIONS,
  feedGrowth,
  petGrowth,
  getGrowthStage,
  type FoodId,
} from "./growth";
import {
  loadTracingReference,
  drawTracingReference,
  releaseTracingReference,
  type TracingReference,
} from "./tracing";

type View = "garden" | "draw" | "rig";
const root = document.querySelector<HTMLDivElement>("#app")!;
const reducedQuery = matchMedia("(prefers-reduced-motion: reduce)");
let project: Project;
let storageWarning = "";
try {
  project = loadProject() ?? createProject();
} catch {
  project = createProject();
  storageWarning =
    "저장된 프로젝트를 읽지 못했어요. 파일 가져오기로 복원할 수 있어요.";
}
let tracing: TracingReference | null = null,
  photoEpoch = 0;
function clearTracing() {
  photoEpoch++;
  releaseTracingReference(tracing);
  tracing = null;
}
let view: View = "garden",
  draft = clone(project.pet),
  weather = createDemoWeather("sunny", "day"),
  paused = false,
  showRig = false,
  follow = false,
  liveLoading = false;
let state = createPetState(project.pet, { x: 380, y: 330 });
let brushColor = "#665744",
  brushWidth = 0.018,
  tool: "pen" | "eraser" = "pen",
  selectedJoint = "",
  selectedLeg = "",
  rigTool: "move" | "connect" = "move",
  connectFrom = "";
const drawHistory = new History<PetDrawing>(),
  rigHistory = new History<PetDrawing>();
let food: (Point & { kind: FoodId }) | undefined,
  water: Point | undefined,
  pointer: Point | undefined;
let selectedFood: FoodId = "seeds",
  lastPetAt = -Infinity;
let consumedFood = false,
  consumedWater = false,
  previewPlaying = true,
  dirty = false,
  saveTimer: ReturnType<typeof setTimeout>;
let lastFrame = performance.now(),
  elapsed = 0,
  sceneWidth = 0,
  sceneHeight = 0,
  editorPreviewState = createPetState(draft, { x: 130, y: 155 });
let sceneResize: ResizeObserver | undefined,
  editorResize: ResizeObserver | undefined;
let activePointer: number | null = null,
  isDrawing = false,
  activeStroke: PetDrawing["strokes"][number] | undefined,
  dragAnchor: string | undefined;
let recordedEdit = false,
  activePointLimit = 12000;
const colors = [
  "#665744",
  "#edc46c",
  "#a0b58d",
  "#d9a297",
  "#9aafb4",
  "#d1b9d8",
  "#f2e9d7",
  "#ffffff",
];
const seasonLabel: Record<BirthSeason, string> = {
  spring: "봄",
  summer: "여름",
  autumn: "가을",
  winter: "겨울",
};
const sceneIcon: Record<SceneId, string> = {
  sunny: "sun",
  cloudy: "cloud",
  rain: "rain",
  snow: "snow",
  storm: "storm",
  fog: "fog",
};
function toast(message: string) {
  const t = document.querySelector<HTMLDivElement>("#toast")!;
  t.textContent = message;
  t.classList.add("visible");
  setTimeout(() => t.classList.remove("visible"), 4200);
}
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      saveProject(project);
      const el = document.querySelector("#save-status");
      if (el) el.textContent = "이 브라우저에 저장됨";
    } catch {
      toast("브라우저 저장 공간이 부족해요. 프로젝트를 파일로 내보내 주세요.");
    }
  }, 350);
}
function commitDraft() {
  project.pet = clone(draft);
  state = createPetState(project.pet, {
    x: sceneWidth * 0.49 || 380,
    y: sceneHeight * 0.82 || 330,
  });
  dirty = false;
  persist();
}
function trackEdit(history: History<PetDrawing>) {
  history.push(draft);
  dirty = true;
}
function button(action: string, label: string, ico = "", cls = "") {
  return `<button type="button" data-action="${action}" class="${cls}">${ico ? icon(ico) : ""}<span>${label}</span></button>`;
}
function historyButtons(h: History<PetDrawing>) {
  return `<button data-action="undo" class="icon-button" aria-label="실행 취소" title="실행 취소 (Ctrl/⌘ Z)" ${h.canUndo ? "" : "disabled"}>${icon("undo")}</button><button data-action="redo" class="icon-button" aria-label="다시 실행" title="다시 실행 (Ctrl/⌘ Shift Z)" ${h.canRedo ? "" : "disabled"}>${icon("redo")}</button>`;
}
function render() {
  sceneResize?.disconnect();
  editorResize?.disconnect();
  root.innerHTML = `<div class="shell"><aside class="rail"><a href="#garden" class="brand-symbol" aria-label="작은숨 홈">${icon("leaf")}</a><nav aria-label="작업 공간"><button data-view="garden" class="rail-button ${view === "garden" ? "active" : ""}" aria-label="나의 정원" ${view === "garden" ? 'aria-current="page"' : ""}>${icon("home")}<span>정원</span></button><button data-view="draw" class="rail-button ${view === "draw" ? "active" : ""}" aria-label="그림 작업실" ${view === "draw" ? 'aria-current="page"' : ""}>${icon("pen")}<span>그리기</span></button><button data-view="rig" class="rail-button ${view === "rig" ? "active" : ""}" aria-label="움직임 작업실" ${view === "rig" ? 'aria-current="page"' : ""}>${icon("rig")}<span>움직임</span></button></nav><div class="rail-bottom">${button("guide", "안내", "book", "rail-button")}${button("settings", "설정", "settings", "rail-button")}</div></aside><div class="workspace"><header class="topbar"><a href="#garden" class="wordmark">작은숨<span>A LITTLE LIFE, DRAWN BY YOU</span></a><div class="save-pill">${icon("lock")}<span id="save-status">${dirty ? "작업 중인 그림" : "이 브라우저에 저장됨"}</span></div><div class="topbar-actions">${button("import", "불러오기", "upload", "quiet desktop-label")}${button("export", "프로젝트 저장", "download", "outline")}</div></header><main id="main-content" tabindex="-1">${view === "garden" ? gardenMarkup() : editorMarkup()}</main><footer class="footer"><span>작은 세계에, 당신의 온기를</span><span>로컬 우선 · 절차적 움직임 엔진 <i></i> v1.0</span></footer></div></div><input id="project-import" type="file" accept="application/json,.json" hidden><input id="photo-import" type="file" accept="image/png,image/jpeg,image/webp" hidden>`;
  bindEvents();
  bindCanvases();
}
function gardenMarkup() {
  return `<div class="page-heading"><div><p class="eyebrow"><span class="tiny-leaf">✦</span> YOUR LIVING SKETCHBOOK</p><h1>오늘도, 작은숨<span class="heading-dot">.</span></h1><p class="subtitle">서툰 선 하나에도, 살아갈 작은 세계가 필요하니까.</p></div>${button("new", "새로운 친구 그리기", "plus", "primary")}</div><div class="garden-grid"><section class="terrarium-card" aria-label="친구가 살아가는 정원"><div class="scene-wrap"><canvas id="scene" role="img" aria-label="${e(project.pet.name)}의 ${e(weather.description)} 정원. 아래 돌보기 버튼으로 상호작용할 수 있어요."></canvas><div class="scene-top"><div class="glass scene-location">${icon(sceneIcon[weather.scene])}<div><strong>${e(weather.locationName)}의 작은 정원</strong><span>${e(weather.description)} · ${weather.timeOfDay === "day" ? "낮" : "밤"}</span></div></div><button data-action="weather" class="glass source-chip">${weather.source === "demo" ? "MOCK · 미리보기" : "LIVE · OpenWeather"} ${icon("settings")}</button></div><div class="scene-note"><span class="live-dot"></span><span id="pet-thought">바람이 좋은 날, ${e(project.pet.name)}도 기분이 좋아요</span></div>${weather.source === "openweather" ? `<a class="scene-provider" href="https://openweathermap.org/" target="_blank" rel="noopener noreferrer"><img src="./openweather.png" alt="OpenWeather">Weather by OpenWeather${weather.stale ? " · 저장된 결과" : ""}</a>` : ""}<div class="scene-controls">${button("toggle-rig", showRig ? "관절 숨기기" : "관절 보기", "rig", `glass icon-button ${showRig ? "selected" : ""}`)}${button("pause", paused ? "재생" : "일시 정지", paused ? "play" : "pause", "glass icon-button")}${button("snapshot", "사진 저장", "camera", "glass icon-button")}</div></div><div class="care-toolbar"><div class="care-label"><span class="tiny-pulse"></span>같이 보내는 시간</div><div class="care-actions">${button("feed", "먹이 주기", "food", "care-button")}${button("drink", "물 주기", "water", "care-button")}${button("pet", "쓰다듬기", "heart", "care-button")}${button("follow", follow ? "따라오기 끄기" : "따라오기", "cursor", `care-button ${follow ? "selected" : ""}`)}${button("sleep", "쉬어가기", "moon", "care-button")}</div></div></section><aside class="companion-card"><div class="card-kicker"><span>MY COMPANION</span><span class="status-tag">함께하는 중</span></div><div class="portrait-wrap"><canvas id="portrait" aria-label="${e(project.pet.name)} 초상화" role="img"></canvas><span class="portrait-spark s1">✧</span><span class="portrait-spark s2">✦</span></div><div class="pet-identity"><h2>${e(project.pet.name)}</h2><button data-action="rename" aria-label="친구 이름 바꾸기" class="icon-button">${icon("pen")}</button></div><p class="temperament">${e(project.birth.temperament)}</p><div class="growth-card"><div><span id="growth-stage">${getGrowthStage(project.growth.experience).label}</span><span id="growth-xp">${project.growth.experience} XP</span></div><progress id="growth-progress" max="1" value="${getGrowthStage(project.growth.experience).progress}" aria-label="친구 성장 진행률"></progress><p id="growth-next">${getGrowthStage(project.growth.experience).nextAt ? `다음 성장까지 ${getGrowthStage(project.growth.experience).nextAt! - project.growth.experience} XP` : "함께한 마음이 단짝이 되었어요"}</p></div><div class="pet-stats"><div><span>${icon("heart")} 다정한 순간</span><strong id="affection-value">${project.care.affection}<small>번</small></strong></div><div><span>${icon("food")} 함께한 식사</span><strong id="meals-value">${project.care.meals}<small>번</small></strong></div></div><div class="companion-story">${icon("leaf")}<p>${seasonLabel[project.birth.season]}의 기운을 닮은 친구<br><span>생일 이야기는 상상으로 만든 성격이에요</span></p></div>${button("edit-pet", "친구의 모습 다듬기", "arrow", "text-link")}</aside></div><section class="weather-section"><div class="section-heading"><div><p class="eyebrow">A WORLD THAT CHANGES</p><h2>오늘의 하늘을 골라볼까요</h2></div><div class="day-toggle" role="group" aria-label="시간대"><button data-time="day" class="${weather.timeOfDay === "day" ? "active" : ""}" aria-pressed="${weather.timeOfDay === "day"}">${icon("sun")} 낮</button><button data-time="night" class="${weather.timeOfDay === "night" ? "active" : ""}" aria-pressed="${weather.timeOfDay === "night"}">${icon("moon")} 밤</button></div></div><div class="weather-cards">${SCENE_OPTIONS.map((s) => `<button class="weather-card weather-${s.id} ${weather.scene === s.id ? "active" : ""}" data-scene="${s.id}" aria-pressed="${weather.scene === s.id}"><div class="weather-card-art">${icon(sceneIcon[s.id])}<span class="mini-hill h1"></span><span class="mini-hill h2"></span>${s.id === "rain" || s.id === "storm" ? '<span class="mini-rain"></span>' : ""}${s.id === "snow" ? '<span class="mini-snow">· · ·<br> · ·</span>' : ""}</div><div class="weather-card-caption"><span>${e(s.label)}</span>${weather.scene === s.id ? icon("check") : '<span class="weather-empty">○</span>'}</div></button>`).join("")}</div><p class="section-footnote">날씨를 고르면 Mock 미리보기로 전환돼요. 실제 날씨는 ${button("weather", "날씨 연결 설정", "arrow", "inline-link")}에서 불러올 수 있어요</p></section><section class="journey-card"><div class="journey-icon">${icon("sparkle")}</div><div><p class="eyebrow">MADE BY YOUR HANDS</p><h3>당신의 선이, 이 친구의 전부예요</h3><p>그림의 선에 관절의 움직임을 부드럽게 나눠 담았어요. 작은 다리를 움직여 보세요.</p></div>${button("rig-pet", "움직임 살펴보기", "arrow", "outline")}</section>`;
}
function editorMarkup() {
  const rig = view === "rig";
  const hist = rig ? rigHistory : drawHistory;
  const leg = draft.rig.legs.find((l) => l.id === selectedLeg);
  return `<div class="page-heading editor-heading"><div><p class="eyebrow">${rig ? "02 / GIVE IT A LITTLE MOTION" : "01 / EVERY LINE IS A BEGINNING"}</p><h1>${rig ? "선에, 숨을 불어넣어요" : "어떤 친구를 만나고 싶나요"}<span class="heading-dot">.</span></h1><p class="subtitle">${rig ? "관절을 그림 위로 옮겨보세요. 직접 그린 선이 함께 움직여요." : "잘 그리지 않아도 괜찮아요. 가장 당신다운 선으로 시작하세요."}</p></div><div class="editor-header-actions">${button("back-garden", "정원으로", "home", "quiet")}${button(rig ? "finish" : "next-rig", rig ? "정원에 데려가기" : "움직임 연결하기", "arrow", "primary")}</div></div><div class="editor-layout"><section class="paper-card"><div class="paper-toolbar"><div class="tool-group">${rig ? `<button data-action="rig-move" class="icon-button ${rigTool === "move" ? "selected" : ""}" aria-label="관절 이동">${icon("cursor")}</button><button data-action="rig-connect" class="icon-button ${rigTool === "connect" ? "selected" : ""}" aria-label="관절 연결">${icon("rig")}</button><span class="toolbar-hint">${rigTool === "connect" ? "서로 다른 다리의 끝 관절 2개를 선택" : "관절을 눌러 선택하고 드래그하세요"}</span>` : `<button data-action="pen" class="icon-button ${tool === "pen" ? "selected" : ""}" aria-label="펜">${icon("pen")}</button><button data-action="eraser" class="icon-button ${tool === "eraser" ? "selected" : ""}" aria-label="획 지우개">${icon("eraser")}</button><span class="toolbar-hint">획 단위 지우개 · 손가락 또는 펜으로 그리기</span>`}</div><div class="tool-group">${historyButtons(hist)}${button(rig ? "reset-rig" : "clear-drawing", rig ? "관절 모두 지우기" : "그림 모두 지우기", "trash", "icon-button danger")}</div></div><div class="paper-canvas-wrap"><canvas id="editor" aria-label="${rig ? "관절 편집 캔버스. 관절 목록과 좌표 입력으로도 수정할 수 있어요." : "그림 그리기 캔버스. 마우스, 터치, 펜으로 그릴 수 있어요."}" tabindex="0"></canvas><div class="paper-label">${rig ? "RIGGING CANVAS" : "DRAWING CANVAS"} <span>· ${draft.strokes.length} STROKES</span></div>${draft.strokes.length === 0 ? '<div class="empty-canvas-hint">여기, 작은 생명의 시작을 그려주세요<span>오른쪽 예시 친구로 시작할 수도 있어요</span></div>' : ""}</div><div class="paper-bottom"><span>${icon("lock")} 그림과 생일은 이 브라우저에만 저장돼요</span><span>${rig ? `${draft.rig.legs.length}개 다리 · ${draft.rig.legs.reduce((n, l) => n + l.joints.length, 0)}개 관절` : "Ctrl / ⌘ Z 실행 취소"}</span></div></section><aside class="editor-inspector">${rig ? `<section class="inspector-section preview-section"><div class="inspector-title"><h2>작은 움직임</h2><button data-action="preview-play" class="icon-button" aria-label="미리보기 ${previewPlaying ? "일시 정지" : "재생"}">${icon(previewPlaying ? "pause" : "play")}</button></div><canvas id="rig-preview" role="img" aria-label="현재 관절의 움직임 미리보기"></canvas><p>절차적 IK + 가중치 기반 선 변형</p></section><section class="inspector-section"><div class="inspector-title"><h2>관절 구조</h2><span class="small-badge">최대 8개 다리</span></div><div class="rig-anchor-list"><button data-joint="body" class="joint-row ${selectedJoint === "body" ? "active" : ""}"><span class="joint-dot body"></span>몸 중심<span>ROOT</span></button><button data-joint="head" class="joint-row ${selectedJoint === "head" ? "active" : ""}"><span class="joint-dot head"></span>머리 중심<span>HEAD</span></button></div><div class="leg-list">${draft.rig.legs.map((l, i) => `<div class="leg-item ${selectedLeg === l.id ? "active" : ""}"><button data-leg="${l.id}" class="leg-title">${icon("rig")}<strong>다리 ${i + 1}</strong><span>${l.joints.length} 관절</span></button><div class="joint-chain">${l.joints.map((j, k) => `<button data-joint="${j.id}" class="${selectedJoint === j.id ? "active" : ""}" aria-label="다리 ${i + 1} 관절 ${k + 1}">${k + 1}</button>`).join("<span>—</span>")}</div></div>`).join("")}</div><div class="joint-tools">${button("add-leg", "다리 추가", "plus", "outline")}${button("remove-leg", "선택 다리 삭제", "trash", "quiet")}</div>${leg ? `<div class="joint-count-control"><span>선택 다리 관절 수</span><div><button data-action="remove-joint" aria-label="관절 줄이기" ${leg.joints.length <= 2 ? "disabled" : ""}>−</button><strong>${leg.joints.length}</strong><button data-action="add-joint" aria-label="관절 늘리기" ${leg.joints.length >= 4 ? "disabled" : ""}>+</button></div></div>` : ""}${selectedJoint ? jointCoordinates() : ""}<p class="inspector-help">관절은 위에서 아래로 연결돼요. 연결 도구로 서로 다른 다리의 끝점을 이을 수 있어요 (최대 4관절).</p></section>` : `<section class="inspector-section"><div class="inspector-title"><h2>당신의 팔레트</h2><span>${icon("pen")}</span></div><div class="color-palette">${colors.map((c) => `<button data-color="${c}" style="--swatch:${c}" class="color-swatch ${brushColor === c ? "active" : ""}" aria-label="색상 ${c}" aria-pressed="${brushColor === c}">${brushColor === c ? icon("check") : ""}</button>`).join("")}<label class="custom-color" aria-label="색상 직접 선택"><input id="custom-color" type="color" value="${brushColor}" aria-label="사용자 지정 펜 색상">${icon("plus")}</label></div><label class="range-label" for="brush-size">선의 두께 <span id="brush-value">${Math.round(brushWidth * 600)} px</span></label><input id="brush-size" type="range" min="3" max="80" value="${Math.round(brushWidth * 600)}"><div class="brush-preview"><span style="height:${Math.min(brushWidth * 600, 42)}px;background:${brushColor}"></span></div><p class="inspector-help">그림은 벡터 획으로 저장돼요. 지우개는 닿은 획 전체를 지워요.</p></section><section class="inspector-section"><div class="inspector-title"><h2>작은 시작점</h2><span class="small-badge">예시 친구</span></div><div class="sample-buttons"><button data-sample="sprout"><span>🌱</span>모아</button><button data-sample="bunny"><span>🐰</span>보리</button><button data-sample="cloud"><span>☁️</span>구름</button><button data-sample="turtle"><span>🐢</span>토리 · 네발</button></div><p class="inspector-help">예시를 고르면 작업 중인 그림이 바뀌어요. 실행 취소로 돌아올 수 있어요.</p></section><section class="inspector-section tracing-section"><div class="inspector-title"><h2>사진 따라 그리기</h2>${icon("camera")}</div>${tracing ? `<p class="tracing-name">${e(tracing.fileName)}</p><label class="range-label">투명도 <span>${Math.round(tracing.opacity * 100)}%</span></label><input data-trace="opacity" type="range" min="5" max="80" value="${tracing.opacity * 100}" aria-label="사진 투명도"><label class="range-label">크기</label><input data-trace="scale" type="range" min="20" max="150" value="${tracing.scale * 100}" aria-label="사진 크기"><label class="range-label">가로 위치</label><input data-trace="offsetX" type="range" min="-50" max="50" value="${tracing.offsetX * 100}" aria-label="사진 가로 위치"><label class="range-label">세로 위치</label><input data-trace="offsetY" type="range" min="-50" max="50" value="${tracing.offsetY * 100}" aria-label="사진 세로 위치">${button("remove-photo", "사진 밑그림 제거", "close", "text-link")}` : button("photo", "사진 불러오기", "upload", "outline full-width")}<p class="inspector-help">사진 위에 직접 선을 그려보세요. 사진은 전송·저장·내보내기에 포함되지 않으며 작업실을 나가면 제거돼요.</p></section><section class="inspector-section name-section"><label for="pet-name">친구의 이름</label><input id="pet-name" type="text" maxlength="24" value="${e(draft.name)}" placeholder="이름을 지어주세요"><p class="inspector-help">${seasonLabel[project.birth.season]} · ${e(project.birth.temperament)}</p>${button("birth", "탄생 이야기 바꾸기", "leaf", "text-link")}</section>`}</aside></div>`;
}
function jointCoordinates() {
  const q = getJoint(selectedJoint);
  if (!q) return "";
  return `<div class="coordinate-grid"><label>X <input id="joint-x" type="number" min="0" max="100" step="1" value="${Math.round(q.x * 100)}" aria-label="선택 관절 X 좌표 (퍼센트)"></label><label>Y <input id="joint-y" type="number" min="0" max="100" step="1" value="${Math.round(q.y * 100)}" aria-label="선택 관절 Y 좌표 (퍼센트)"></label></div>`;
}
function getJoint(id: string): Point | undefined {
  if (id === "body") return draft.rig.body;
  if (id === "head") return draft.rig.head;
  return draft.rig.legs.flatMap((l) => l.joints).find((j) => j.id === id);
}
function navigate(next: View) {
  if (next !== "draw") clearTracing();
  if (next === "garden" && dirty) commitDraft();
  if (next !== "garden" && view === "garden") {
    draft = clone(project.pet);
    drawHistory.clear();
    rigHistory.clear();
  }
  view = next;
  connectFrom = "";
  selectedJoint = "";
  selectedLeg = draft.rig.legs[0]?.id ?? "";
  render();
  history.replaceState(null, "", `#${next}`);
}
function bindEvents() {
  root.querySelectorAll<HTMLInputElement>("[data-trace]").forEach((input) =>
    input.addEventListener("input", () => {
      if (tracing) {
        tracing[
          input.dataset.trace as "opacity" | "scale" | "offsetX" | "offsetY"
        ] = Number(input.value) / 100;
        renderEditor();
      }
    }),
  );
  document
    .querySelector("#photo-import")
    ?.addEventListener("change", async (ev) => {
      const input = ev.target as HTMLInputElement,
        file = input.files?.[0];
      if (!file) return;
      const requestEpoch = ++photoEpoch;
      try {
        const ref = await loadTracingReference(file);
        if (view !== "draw" || requestEpoch !== photoEpoch) {
          releaseTracingReference(ref);
          return;
        }
        releaseTracingReference(tracing);
        tracing = ref;
        render();
        toast("사진은 밑그림으로만 보여요. 그 위에 선을 그려보세요");
      } catch (err) {
        toast((err as Error).message);
      }
      input.value = "";
    });
  root
    .querySelectorAll<HTMLButtonElement>("[data-action]")
    .forEach((b) =>
      b.addEventListener("click", () => action(b.dataset.action!)),
    );
  root
    .querySelectorAll<HTMLButtonElement>("[data-view]")
    .forEach((b) =>
      b.addEventListener("click", () => navigate(b.dataset.view as View)),
    );
  root.querySelectorAll<HTMLButtonElement>("[data-scene]").forEach((b) =>
    b.addEventListener("click", () => {
      weather = createDemoWeather(
        b.dataset.scene as SceneId,
        weather.timeOfDay,
        weather.locationName,
      );
      render();
    }),
  );
  root.querySelectorAll<HTMLButtonElement>("[data-time]").forEach((b) =>
    b.addEventListener("click", () => {
      weather = createDemoWeather(
        weather.scene,
        b.dataset.time as TimeOfDay,
        weather.locationName,
      );
      render();
    }),
  );
  root.querySelectorAll<HTMLButtonElement>("[data-color]").forEach((b) =>
    b.addEventListener("click", () => {
      brushColor = b.dataset.color!;
      tool = "pen";
      render();
    }),
  );
  root.querySelectorAll<HTMLButtonElement>("[data-sample]").forEach((b) =>
    b.addEventListener("click", () => {
      trackEdit(drawHistory);
      draft = createSample(
        b.dataset.sample as "sprout" | "bunny" | "cloud" | "turtle",
      );
      render();
    }),
  );
  root
    .querySelectorAll<HTMLButtonElement>("[data-joint]")
    .forEach((b) =>
      b.addEventListener("click", () => selectJoint(b.dataset.joint!)),
    );
  root.querySelectorAll<HTMLButtonElement>("[data-leg]").forEach((b) =>
    b.addEventListener("click", () => {
      selectedLeg = b.dataset.leg!;
      selectedJoint = draft.rig.legs.find((l) => l.id === selectedLeg)!
        .joints[0].id;
      render();
    }),
  );
  document.querySelector("#brush-size")?.addEventListener("input", (ev) => {
    brushWidth = Number((ev.target as HTMLInputElement).value) / 600;
    document.querySelector("#brush-value")!.textContent =
      `${Math.round(brushWidth * 600)} px`;
    const p = document.querySelector<HTMLElement>(".brush-preview span");
    if (p) p.style.height = `${Math.min(brushWidth * 600, 42)}px`;
  });
  document.querySelector("#custom-color")?.addEventListener("change", (ev) => {
    brushColor = (ev.target as HTMLInputElement).value;
    render();
  });
  document.querySelector("#pet-name")?.addEventListener("input", (ev) => {
    draft.name = (ev.target as HTMLInputElement).value.trim() || "작은 친구";
    dirty = true;
  });
  for (const axis of ["x", "y"] as const)
    document
      .querySelector(`#joint-${axis}`)
      ?.addEventListener("change", (ev) => {
        const q = getJoint(selectedJoint);
        if (q) {
          trackEdit(rigHistory);
          q[axis] = Math.max(
            0.01,
            Math.min(0.99, Number((ev.target as HTMLInputElement).value) / 100),
          );
          render();
        }
      });
  document
    .querySelector("#project-import")
    ?.addEventListener("change", async (ev) => {
      const input = ev.target as HTMLInputElement,
        file = input.files?.[0];
      if (!file) return;
      try {
        if (file.size > 8 * 1024 * 1024)
          throw new Error("8MB 이하의 프로젝트를 선택해 주세요.");
        const p = parseProject(await file.text());
        confirmDialog(
          "이 프로젝트를 불러올까요?",
          "현재 친구는 불러온 프로젝트로 바뀌어요. 기존 친구를 남기고 싶다면 먼저 프로젝트 저장을 눌러주세요.",
          () => {
            clearTracing();
            project = p;
            draft = clone(p.pet);
            state = createPetState(p.pet, {
              x: sceneWidth * 0.5,
              y: sceneHeight * 0.82,
            });
            dirty = false;
            view = "garden";
            persist();
            render();
            toast(`${p.pet.name}를 불러왔어요`);
          },
          "불러오기",
        );
      } catch (err) {
        toast((err as Error).message);
      }
      input.value = "";
    });
}
function action(a: string) {
  switch (a) {
    case "photo":
      (document.querySelector("#photo-import") as HTMLInputElement).click();
      break;
    case "remove-photo":
      clearTracing();
      render();
      break;
    case "new":
      openBirth(true);
      break;
    case "birth":
      openBirth(false);
      break;
    case "edit-pet":
      navigate("draw");
      break;
    case "rig-pet":
      navigate("rig");
      break;
    case "back-garden":
      navigate("garden");
      break;
    case "next-rig":
      if (!draft.strokes.length) {
        toast("먼저 선을 하나 이상 그려주세요");
        break;
      }
      navigate("rig");
      break;
    case "finish":
      if (!draft.strokes.length) {
        toast("친구의 모습을 먼저 그려주세요");
        break;
      }
      commitDraft();
      navigate("garden");
      toast(`${project.pet.name}에게 작은 세계가 생겼어요`);
      break;
    case "export":
      if (dirty) commitDraft();
      downloadFile(
        JSON.stringify(project, null, 2),
        `작은숨-${project.pet.name}.json`,
      );
      toast(
        "프로젝트 파일을 저장했어요. 생일 정보가 포함되므로 공유 전에 확인해 주세요",
      );
      break;
    case "import":
      (document.querySelector("#project-import") as HTMLInputElement).click();
      break;
    case "toggle-rig":
      showRig = !showRig;
      render();
      break;
    case "pause":
      paused = !paused;
      render();
      break;
    case "feed":
      openFood();
      break;
    case "drink":
      water = placeResource(state.position, sceneWidth, sceneHeight, 80);
      consumedWater = false;
      setPetAction(state, "drink", water);
      follow = false;
      break;
    case "pet":
      if (performance.now() - lastPetAt < 3000) {
        toast("아직 포근한 손길을 느끼는 중이에요 ♡");
        break;
      }
      lastPetAt = performance.now();
      setPetAction(state, "pet");
      project.care.affection++;
      project.growth = petGrowth(project.growth);
      persist();
      updateCare();
      updateGrowth();
      toast("다정한 마음이 전해졌어요 ♡ 성장 +1");
      break;
    case "follow":
      follow = !follow;
      setPetAction(state, follow ? "follow" : "wander");
      render();
      if (follow) toast("정원을 누르거나 포인터를 움직이면 따라와요");
      break;
    case "sleep":
      follow = false;
      setPetAction(state, state.currentAction === "sleep" ? "wander" : "sleep");
      toast(
        state.currentAction === "sleep"
          ? "잠시 쉬어가는 중이에요"
          : "기지개를 켜고 다시 걸어요",
      );
      break;
    case "snapshot": {
      const c = document.querySelector<HTMLCanvasElement>("#scene");
      c?.toBlob((blob) => {
        if (blob) downloadFile(blob, `작은숨-${project.pet.name}-정원.png`);
      });
      toast("지금의 작은 정원을 사진으로 저장했어요");
      break;
    }
    case "weather":
      openWeather();
      break;
    case "guide":
      openGuide();
      break;
    case "settings":
      openSettings();
      break;
    case "rename":
      openRename();
      break;
    case "pen":
      tool = "pen";
      render();
      break;
    case "eraser":
      tool = "eraser";
      render();
      break;
    case "undo": {
      const v = (view === "rig" ? rigHistory : drawHistory).undo(draft);
      if (v) {
        draft = v;
        dirty = true;
        render();
      }
      break;
    }
    case "redo": {
      const v = (view === "rig" ? rigHistory : drawHistory).redo(draft);
      if (v) {
        draft = v;
        dirty = true;
        render();
      }
      break;
    }
    case "clear-drawing":
      confirmDialog(
        "그림을 모두 지울까요?",
        "지운 뒤에도 실행 취소로 되돌릴 수 있어요.",
        () => {
          trackEdit(drawHistory);
          draft.strokes = [];
          render();
        },
        "지우기",
      );
      break;
    case "reset-rig":
      confirmDialog(
        "관절을 모두 지울까요?",
        "새 다리를 추가하면 다시 연결할 수 있어요. 실행 취소도 가능해요.",
        () => {
          trackEdit(rigHistory);
          draft.rig.legs = [];
          selectedLeg = "";
          selectedJoint = "";
          render();
        },
        "지우기",
      );
      break;
    case "rig-move":
      rigTool = "move";
      connectFrom = "";
      render();
      break;
    case "rig-connect":
      rigTool = "connect";
      connectFrom = "";
      render();
      break;
    case "add-leg": {
      if (draft.rig.legs.length >= 8) {
        toast("다리는 최대 8개까지 만들 수 있어요");
        break;
      }
      trackEdit(rigHistory);
      const x = 0.35 + draft.rig.legs.length * 0.075;
      const l = {
        id: uid(),
        joints: [
          { id: uid(), x: Math.min(0.85, x), y: 0.55 },
          { id: uid(), x: Math.min(0.9, x + 0.04), y: 0.68 },
          { id: uid(), x: Math.min(0.95, x + 0.06), y: 0.8 },
        ],
      };
      draft.rig.legs.push(l);
      selectedLeg = l.id;
      selectedJoint = l.joints[0].id;
      render();
      break;
    }
    case "remove-leg": {
      if (!selectedLeg) {
        toast("먼저 다리를 선택해 주세요");
        break;
      }
      trackEdit(rigHistory);
      draft.rig.legs = draft.rig.legs.filter((l) => l.id !== selectedLeg);
      selectedLeg = draft.rig.legs[0]?.id ?? "";
      selectedJoint = "";
      render();
      break;
    }
    case "add-joint": {
      const l = draft.rig.legs.find((l) => l.id === selectedLeg);
      if (l && l.joints.length < 4) {
        trackEdit(rigHistory);
        const a = l.joints[l.joints.length - 2],
          b = l.joints[l.joints.length - 1],
          j = { id: uid(), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        l.joints.splice(l.joints.length - 1, 0, j);
        selectedJoint = j.id;
        render();
      }
      break;
    }
    case "remove-joint": {
      const l = draft.rig.legs.find((l) => l.id === selectedLeg);
      if (l && l.joints.length > 2) {
        trackEdit(rigHistory);
        l.joints.splice(l.joints.length - 2, 1);
        selectedJoint = "";
        render();
      }
      break;
    }
    case "preview-play":
      previewPlaying = !previewPlaying;
      render();
      break;
  }
}
function selectJoint(id: string) {
  if (rigTool === "connect" && id !== "body" && id !== "head") {
    if (!connectFrom) {
      connectFrom = id;
      selectedJoint = id;
      toast("연결할 다른 다리의 끝 관절을 선택해 주세요");
    } else {
      connectJoints(connectFrom, id);
      connectFrom = "";
    }
  } else selectedJoint = id;
  const l = draft.rig.legs.find((l) => l.joints.some((j) => j.id === id));
  if (l) selectedLeg = l.id;
  render();
}
function connectJoints(a: string, b: string) {
  const la = draft.rig.legs.find((l) => l.joints.some((j) => j.id === a)),
    lb = draft.rig.legs.find((l) => l.joints.some((j) => j.id === b));
  if (!la || !lb || la === lb) {
    toast("서로 다른 다리의 끝 관절을 골라주세요");
    return;
  }
  if (la.joints.length + lb.joints.length > 4) {
    toast("연결 후 관절이 4개 이하여야 해요. 각 다리의 관절을 줄여주세요");
    return;
  }
  const endpoint = (l: typeof la, id: string) =>
    l.joints[0].id === id || l.joints.at(-1)!.id === id;
  if (!endpoint(la, a) || !endpoint(lb, b)) {
    toast("중간 관절 대신 다리의 끝 관절을 골라주세요");
    return;
  }
  trackEdit(rigHistory);
  const left =
      la.joints.at(-1)!.id === a ? la.joints : [...la.joints].reverse(),
    right = lb.joints[0].id === b ? lb.joints : [...lb.joints].reverse();
  la.joints = [...left, ...right];
  draft.rig.legs = draft.rig.legs.filter((l) => l !== lb);
  selectedLeg = la.id;
  selectedJoint = b;
  toast("두 다리를 하나의 관절 사슬로 연결했어요");
}
function fitCanvas(c: HTMLCanvasElement) {
  const rect = c.getBoundingClientRect(),
    dpr = Math.min(devicePixelRatio || 1, 2);
  c.width = Math.round(rect.width * dpr);
  c.height = Math.round(rect.height * dpr);
  const ctx = c.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: rect.width, h: rect.height };
}
function bindCanvases() {
  const scene = document.querySelector<HTMLCanvasElement>("#scene");
  if (scene) {
    sceneResize = new ResizeObserver(() => {
      const oldW = sceneWidth,
        oldH = sceneHeight;
      const f = fitCanvas(scene);
      sceneWidth = f.w;
      sceneHeight = f.h;
      state.position.x = oldW ? (state.position.x / oldW) * f.w : f.w * 0.48;
      state.position.y = f.h * 0.82;
      if (oldH && food)
        food = {
          x: clampWorldX((food.x / oldW) * f.w, f.w),
          y: f.h * 0.82,
          kind: food.kind,
        };
      if (oldH && water)
        water = { x: clampWorldX((water.x / oldW) * f.w, f.w), y: f.h * 0.82 };
    });
    sceneResize.observe(scene);
    const update = (ev: PointerEvent) => {
      const r = scene.getBoundingClientRect();
      pointer = {
        x: clampWorldX(ev.clientX - r.left, r.width),
        y: r.height * 0.82,
      };
      if (follow) setPetAction(state, "follow", pointer);
    };
    scene.addEventListener("pointermove", update);
    scene.addEventListener("pointerdown", (ev) => {
      update(ev);
      if (!follow) {
        setPetAction(state, "follow", pointer);
        setTimeout(() => {
          if (!follow && state.currentAction === "follow")
            setPetAction(state, "wander");
        }, 3500);
      }
    });
  }
  const portrait = document.querySelector<HTMLCanvasElement>("#portrait");
  if (portrait) {
    const f = fitCanvas(portrait);
    const s = createPetState(project.pet, { x: f.w * 0.5, y: f.h * 0.91 });
    renderPet(f.ctx, project.pet, s, 0, {
      size: f.h * 1.1 * getGrowthStage(project.growth.experience).scale,
    });
  }
  const editor = document.querySelector<HTMLCanvasElement>("#editor");
  if (editor) {
    editorResize = new ResizeObserver(() => {
      fitCanvas(editor);
      renderEditor();
    });
    editorResize.observe(editor);
    editor.addEventListener("pointerdown", editorDown);
    editor.addEventListener("pointermove", editorMove);
    editor.addEventListener("pointerup", editorUp);
    editor.addEventListener("pointercancel", editorUp);
    editor.addEventListener("lostpointercapture", editorUp);
    editor.addEventListener("keydown", (ev) => {
      if (
        view === "rig" &&
        selectedJoint &&
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(ev.key)
      ) {
        ev.preventDefault();
        const q = getJoint(selectedJoint);
        if (q) {
          trackEdit(rigHistory);
          const amount = ev.shiftKey ? 0.025 : 0.005;
          q.x = Math.max(
            0,
            Math.min(
              1,
              q.x +
                (ev.key === "ArrowRight"
                  ? amount
                  : ev.key === "ArrowLeft"
                    ? -amount
                    : 0),
            ),
          );
          q.y = Math.max(
            0,
            Math.min(
              1,
              q.y +
                (ev.key === "ArrowDown"
                  ? amount
                  : ev.key === "ArrowUp"
                    ? -amount
                    : 0),
            ),
          );
          renderEditor();
        }
      }
    });
  }
  const pre = document.querySelector<HTMLCanvasElement>("#rig-preview");
  if (pre) {
    const f = fitCanvas(pre);
    editorPreviewState = createPetState(draft, { x: f.w * 0.5, y: f.h * 0.86 });
    setPetAction(editorPreviewState, "idle");
  }
}
function editorPoint(ev: PointerEvent): Point {
  const r = (ev.currentTarget as HTMLCanvasElement).getBoundingClientRect();
  return {
    x: Math.max(0.001, Math.min(0.999, (ev.clientX - r.left) / r.width)),
    y: Math.max(0.001, Math.min(0.999, (ev.clientY - r.top) / r.height)),
    pressure: ev.pressure,
  };
}
function editorDown(ev: PointerEvent) {
  if (ev.button !== 0) return;
  if (view === "draw" && tool === "pen") {
    const count = draft.strokes.reduce((n, s) => n + s.points.length, 0);
    if (draft.strokes.length >= 1200 || count >= 120000) {
      toast(
        "그림의 저장 한도에 도달했어요. 획을 줄이거나 새 프로젝트를 시작해 주세요.",
      );
      return;
    }
    activePointLimit = Math.min(12000, 120000 - count);
  }
  const c = ev.currentTarget as HTMLCanvasElement;
  c.setPointerCapture(ev.pointerId);
  activePointer = ev.pointerId;
  const p = editorPoint(ev);
  recordedEdit = false;
  if (view === "draw") {
    trackEdit(drawHistory);
    recordedEdit = true;
    isDrawing = true;
    if (tool === "pen") {
      activeStroke = {
        id: uid(),
        points: [p],
        color: brushColor,
        width: brushWidth,
      };
      draft.strokes.push(activeStroke);
    } else eraseAt(p);
    renderEditor();
  } else {
    const hit = hitJoint(p);
    if (hit) {
      if (rigTool === "connect") {
        selectJoint(hit);
        return;
      }
      selectedJoint = hit;
      const leg = draft.rig.legs.find((l) =>
        l.joints.some((j) => j.id === hit),
      );
      if (leg) selectedLeg = leg.id;
      dragAnchor = hit;
      trackEdit(rigHistory);
      recordedEdit = true;
      renderEditor();
    } else {
      selectedJoint = "";
      renderEditor();
    }
  }
}
function editorMove(ev: PointerEvent) {
  if (activePointer !== ev.pointerId) return;
  const p = editorPoint(ev);
  if (view === "draw" && isDrawing) {
    if (tool === "pen" && activeStroke) {
      const last = activeStroke.points.at(-1)!;
      if (
        Math.hypot(last.x - p.x, last.y - p.y) > 0.0012 &&
        activeStroke.points.length < activePointLimit
      )
        activeStroke.points.push(p);
    } else eraseAt(p);
    renderEditor();
  } else if (dragAnchor) {
    const q = getJoint(dragAnchor);
    if (q) {
      q.x = p.x;
      q.y = p.y;
    }
    renderEditor();
  }
}
function editorUp(ev: PointerEvent) {
  if (activePointer !== ev.pointerId) return;
  activePointer = null;
  isDrawing = false;
  activeStroke = undefined;
  dragAnchor = undefined;
  if (recordedEdit) {
    dirty = true;
    render();
  }
  recordedEdit = false;
}
function eraseAt(p: Point) {
  const dist = 0.017;
  draft.strokes = draft.strokes.filter(
    (s) =>
      !s.points.some((q, i) => {
        if (Math.hypot(p.x - q.x, p.y - q.y) < dist + s.width * 0.5)
          return true;
        const b = s.points[i + 1];
        if (!b) return false;
        const dx = b.x - q.x,
          dy = b.y - q.y,
          v = dx * dx + dy * dy,
          t = v
            ? Math.max(
                0,
                Math.min(1, ((p.x - q.x) * dx + (p.y - q.y) * dy) / v),
              )
            : 0;
        return (
          Math.hypot(p.x - q.x - t * dx, p.y - q.y - t * dy) <
          dist + s.width * 0.5
        );
      }),
  );
}
function hitJoint(p: Point): string | undefined {
  const joints = [
    { id: "body", ...draft.rig.body },
    ...(draft.rig.head ? [{ id: "head", ...draft.rig.head }] : []),
    ...draft.rig.legs.flatMap((l) => l.joints),
  ];
  return joints.reverse().find((q) => Math.hypot(q.x - p.x, q.y - p.y) < 0.035)
    ?.id;
}
function renderEditor() {
  const c = document.querySelector<HTMLCanvasElement>("#editor");
  if (!c) return;
  const w = c.clientWidth,
    h = c.clientHeight,
    ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#fafaf5";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#dee1d5";
  for (let x = 20; x < w; x += 24)
    for (let y = 20; y < h; y += 24) {
      ctx.beginPath();
      ctx.arc(x, y, 0.7, 0, 7);
      ctx.fill();
    }
  if (tracing && view === "draw") drawTracingReference(ctx, tracing, w, h);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const s of draft.strokes) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width * Math.min(w, h);
    ctx.beginPath();
    s.points.forEach((p, i) =>
      i ? ctx.lineTo(p.x * w, p.y * h) : ctx.moveTo(p.x * w, p.y * h),
    );
    if (s.points.length === 1)
      ctx.lineTo(s.points[0].x * w + 0.01, s.points[0].y * h + 0.01);
    ctx.stroke();
  }
  if (view === "rig") {
    for (let i = 0; i < draft.rig.legs.length; i++) {
      const l = draft.rig.legs[i];
      ctx.strokeStyle = l.id === selectedLeg ? "#527c6a" : "#7a9980";
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(draft.rig.body.x * w, draft.rig.body.y * h);
      ctx.lineTo(l.joints[0].x * w, l.joints[0].y * h);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      l.joints.forEach((j, k) =>
        k ? ctx.lineTo(j.x * w, j.y * h) : ctx.moveTo(j.x * w, j.y * h),
      );
      ctx.stroke();
      for (let k = 0; k < l.joints.length; k++)
        jointDot(
          ctx,
          l.joints[k],
          String(k + 1),
          l.joints[k].id,
          w,
          h,
          "#6b8b77",
        );
    }
    jointDot(ctx, draft.rig.body, "B", "body", w, h, "#b78e52");
    if (draft.rig.head)
      jointDot(ctx, draft.rig.head, "H", "head", w, h, "#ac8aaa");
  }
}
function jointDot(
  ctx: CanvasRenderingContext2D,
  p: Point,
  label: string,
  id: string,
  w: number,
  h: number,
  color: string,
) {
  const active = id === selectedJoint;
  ctx.fillStyle = active ? color : "#fffdf3";
  ctx.strokeStyle = color;
  ctx.lineWidth = active ? 3 : 2;
  ctx.beginPath();
  ctx.arc(p.x * w, p.y * h, active ? 12 : 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = active ? "#fff" : color;
  ctx.font = "600 10px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, p.x * w, p.y * h + 0.5);
}
function updateCare() {
  const meals = document.querySelector("#meals-value"),
    love = document.querySelector("#affection-value");
  if (meals) meals.innerHTML = `${project.care.meals}<small>번</small>`;
  if (love) love.innerHTML = `${project.care.affection}<small>번</small>`;
}
const thoughts: Record<string, string> = {
  wander: "한 걸음씩, 오늘의 세계를 알아가는 중",
  idle: "함께 있는 것만으로도 충분해요",
  sleep: "꿈속에서도 작은 잎이 자라고 있어요",
  eat: "냠냠, 마음까지 든든해졌어요",
  drink: "시원한 한 모금, 다시 힘이 나요",
  follow: "당신이 가는 곳이 궁금해요",
  pet: "이 온기를 오래 기억할게요",
};
function frame(now: number) {
  const dt = Math.min((now - lastFrame) / 1000, 0.04);
  lastFrame = now;
  if (!document.hidden) {
    if (!paused || view !== "garden") elapsed += dt;
    const reduced = project.preferences.reducedMotion || reducedQuery.matches;
    const canvas = document.querySelector<HTMLCanvasElement>("#scene");
    if (canvas && sceneWidth) {
      if (!paused) {
        updatePet(state, dt, {
          ...worldBounds(sceneWidth),
          height: sceneHeight,
          groundY: sceneHeight * 0.82,
          pointer: follow ? pointer : undefined,
          food,
          water,
          reducedMotion: reduced,
          speed: 34 + getGrowthStage(project.growth.experience).scale * 15,
        });
        if (
          food &&
          !consumedFood &&
          Math.abs(state.position.x - food.x) < 28 &&
          state.currentAction === "eat" &&
          state.actionTime > 1.4
        ) {
          consumedFood = true;
          const kind = food.kind;
          food = undefined;
          project.care.meals++;
          const previous = getGrowthStage(project.growth.experience).id;
          project.growth = feedGrowth(project.growth, kind);
          persist();
          updateCare();
          updateGrowth();
          const chosen = FOOD_OPTIONS.find((f) => f.id === kind)!;
          toast(
            previous !== getGrowthStage(project.growth.experience).id
              ? `${project.pet.name}가 ${getGrowthStage(project.growth.experience).label}로 자랐어요 ✦`
              : `${chosen.message} · 성장 +${chosen.xp}`,
          );
        }
        if (
          water &&
          !consumedWater &&
          Math.abs(state.position.x - water.x) < 28 &&
          state.currentAction === "drink" &&
          state.actionTime > 1.4
        ) {
          consumedWater = true;
          water = undefined;
          project.care.drinks++;
          persist();
        }
      }
      renderScene(canvas.getContext("2d")!, {
        width: sceneWidth,
        height: sceneHeight,
        time: elapsed,
        weather,
        pet: project.pet,
        state,
        showRig,
        reducedMotion: reduced,
        food,
        water,
        petScale: getGrowthStage(project.growth.experience).scale,
      });
      const thought = document.querySelector("#pet-thought");
      if (thought)
        thought.textContent = thoughts[state.currentAction] ?? thoughts.idle;
    }
    const pre = document.querySelector<HTMLCanvasElement>("#rig-preview");
    if (pre) {
      if (previewPlaying && !reduced) {
        editorPreviewState.isMoving = true;
        editorPreviewState.movement = 1;
        editorPreviewState.gaitPhase = (elapsed * 0.65) % 1;
        editorPreviewState.currentAction = "wander";
        editorPreviewState.reducedMotion = false;
      } else {
        editorPreviewState.isMoving = false;
        editorPreviewState.movement = 0;
        editorPreviewState.reducedMotion = reduced;
      }
      const ctx = pre.getContext("2d")!,
        w = pre.clientWidth,
        h = pre.clientHeight;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#eeeee3";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#d7dbcd";
      ctx.beginPath();
      ctx.moveTo(10, h * 0.86);
      ctx.lineTo(w - 10, h * 0.86);
      ctx.stroke();
      renderPet(
        ctx,
        draft,
        editorPreviewState,
        previewPlaying && !reduced ? elapsed : 0,
        { size: h * 1.12, showRig: true },
      );
    }
  }
  requestAnimationFrame(frame);
}
function updateGrowth() {
  const g = getGrowthStage(project.growth.experience),
    stage = document.querySelector("#growth-stage"),
    xp = document.querySelector("#growth-xp"),
    progress = document.querySelector<HTMLProgressElement>("#growth-progress"),
    next = document.querySelector("#growth-next");
  if (stage) stage.textContent = g.label;
  if (xp) xp.textContent = `${project.growth.experience} XP`;
  if (progress) progress.value = g.progress;
  if (next)
    next.textContent = g.nextAt
      ? `다음 성장까지 ${g.nextAt - project.growth.experience} XP`
      : "함께한 마음이 단짝이 되었어요";
}
function openFood() {
  modal(
    "오늘은 무엇을 나눠 먹을까요?",
    `<p class="modal-intro">서로 다른 모양, 작은 기쁨. 친구가 직접 찾아와 먹으면 성장 기록이 쌓여요.</p><div class="food-picker">${FOOD_OPTIONS.map((f) => `<button data-food="${f.id}" class="food-option ${selectedFood === f.id ? "selected" : ""}"><span class="food-emoji">${f.icon}</span><strong>${f.name}</strong><span>${f.effect}</span><small>성장 +${f.xp} XP</small></button>`).join("")}</div><p class="inspector-help">현재까지 씨앗 ${project.growth.foodCounts.seeds}번 · 산딸기 ${project.growth.foodCounts.berry}번 · 당근 ${project.growth.foodCounts.carrot}번<br>돌보지 않는 동안 성장이나 기록이 줄어들지 않아요.</p>`,
  );
  document.querySelectorAll<HTMLButtonElement>("[data-food]").forEach((b) =>
    b.addEventListener("click", () => {
      selectedFood = b.dataset.food as FoodId;
      food = {
        ...placeResource(state.position, sceneWidth, sceneHeight, 70),
        kind: selectedFood,
      };
      consumedFood = false;
      setPetAction(state, "eat", food);
      follow = false;
      paused = false;
      closeModal();
      render();
      toast(
        `${FOOD_OPTIONS.find((f) => f.id === selectedFood)!.name} 냄새를 맡고 찾아가요`,
      );
    }),
  );
}
let modalReturnFocus: HTMLElement | null = null;
let modalEpoch = 0,
  weatherController: AbortController | null = null;
function closeModal() {
  modalEpoch++;
  weatherController?.abort();
  weatherController = null;
  liveLoading = false;
  document.querySelector("#modal-root")!.innerHTML = "";
  document.body.classList.remove("modal-open");
  modalReturnFocus?.focus();
}
function modal(title: string, body: string, footer = "", wide = false) {
  modalEpoch++;
  weatherController?.abort();
  weatherController = null;
  liveLoading = false;
  modalReturnFocus = document.activeElement as HTMLElement;
  document.querySelector("#modal-root")!.innerHTML =
    `<div class="modal-backdrop"><section class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header><div><p class="eyebrow">LITTLE BREATH STUDIO</p><h2 id="modal-title">${title}</h2></div><button id="modal-close" class="icon-button" aria-label="닫기">${icon("close")}</button></header><div class="modal-body">${body}</div>${footer ? `<footer>${footer}</footer>` : ""}</section></div>`;
  document.body.classList.add("modal-open");
  document.querySelector("#modal-close")!.addEventListener("click", closeModal);
  document.querySelector(".modal-backdrop")!.addEventListener("click", (ev) => {
    if (ev.target === ev.currentTarget) closeModal();
  });
  const d = document.querySelector<HTMLElement>(".modal")!;
  d.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      ev.preventDefault();
      closeModal();
    }
    if (ev.key === "Tab") {
      const nodes = Array.from(
          d.querySelectorAll<HTMLElement>(
            'button,input,select,a[href],[tabindex="0"]',
          ),
        ).filter(
          (el) => !el.hasAttribute("disabled") && el.offsetParent !== null,
        ),
        first = nodes[0],
        last = nodes.at(-1);
      if (ev.shiftKey && document.activeElement === first) {
        ev.preventDefault();
        last?.focus();
      } else if (!ev.shiftKey && document.activeElement === last) {
        ev.preventDefault();
        first?.focus();
      }
    }
  });
  setTimeout(
    () => d.querySelector<HTMLElement>("input,select,button")?.focus(),
    20,
  );
}
function confirmDialog(
  title: string,
  description: string,
  confirm: () => void,
  label = "확인",
) {
  modal(
    title,
    `<p>${e(description)}</p>`,
    `<button id="cancel" class="quiet">취소</button><button id="confirm" class="primary">${label}</button>`,
  );
  document.querySelector("#cancel")!.addEventListener("click", closeModal);
  document.querySelector("#confirm")!.addEventListener("click", () => {
    closeModal();
    confirm();
  });
}
function openBirth(newPet: boolean) {
  modal(
    newPet ? "작은 탄생의 이야기를 써주세요" : "이 친구의 계절을 기억해요",
    `<p class="modal-intro">이름과 계절을 만나면, 세상에 하나뿐인 친구가 돼요.</p>${newPet ? '<p class="inspector-help">새 친구를 만들면 현재 친구가 바뀌어요. 지금 친구를 남기려면 먼저 프로젝트 저장을 눌러주세요.</p>' : ""}<div class="form-field"><label for="birth-name">친구의 이름</label><input id="birth-name" maxlength="24" value="${e(newPet ? "" : draft.name)}" placeholder="예: 모아, 보리, 두부" required><span>한글과 이모지 모두 좋아요 · 최대 24자</span></div><div class="form-field"><label>탄생을 기억하는 방법</label><div class="segmented"><button id="exact-mode" class="${project.birth.mode === "exact" ? "active" : ""}" type="button">날짜를 알아요</button><button id="season-mode" class="${project.birth.mode === "season" ? "active" : ""}" type="button">계절로 기억할게요</button></div></div><div id="exact-field" class="form-field" ${project.birth.mode === "season" ? "hidden" : ""}><label for="birth-date">생일</label><input id="birth-date" type="date" max="${new Date().toISOString().slice(0, 10)}" value="${project.birth.date}"></div><div id="season-field" class="form-field" ${project.birth.mode === "exact" ? "hidden" : ""}><label for="birth-season">태어난 계절</label><select id="birth-season">${Object.entries(
      seasonLabel,
    )
      .map(
        ([v, n]) =>
          `<option value="${v}" ${project.birth.season === v ? "selected" : ""}>${n}</option>`,
      )
      .join(
        "",
      )}</select></div><div class="form-field"><label for="birth-city">태어난 도시</label><select id="birth-city">${CITY_PRESETS.map((c) => `<option value="${c.id}" ${project.birth.city === c.id ? "selected" : ""}>${c.name}</option>`).join("")}</select></div><div class="privacy-note">${icon("lock")}<p>이름·생일·그림은 이 브라우저에만 저장돼요. 계절에 따른 성격은 창작 설정이며, 과거의 실제 날씨를 뜻하지 않아요.</p></div><p id="birth-error" class="form-error" role="alert"></p>`,
    `<button id="birth-cancel" class="quiet">다음에 할게요</button><button id="birth-save" class="primary">${newPet ? "그리기 시작하기" : "이야기 저장"} ${icon("arrow")}</button>`,
  );
  let mode = project.birth.mode;
  const switchMode = (m: "exact" | "season") => {
    mode = m;
    document
      .querySelector("#exact-field")!
      .toggleAttribute("hidden", m !== "exact");
    document
      .querySelector("#season-field")!
      .toggleAttribute("hidden", m !== "season");
    document
      .querySelector("#exact-mode")!
      .classList.toggle("active", m === "exact");
    document
      .querySelector("#season-mode")!
      .classList.toggle("active", m === "season");
  };
  document
    .querySelector("#exact-mode")!
    .addEventListener("click", () => switchMode("exact"));
  document
    .querySelector("#season-mode")!
    .addEventListener("click", () => switchMode("season"));
  document
    .querySelector("#birth-cancel")!
    .addEventListener("click", closeModal);
  document.querySelector("#birth-save")!.addEventListener("click", () => {
    const name = (
        document.querySelector("#birth-name") as HTMLInputElement
      ).value.trim(),
      date = (document.querySelector("#birth-date") as HTMLInputElement).value,
      city = (document.querySelector("#birth-city") as HTMLSelectElement).value;
    const error = document.querySelector("#birth-error")!;
    if (!name) {
      error.textContent = "친구의 이름을 지어주세요";
      return;
    }
    if (
      mode === "exact" &&
      (!date || date > new Date().toISOString().slice(0, 10))
    ) {
      error.textContent = "오늘 또는 그 이전의 생일을 선택해 주세요";
      return;
    }
    let season = (document.querySelector("#birth-season") as HTMLSelectElement)
      .value as BirthSeason;
    if (mode === "exact") {
      const m = Number(date.slice(5, 7));
      season =
        m >= 3 && m <= 5
          ? "spring"
          : m >= 6 && m <= 8
            ? "summer"
            : m >= 9 && m <= 11
              ? "autumn"
              : "winter";
    }
    const temperament = {
      spring: "호기심 많은 봄의 친구",
      summer: "햇살처럼 활발한 여름의 친구",
      autumn: "마음이 다정한 가을의 친구",
      winter: "고요함을 좋아하는 겨울의 친구",
    }[season];
    if (newPet) {
      clearTracing();
      project = createProject(createSample());
      draft = clone(project.pet);
      drawHistory.clear();
      rigHistory.clear();
    }
    draft.name = name;
    project.pet.name = name;
    project.birth = {
      mode,
      date: mode === "exact" ? date : "",
      season,
      city,
      temperament,
    };
    persist();
    closeModal();
    if (newPet) {
      view = "draw";
      dirty = true;
      render();
    } else render();
  });
}
function openRename() {
  modal(
    "어떤 이름으로 불러줄까요?",
    `<div class="form-field"><label for="rename-input">친구의 이름</label><input id="rename-input" maxlength="24" value="${e(project.pet.name)}"><p class="form-error" id="rename-error" role="alert"></p></div>`,
    `<button id="rename-save" class="primary">이름 저장 ${icon("check")}</button>`,
  );
  const save = () => {
    const n = (
      document.querySelector("#rename-input") as HTMLInputElement
    ).value.trim();
    if (!n) {
      document.querySelector("#rename-error")!.textContent =
        "이름을 한 글자 이상 입력해 주세요";
      return;
    }
    project.pet.name = n;
    draft.name = n;
    persist();
    closeModal();
    render();
    toast(`이제 ${n}라고 불러줄게요`);
  };
  document.querySelector("#rename-save")!.addEventListener("click", save);
  document.querySelector("#rename-input")!.addEventListener("keydown", (ev) => {
    if ((ev as KeyboardEvent).key === "Enter") save();
  });
}
function openWeather() {
  modal(
    "세상의 날씨를 들여와요",
    `<p class="modal-intro">Mock은 인터넷 없이도 여섯 가지 하늘을 보여줘요. 서버가 연결되어 있다면 OpenWeather의 현재 날씨를 받아올 수 있어요.</p><div class="weather-reading"><span>${icon(sceneIcon[weather.scene])}</span><strong>${weather.temperatureC}°</strong><div>${e(weather.locationName)} · ${e(weather.description)}<small>${weather.source === "demo" ? "정해진 예시 값 · 실제 관측 아님" : `OpenWeather ${weather.stale ? "· 마지막 저장 결과" : ""}`}</small></div></div><div class="form-field"><label for="weather-city">날씨를 불러올 도시</label><select id="weather-city">${CITY_PRESETS.map((c) => `<option value="${c.id}" ${project.birth.city === c.id ? "selected" : ""}>${c.name}</option>`).join("")}</select></div><div class="privacy-note">${icon("info")}<p>실제 날씨를 누르면 선택한 도시의 좌표만 서버와 OpenWeather로 전송돼요. 생일·이름·그림은 보내지 않아요. API 키는 서버 환경변수에만 설정해요.</p></div><p class="inspector-help">GitHub Pages 단독 배포는 Mock으로 동작해요. 실제 날씨는 별도 서버 실행이 필요해요.</p><p id="weather-error" class="form-error" role="alert"></p>${weather.source === "openweather" ? `<a class="provider-credit" href="https://openweathermap.org/" target="_blank" rel="noopener noreferrer"><img src="./openweather.png" alt="OpenWeather">Weather data by OpenWeather</a>` : ""}`,
    `<button id="weather-mock" class="outline">Mock 사용</button><button id="weather-live" class="primary" ${liveLoading ? "disabled" : ""}>${liveLoading ? "불러오는 중…" : "실제 날씨 불러오기"} ${icon("refresh")}</button>`,
  );
  document.querySelector("#weather-mock")!.addEventListener("click", () => {
    const c = CITY_PRESETS.find(
      (c) =>
        c.id ===
        (document.querySelector("#weather-city") as HTMLSelectElement).value,
    )!;
    weather = createDemoWeather(weather.scene, weather.timeOfDay, c.name);
    closeModal();
    render();
  });
  document
    .querySelector("#weather-live")!
    .addEventListener("click", async () => {
      const b = document.querySelector<HTMLButtonElement>("#weather-live")!,
        cityId = (document.querySelector("#weather-city") as HTMLSelectElement)
          .value;
      liveLoading = true;
      weatherController = new AbortController();
      const requestEpoch = modalEpoch,
        signal = weatherController.signal;
      b.disabled = true;
      b.textContent = "불러오는 중…";
      try {
        const result = await fetchLiveWeather({ cityId, signal });
        if (requestEpoch !== modalEpoch || signal.aborted) return;
        weather = result;
        closeModal();
        render();
        toast("현재 날씨를 정원에 담았어요");
      } catch (err) {
        if (requestEpoch !== modalEpoch || signal.aborted) return;
        const msg = document.querySelector("#weather-error");
        if (msg) msg.textContent = (err as Error).message;
        else toast((err as Error).message);
      } finally {
        liveLoading = false;
        if (b.isConnected) {
          b.disabled = false;
          b.textContent = "실제 날씨 불러오기";
        }
      }
    });
}
function openSettings() {
  modal(
    "편안한 작은 세계",
    `<div class="setting-row"><div><strong>움직임 줄이기</strong><p>빗방울·눈·배경 움직임을 줄이고 편안한 속도로 보여줘요.</p></div><input id="reduce-motion" type="checkbox" role="switch" aria-label="움직임 줄이기" ${project.preferences.reducedMotion ? "checked" : ""}></div><div class="privacy-note">${icon("lock")}<p>서버 계정·추적·분석 도구가 없어요. 프로젝트는 이 기기의 현재 브라우저 저장소에만 남아요. 브라우저 데이터를 지우면 사라지므로 파일로도 저장해 주세요.</p></div><div class="settings-links"><a href="https://github.com/Probius-ai" target="_blank" rel="noopener noreferrer">만든 이의 GitHub ${icon("arrow")}</a></div>`,
  );
  document.querySelector("#reduce-motion")!.addEventListener("change", (ev) => {
    project.preferences.reducedMotion = (ev.target as HTMLInputElement).checked;
    persist();
  });
}
function openGuide() {
  modal(
    "작은숨과 친해지는 세 걸음",
    `<div class="guide-step"><b>01</b><div><h3>먼저, 한 친구를 그려요</h3><p>이름과 탄생 계절을 정하고 선을 그려보세요. 예시 그림, 색상, 두께, 획 지우개, 실행 취소를 사용할 수 있어요.</p></div></div><div class="guide-step"><b>02</b><div><h3>다리를 잇고, 관절을 움직여요</h3><p>각 다리는 2~4개 관절을 갖는 순서 있는 사슬이에요. 4개 다리도 서로 다른 타이밍으로 걸어요. 그림 자체를 가중치 기반으로 변형하므로 숨겨진 다리는 추가되지 않아요.</p></div></div><div class="guide-step"><b>03</b><div><h3>자기만의 날씨 속에서, 함께해요</h3><p>먹이와 물을 찾아가고 쓰다듬기에 반응해요. 여섯 날씨와 낮·밤을 고르고 정원 사진을 저장할 수 있어요.</p></div></div><div class="honesty-note"><strong>움직임은 어떻게 만들어지나요?</strong><p>현재 버전은 절차적 행동 상태, 역기구학(IK), 가중치 기반 선 변형을 사용해요. 학습된 AI나 물리 시뮬레이션이 임의의 그림을 제어한다고 주장하지 않아요.</p></div>`,
    button("", "알겠어요", "check", "primary"),
  );
  document
    .querySelector(".modal footer button")!
    .addEventListener("click", closeModal);
}
window.addEventListener("keydown", (ev) => {
  if (document.querySelector(".modal")) return;
  const target = ev.target as HTMLElement;
  if (target.matches("input,textarea,select")) return;
  if (
    (ev.ctrlKey || ev.metaKey) &&
    ev.key.toLowerCase() === "z" &&
    view !== "garden"
  ) {
    ev.preventDefault();
    action(ev.shiftKey ? "redo" : "undo");
  }
});
window.addEventListener("hashchange", () => {
  const hash = location.hash.slice(1);
  if (["garden", "draw", "rig"].includes(hash) && view !== hash)
    navigate(hash as View);
});
window.addEventListener("beforeunload", () => {
  if (dirty) commitDraft();
  try {
    saveProject(project);
  } catch {
    /* The visible export path remains available. */
  }
});
render();
requestAnimationFrame(frame);
if (storageWarning) toast(storageWarning);
