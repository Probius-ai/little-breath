/** Saved, additive growth. Time away never removes progress or changes a stage. */
export type FoodId = "seeds" | "berry" | "carrot";

export interface FoodOption {
  readonly id: FoodId;
  readonly name: string;
  /** A display glyph, rather than a key for the shared SVG icon helper. */
  readonly icon: string;
  readonly xp: number;
  readonly effect: string;
  readonly message: string;
}

export const FOOD_OPTIONS: readonly FoodOption[] = Object.freeze([
  Object.freeze({
    id: "seeds",
    name: "씨앗",
    icon: "🌾",
    xp: 4,
    effect: "가벼운 한 입 · 성장 +4",
    message: "작은 씨앗을 오물오물 먹고 조금 더 자랐어요",
  }),
  Object.freeze({
    id: "berry",
    name: "산딸기",
    icon: "🫐",
    xp: 6,
    effect: "달콤한 간식 · 성장 +6",
    message: "달콤한 산딸기를 먹고 자라는 힘을 얻었어요",
  }),
  Object.freeze({
    id: "carrot",
    name: "당근",
    icon: "🥕",
    xp: 8,
    effect: "든든한 한 끼 · 성장 +8",
    message: "아삭한 당근을 먹고 한 뼘 더 자랐어요",
  }),
]);

export interface Growth {
  experience: number;
  foodCounts: Record<FoodId, number>;
}

export interface GrowthStage {
  id: "sprout" | "bud" | "bloom" | "companion";
  label: string;
  scale: number;
  /** Absolute experience for the next stage; null means fully grown. */
  nextAt: number | null;
  /** Fraction of this stage completed, between 0 and 1. */
  progress: number;
}

/** Matches the project's bounded, persistable care counters. */
export const MAX_GROWTH_VALUE = 1_000_000;

const stages: readonly (Omit<GrowthStage, "nextAt" | "progress"> & {
  startsAt: number;
})[] = [
  { id: "sprout", label: "작은 새싹", scale: 0.8, startsAt: 0 },
  { id: "bud", label: "자라는 봉오리", scale: 0.9, startsAt: 20 },
  { id: "bloom", label: "활짝 핀 친구", scale: 1, startsAt: 60 },
  { id: "companion", label: "오래된 단짝", scale: 1.08, startsAt: 140 },
];

const counter = (value: number) =>
  Number.isFinite(value)
    ? Math.min(MAX_GROWTH_VALUE, Math.max(0, Math.floor(value)))
    : 0;

export function createGrowth(): Growth {
  return { experience: 0, foodCounts: { seeds: 0, berry: 0, carrot: 0 } };
}

export function getGrowthStage(experience: number): GrowthStage {
  const earned = counter(experience);
  let index = 0;
  while (index + 1 < stages.length && earned >= stages[index + 1].startsAt)
    index++;
  const stage = stages[index];
  const nextAt = stages[index + 1]?.startsAt ?? null;
  return {
    id: stage.id,
    label: stage.label,
    scale: stage.scale,
    nextAt,
    progress:
      nextAt === null
        ? 1
        : (earned - stage.startsAt) / (nextAt - stage.startsAt),
  };
}

/** Call exactly once after a meal finishes, never when food is merely placed. */
export function feedGrowth(growth: Growth, foodId: FoodId): Growth {
  const food = FOOD_OPTIONS.find((option) => option.id === foodId);
  if (!food) throw new RangeError("알 수 없는 먹이예요.");
  return {
    experience: counter(counter(growth.experience) + food.xp),
    foodCounts: {
      seeds: counter(growth.foodCounts.seeds),
      berry: counter(growth.foodCounts.berry),
      carrot: counter(growth.foodCounts.carrot),
      [foodId]: counter(counter(growth.foodCounts[foodId]) + 1),
    },
  };
}

/** Affection is a small, optional reward; it does not count as a meal. */
export function petGrowth(growth: Growth): Growth {
  return {
    experience: counter(counter(growth.experience) + 1),
    foodCounts: { ...growth.foodCounts },
  };
}
