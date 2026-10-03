import type {
  PetAction,
  PetDrawing,
  PetEnvironment,
  PetState,
  Point,
} from "./types";
import { clamp, damp, hashSeed } from "./math";

const DURATIONS: Record<PetAction, number> = {
  idle: 4,
  wander: 7,
  sleep: 24,
  eat: 5.5,
  drink: 4.5,
  follow: Infinity,
  pet: 3.2,
};

function random(state: PetState): number {
  let x = state.randomState | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  state.randomState = x >>> 0 || 1;
  return state.randomState / 4294967296;
}

export function createPetState(
  drawing: Pick<PetDrawing, "id">,
  position: Point,
  seed?: number,
): PetState {
  const state: PetState = {
    id: drawing.id,
    position: { x: position.x, y: position.y },
    velocity: { x: 0, y: 0 },
    facing: 1,
    currentAction: "idle",
    previousAction: "idle",
    actionTime: 0,
    actionDuration: DURATIONS.idle,
    actionProgress: 0,
    energy: 0.85,
    hunger: 0.22,
    thirst: 0.18,
    happiness: 0.8,
    time: 0,
    gaitPhase: 0,
    movement: 0,
    isMoving: false,
    blends: { sleep: 0, eat: 0, drink: 0, pet: 0 },
    randomState: (seed === undefined ? hashSeed(drawing.id) : seed >>> 0) || 1,
    decisionAt: 2.5,
    commandUntil: 0,
    reducedMotion: false,
  };
  state.gaitPhase = random(state);
  state.decisionAt += random(state) * 3;
  return state;
}

/** Explicit commands interrupt any current activity; follow stays active until another command. */
export function setPetAction(
  state: PetState,
  action: PetAction,
  target?: Point,
): void {
  state.previousAction = state.currentAction;
  state.currentAction = action;
  state.actionTime = 0;
  state.actionProgress = 0;
  state.actionDuration = DURATIONS[action];
  state.target = target ? { x: target.x, y: target.y } : undefined;
  state.commandUntil =
    action === "follow"
      ? Infinity
      : state.time + Math.min(DURATIONS[action], 12);
  state.decisionAt = state.time + DURATIONS[action];
  if (action === "pet") state.happiness = clamp(state.happiness + 0.08);
}

function chooseAction(state: PetState, environment: PetEnvironment): void {
  if (state.energy < 0.2) {
    setPetAction(state, "sleep");
    return;
  }
  if (state.thirst > 0.72 && environment.water) {
    setPetAction(state, "drink", environment.water);
    return;
  }
  if (state.hunger > 0.68 && environment.food) {
    setPetAction(state, "eat", environment.food);
    return;
  }
  const roll = random(state);
  if (roll < 0.57) {
    const padding = Math.min(environment.padding ?? 80, environment.width / 2);
    setPetAction(state, "wander", {
      x: padding + random(state) * Math.max(0, environment.width - padding * 2),
      y: environment.groundY,
    });
    state.decisionAt = state.time + 5 + random(state) * 5;
  } else if (roll > 0.94 && state.energy < 0.75) {
    setPetAction(state, "sleep");
  } else {
    setPetAction(state, "idle");
    state.decisionAt = state.time + 2 + random(state) * 4;
  }
  // Internal decisions do not prevent urgent needs from becoming the next choice.
  state.commandUntil = state.time;
}

