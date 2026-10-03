import type { PetDrawing, Stroke, Rig, Point } from "./engine/index";

import { createGrowth, type Growth } from "./growth";

export const STORAGE_KEY = "little-breath.project.v1";
export const PROJECT_VERSION = 1;
export type BirthSeason = "spring" | "summer" | "autumn" | "winter";
export interface BirthStory {
  mode: "exact" | "season";
  date: string;
  season: BirthSeason;
  city: string;
  temperament: string;
}
export interface Project {
  version: 1;
  pet: PetDrawing;
  birth: BirthStory;
  createdAt: string;
  updatedAt: string;
  care: { meals: number; drinks: number; affection: number };
  preferences: { reducedMotion: boolean };
  growth: Growth;
}
export const uid = () =>
  globalThis.crypto?.randomUUID?.() ??
  `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const clone = <T>(value: T): T => structuredClone(value);
const stroke = (points: number[][], color: string, width: number): Stroke => ({
  id: uid(),
  color,
  width,
  points: points.map(([x, y]) => ({ x, y })),
});
const line = (x1: number, y1: number, x2: number, y2: number, count = 18) =>
  Array.from({ length: count }, (_, i) => [
    x1 + ((x2 - x1) * i) / (count - 1),
    y1 + ((y2 - y1) * i) / (count - 1),
  ]);
const curve = (
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  start = 0,
  end = Math.PI * 2,
  count = 60,
) =>
  Array.from({ length: count }, (_, i) => [
    cx + Math.cos(start + ((end - start) * i) / (count - 1)) * rx,
    cy + Math.sin(start + ((end - start) * i) / (count - 1)) * ry,
  ]);
export function defaultRig(): Rig {
  return {
    body: { x: 0.5, y: 0.47 },
    head: { x: 0.52, y: 0.32 },
    legs: [
      {
        id: uid(),
        joints: [
          { id: uid(), x: 0.42, y: 0.59 },
          { id: uid(), x: 0.4, y: 0.7 },
          { id: uid(), x: 0.37, y: 0.77 },
        ],
      },
      {
        id: uid(),
        joints: [
          { id: uid(), x: 0.59, y: 0.59 },
          { id: uid(), x: 0.61, y: 0.7 },
          { id: uid(), x: 0.64, y: 0.77 },
        ],
      },
    ],
  };
}
export function createSample(
  kind: "sprout" | "bunny" | "cloud" | "turtle" = "sprout",
): PetDrawing {
  if (kind === "turtle") return createQuadrupedSample();
  const cream =
    kind === "cloud" ? "#f4ede1" : kind === "bunny" ? "#e7d9c8" : "#edc46c";
  const dark = "#665744";
  const strokes: Stroke[] = [];
  // The same authored ink is deformed by the rig. There are no hidden/default limbs.
  if (kind === "bunny") {
    strokes.push(
      stroke(line(0.43, 0.32, 0.39, 0.12), cream, 0.095),
      stroke(line(0.58, 0.31, 0.62, 0.12), cream, 0.095),
    );
    strokes.push(
      stroke(line(0.43, 0.24, 0.405, 0.14), "#d3a9a0", 0.036),
      stroke(line(0.58, 0.24, 0.607, 0.14), "#d3a9a0", 0.036),
    );
  }
  strokes.push(stroke(line(0.43, 0.47, 0.57, 0.47), cream, 0.32));
  strokes.push(
    stroke(curve(0.49, 0.44, 0.145, 0.13, 3.8, 5.3), "#fff4d3", 0.018),
  );
  if (kind === "cloud") {
    strokes.push(stroke(line(0.34, 0.39, 0.67, 0.4), cream, 0.14));
  }
  if (kind === "sprout") {
    strokes.push(
      stroke(line(0.5, 0.32, 0.5, 0.2), "#617d53", 0.018),
      stroke(
        [
          [0.5, 0.235],
          [0.465, 0.215],
          [0.444, 0.217],
          [0.464, 0.248],
          [0.5, 0.248],
        ],
        "#91a77a",
        0.045,
      ),
      stroke(
        [
          [0.51, 0.226],
          [0.543, 0.19],
          [0.568, 0.19],
          [0.552, 0.224],
          [0.51, 0.243],
        ],
        "#7f9868",
        0.046,
      ),
    );
  }
  strokes.push(
    stroke(line(0.41, 0.58, 0.4, 0.7), cream, 0.055),
    stroke(line(0.4, 0.7, 0.37, 0.77), dark, 0.029),
    stroke(line(0.37, 0.77, 0.32, 0.77), dark, 0.025),
  );
  strokes.push(
    stroke(line(0.59, 0.58, 0.61, 0.7), cream, 0.055),
    stroke(line(0.61, 0.7, 0.64, 0.77), dark, 0.029),
    stroke(line(0.64, 0.77, 0.69, 0.77), dark, 0.025),
  );
  strokes.push(
    stroke(
      [
        [0.444, 0.432],
        [0.444, 0.44],
      ],
      dark,
      0.018,
    ),
    stroke(
      [
        [0.56, 0.432],
        [0.56, 0.44],
      ],
      dark,
      0.018,
    ),
  );
  strokes.push(
    stroke(curve(0.501, 0.472, 0.023, 0.017, 0, Math.PI, 20), dark, 0.009),
  );
  strokes.push(
    stroke(
      [
        [0.407, 0.472],
        [0.425, 0.476],
      ],
      "#d89680",
      0.023,
    ),
    stroke(
      [
        [0.579, 0.476],
        [0.597, 0.472],
      ],
      "#d89680",
      0.023,
    ),
  );
  return {
    id: uid(),
    name: kind === "bunny" ? "보리" : kind === "cloud" ? "구름" : "모아",
    strokes,
    rig: defaultRig(),
  };
}
export function createQuadrupedSample(): PetDrawing {
  const dark = "#617052",
    skin = "#adbd84",
    shell = "#849a68";
  const xs = [0.31, 0.61, 0.4, 0.7],
    feet = [0.27, 0.64, 0.36, 0.75];
  const legs = xs.map((x, i) => ({
    id: uid(),
    joints: [
      { id: uid(), x, y: 0.54 },
      { id: uid(), x: x + (i % 2 ? 0.02 : -0.02), y: 0.66 },
      { id: uid(), x: feet[i], y: 0.76 },
    ],
  }));
  const strokes: Stroke[] = [];
  for (let i = 0; i < 4; i++) {
    const l = legs[i];
    strokes.push(
      stroke(
        l.joints.map((j) => [j.x, j.y]),
        i < 2 ? "#8b9c6c" : skin,
        0.045,
      ),
    );
    strokes.push(
      stroke(line(feet[i] - 0.023, 0.76, feet[i] + 0.023, 0.76), dark, 0.024),
    );
  }
  strokes.push(
    stroke(line(0.38, 0.45, 0.61, 0.45), shell, 0.24),
    stroke(line(0.63, 0.4, 0.73, 0.34), skin, 0.105),
  );
  strokes.push(
    stroke(curve(0.48, 0.43, 0.15, 0.09, 3.4, 5.8), "#bbc99a", 0.012),
    stroke(
      [
        [0.45, 0.355],
        [0.45, 0.52],
      ],
      "#748a58",
      0.012,
    ),
    stroke(
      [
        [0.54, 0.354],
        [0.56, 0.53],
      ],
      "#748a58",
      0.012,
    ),
    stroke(
      [
        [0.338, 0.43],
        [0.62, 0.46],
      ],
      "#748a58",
      0.012,
    ),
  );
  strokes.push(
    stroke(
      [
        [0.743, 0.321],
        [0.745, 0.329],
      ],
      dark,
      0.017,
    ),
    stroke(
      [
        [0.768, 0.353],
        [0.787, 0.35],
      ],
      dark,
      0.008,
    ),
    stroke(
      [
        [0.765, 0.366],
        [0.772, 0.364],
      ],
      "#d4a28e",
      0.015,
    ),
  );
  return {
    id: uid(),
    name: "토리",
    strokes,
    rig: { body: { x: 0.48, y: 0.46 }, head: { x: 0.73, y: 0.34 }, legs },
  };
}
export function createProject(pet = createSample()): Project {
  const now = new Date().toISOString();
  return {
    version: 1,
    pet,
    birth: {
      mode: "season",
      date: "",
      season: "spring",
      city: "seoul",
      temperament: "호기심 많은 봄의 친구",
    },
    createdAt: now,
    updatedAt: now,
    care: { meals: 0, drinks: 0, affection: 0 },
    preferences: { reducedMotion: false },
    growth: createGrowth(),
  };
}
function finite(n: unknown, min: number, max: number): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
}
function point(p: unknown): boolean {
  if (!p || typeof p !== "object") return false;
  const v = p as Record<string, unknown>;
  return finite(v.x, 0, 1) && finite(v.y, 0, 1);
}
function text(v: unknown, max = 80): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= max;
}
const colors = /^#[0-9a-f]{6}$/i;
const safeId = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[A-Za-z0-9_.:-]{1,80}$/.test(v) &&
  !["body", "head", "__proto__", "constructor", "prototype"].includes(v);
const inkPoint = (p: unknown): boolean =>
  point(p) &&
  ((p as Point).pressure === undefined || finite((p as Point).pressure, 0, 1));
export function validateProject(input: unknown): Project {
  const fail = (): never => {
    throw new Error(
      "지원하지 않는 프로젝트이거나 파일이 손상되었어요. 작은숨에서 내보낸 .json 파일을 선택해 주세요.",
    );
  };
  if (!input || typeof input !== "object") return fail();
  const p = input as Project;
  if (
    p.version !== 1 ||
    !p.pet ||
    !safeId(p.pet.id) ||
    !text(p.pet.name, 24) ||
    !Array.isArray(p.pet.strokes) ||
    p.pet.strokes.length > 1200
  )
    return fail();
  let count = 0;
  for (const s of p.pet.strokes) {
    if (
      !s ||
      !safeId(s.id) ||
      !colors.test(s.color) ||
      !finite(s.width, 0.001, 0.4) ||
      !Array.isArray(s.points) ||
      s.points.length > 12000 ||
      s.points.length < 1
    )
      return fail();
    count += s.points.length;
    if (count > 120000 || s.points.some((v) => !inkPoint(v))) return fail();
  }
  const r = p.pet.rig;
  if (
    !r ||
    !point(r.body) ||
    (r.head && !point(r.head)) ||
    !Array.isArray(r.legs) ||
    r.legs.length > 8
  )
    return fail();
  const allJointIds = new Set<string>();
  const legIds = new Set<string>();
  for (const l of r.legs) {
    if (
      !safeId(l.id) ||
      legIds.has(l.id) ||
      !Array.isArray(l.joints) ||
      l.joints.length < 2 ||
      l.joints.length > 4
    )
      return fail();
    legIds.add(l.id);
    for (const j of l.joints) {
      if (!point(j) || !safeId(j.id) || allJointIds.has(j.id)) return fail();
      allJointIds.add(j.id);
    }
  }
  if (
    r.tail &&
    (!Array.isArray(r.tail) ||
      r.tail.length > 6 ||
      r.tail.some((j) => !point(j) || !safeId(j.id)))
  )
    return fail();
  if (
    !p.birth ||
    !["exact", "season"].includes(p.birth.mode) ||
    !["spring", "summer", "autumn", "winter"].includes(p.birth.season) ||
    !text(p.birth.city) ||
    !text(p.birth.temperament, 100) ||
    typeof p.birth.date !== "string" ||
    p.birth.date.length > 10
  )
    return fail();
  if (p.birth.mode === "exact" && !p.birth.date) return fail();
  if (
    p.birth.date &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(p.birth.date) ||
      !Number.isFinite(Date.parse(p.birth.date)) ||
      new Date(p.birth.date).toISOString().slice(0, 10) !== p.birth.date)
  )
    return fail();
  if (
    !p.care ||
    !Object.values(p.care).every((n) => finite(n, 0, 1000000)) ||
    !finite(p.care.meals, 0, 1000000) ||
    !finite(p.care.drinks, 0, 1000000) ||
    !finite(p.care.affection, 0, 1000000) ||
    !p.preferences ||
    typeof p.preferences.reducedMotion !== "boolean"
  )
    return fail();
  if (
    typeof p.createdAt !== "string" ||
    !Number.isFinite(Date.parse(p.createdAt)) ||
    typeof p.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(p.updatedAt))
  )
    return fail();
  if (
    p.growth !== undefined &&
    (!p.growth ||
      typeof p.growth !== "object" ||
      !finite(p.growth.experience, 0, 1000000) ||
      !Number.isInteger(p.growth.experience) ||
      !p.growth.foodCounts ||
      !["seeds", "berry", "carrot"].every(
        (k) =>
          finite(
            p.growth.foodCounts[k as keyof Growth["foodCounts"]],
            0,
            1000000,
          ) &&
          Number.isInteger(
            p.growth.foodCounts[k as keyof Growth["foodCounts"]],
          ),
      ))
  )
    return fail();
  // Reconstruct an allowlisted value. Unknown fields, secrets and executable metadata never survive import.
  return {
    version: 1,
    pet: {
      id: p.pet.id,
      name: p.pet.name,
      strokes: p.pet.strokes.map((s) => ({
        id: s.id,
        color: s.color,
        width: s.width,
        points: s.points.map((q) => ({
          x: q.x,
          y: q.y,
          ...(q.pressure !== undefined ? { pressure: q.pressure } : {}),
        })),
      })),
      rig: {
        body: { x: r.body.x, y: r.body.y },
        ...(r.head ? { head: { x: r.head.x, y: r.head.y } } : {}),
        legs: r.legs.map((l) => ({
          id: l.id,
          joints: l.joints.map((j) => ({ id: j.id, x: j.x, y: j.y })),
          ...(finite(l.phase, 0, Math.PI * 2) ? { phase: l.phase } : {}),
        })),
        ...(r.tail
          ? { tail: r.tail.map((j) => ({ id: j.id, x: j.x, y: j.y })) }
          : {}),
      },
    },
    birth: {
      mode: p.birth.mode,
      date: p.birth.date,
      season: p.birth.season,
      city: p.birth.city,
      temperament: p.birth.temperament,
    },
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    care: {
      meals: p.care.meals,
      drinks: p.care.drinks,
      affection: p.care.affection,
    },
    preferences: { reducedMotion: p.preferences.reducedMotion },
    growth: p.growth
      ? {
          experience: p.growth.experience,
          foodCounts: {
            seeds: p.growth.foodCounts.seeds,
            berry: p.growth.foodCounts.berry,
            carrot: p.growth.foodCounts.carrot,
          },
        }
      : createGrowth(),
  };
}
export function parseProject(json: string): Project {
  if (json.length > 8 * 1024 * 1024)
    throw new Error("프로젝트는 8MB 이하만 불러올 수 있어요.");
  try {
    return validateProject(JSON.parse(json));
  } catch (e) {
    if (e instanceof SyntaxError)
      throw new Error("올바른 JSON 파일이 아니에요.");
    throw e;
  }
}
export function saveProject(
  p: Project,
  storage: Pick<Storage, "setItem"> = localStorage,
): void {
  p.updatedAt = new Date().toISOString();
  storage.setItem(STORAGE_KEY, JSON.stringify(p));
}
export function loadProject(
  storage: Pick<Storage, "getItem"> = localStorage,
): Project | null {
  const value = storage.getItem(STORAGE_KEY);
  return value ? parseProject(value) : null;
}
export function downloadFile(
  content: Blob | string,
  name: string,
  type = "application/json",
) {
  const blob =
    content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export class History<T> {
  private past: T[] = [];
  private future: T[] = [];
  constructor(private limit = 50) {}
  push(value: T) {
    this.past.push(clone(value));
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }
  undo(current: T): T | null {
    const p = this.past.pop();
    if (p === undefined) return null;
    this.future.push(clone(current));
    return p;
  }
  redo(current: T): T | null {
    const n = this.future.pop();
    if (n === undefined) return null;
    this.past.push(clone(current));
    return n;
  }
  get canUndo() {
    return !!this.past.length;
  }
  get canRedo() {
    return !!this.future.length;
  }
  clear() {
    this.past = [];
    this.future = [];
  }
}