function updateStep(
  state: PetState,
  dt: number,
  environment: PetEnvironment,
): void {
  state.time += dt;
  state.reducedMotion = environment.reducedMotion ?? false;
  const padding = Math.min(
    Math.max(0, environment.padding ?? 80),
    Math.max(0, environment.width) / 2,
  );
  const left = padding,
    right = Math.max(left, environment.width - padding);
  const baseSpeed = Math.max(0, environment.speed ?? 45);
  const action = state.currentAction;

  if (action === "follow" && environment.pointer) {
    state.target = {
      x: clamp(environment.pointer.x, left, right),
      y: environment.groundY,
    };
  } else if (action === "eat" && environment.food) {
    state.target = {
      x: clamp(environment.food.x, left, right),
      y: environment.groundY,
    };
  } else if (action === "drink" && environment.water) {
    state.target = {
      x: clamp(environment.water.x, left, right),
      y: environment.groundY,
    };
  } else if (action === "wander" && !state.target) {
    state.target = {
      x: left + random(state) * (right - left),
      y: environment.groundY,
    };
  }
  const canTravel =
    action === "wander" ||
    action === "follow" ||
    action === "eat" ||
    action === "drink";
  const targetX = state.target
    ? clamp(state.target.x, left, right)
    : state.position.x;
  const difference = targetX - state.position.x;
  const stopRadius = action === "follow" ? 30 : 5;
  const travelling =
    canTravel && !!state.target && Math.abs(difference) > stopRadius + 0.75;
  const slowed = clamp((Math.abs(difference) - stopRadius) / 42);
  const desiredVelocity = travelling
    ? Math.sign(difference) *
      baseSpeed *
      slowed *
      (action === "follow" ? 1.3 : 1)
    : 0;
  state.velocity.x = damp(state.velocity.x, desiredVelocity, 5.5, dt);
  if (Math.abs(state.velocity.x) < 0.03) state.velocity.x = 0;
  const oldX = state.position.x;
  state.position.x = clamp(
    state.position.x + state.velocity.x * dt,
    left,
    right,
  );
  if (
    (state.position.x === left && state.velocity.x < 0) ||
    (state.position.x === right && state.velocity.x > 0)
  )
    state.velocity.x = 0;
  state.position.y = damp(state.position.y, environment.groundY, 9, dt);
  state.velocity.y = 0;
  if (Math.abs(state.velocity.x) > 3)
    state.facing = state.velocity.x > 0 ? 1 : -1;
  const travelled = Math.abs(state.position.x - oldX);
  state.gaitPhase = (state.gaitPhase + travelled / 29) % 1;
  state.movement = damp(
    state.movement,
    baseSpeed > 0 ? clamp(Math.abs(state.velocity.x) / baseSpeed) : 0,
    8,
    dt,
  );
  state.isMoving = Math.abs(state.velocity.x) > 1.2;
  const settled = !travelling && !state.isMoving;
  const active = (action !== "eat" && action !== "drink") || settled;
  if (active) state.actionTime += dt;
  state.actionProgress = Number.isFinite(state.actionDuration)
    ? clamp(state.actionTime / state.actionDuration)
    : 0;

  const sleeping = action === "sleep";
  const eating = action === "eat" && settled;
  const drinking = action === "drink" && settled;
  state.energy = clamp(
    state.energy + (sleeping ? 0.036 : -0.0012 - state.movement * 0.003) * dt,
  );
  state.hunger = clamp(state.hunger + (eating ? -0.18 : 0.0016) * dt);
  state.thirst = clamp(state.thirst + (drinking ? -0.22 : 0.002) * dt);
  state.happiness = clamp(
    state.happiness + (action === "pet" ? 0.055 : -0.00055) * dt,
  );
  state.blends.sleep = damp(state.blends.sleep, sleeping ? 1 : 0, 3, dt);
  state.blends.eat = damp(state.blends.eat, eating ? 1 : 0, 6, dt);
  state.blends.drink = damp(state.blends.drink, drinking ? 1 : 0, 6, dt);
  state.blends.pet = damp(state.blends.pet, action === "pet" ? 1 : 0, 4, dt);

  if (environment.autonomous === false || action === "follow") return;
  const completed =
    ((action === "eat" || action === "drink" || action === "pet") &&
      state.actionProgress >= 1) ||
    (action === "sleep" && state.actionTime >= 8 && state.energy >= 0.96) ||
    (action === "wander" && settled && state.actionTime > 1);
  const mayReconsider = action === "idle" || action === "wander";
  if (
    completed ||
    (mayReconsider &&
      state.time >= state.decisionAt &&
      state.time >= state.commandUntil)
  )
    chooseAction(state, environment);
}

/**
 * Advance in stable substeps. Large/invalid deltas cannot teleport a pet or
 * produce NaNs; time spent in a suspended tab is intentionally not simulated.
 */
export function updatePet(
  state: PetState,
  dt: number,
  environment: PetEnvironment,
): PetState {
  if (
    !Number.isFinite(dt) ||
    dt <= 0 ||
    !Number.isFinite(environment.width) ||
    !Number.isFinite(environment.groundY)
  )
    return state;
  const bounded = Math.min(dt, 0.25);
  const steps = Math.ceil(bounded / (1 / 60));
  for (let i = 0; i < steps; i++)
    updateStep(state, bounded / steps, environment);
  return state;
}
