/** Drawing and rig coordinates are normalized to the unit square. World positions use CSS pixels. */
export interface Point {
  x: number;
  y: number;
  /** Optional pen pressure in [0, 1]. Zero is a legitimate pressure sample. */
  pressure?: number;
}

export interface Stroke {
  id: string;
  points: Point[];
  color: string;
  /** Line width as a fraction of the drawing size. */
  width: number;
}

export interface Joint extends Point {
  id: string;
}
export interface Leg {
  id: string;
  /** Hip → optional knee(s) → foot. Two to four joints are supported by the editor. */
  joints: Joint[];
  /** Gait offset in cycles. If omitted, legs alternate automatically. */
  phase?: number;
}
export interface Rig {
  body: Point;
  head?: Point;
  legs: Leg[];
  /** Root → tip. No tail or legs are created unless they exist in the drawing's rig. */
  tail?: Joint[];
}
export interface PetDrawing {
  id: string;
  name: string;
  strokes: Stroke[];
  rig: Rig;
}

export type PetAction =
  "idle" | "wander" | "sleep" | "eat" | "drink" | "follow" | "pet";
export interface PoseBlends {
  sleep: number;
  eat: number;
  drink: number;
  pet: number;
}
export interface PetState {
  id: string;
  /** Authored foot-contact baseline in world pixels; x is the drawing canvas center. */
  position: Point;
  velocity: Point;
  facing: 1 | -1;
  currentAction: PetAction;
  previousAction: PetAction;
  actionTime: number;
  actionDuration: number;
  actionProgress: number;
  /** Need levels increase toward one; energy and happiness increase toward one. */
  energy: number;
  hunger: number;
  thirst: number;
  happiness: number;
  time: number;
  gaitPhase: number;
  movement: number;
  isMoving: boolean;
  target?: Point;
  blends: PoseBlends;
  /** Per-pet seeded RNG, so pets never depend on global Math.random state. */
  randomState: number;
  decisionAt: number;
  commandUntil: number;
  reducedMotion: boolean;
}

export interface PetEnvironment {
  width: number;
  height: number;
  groundY: number;
  pointer?: Point;
  food?: Point;
  water?: Point;
  /** Base walking speed in CSS pixels / second. Defaults to 45. */
  speed?: number;
  /** Half-width of the rendered pet for comfortable world edge padding. */
  padding?: number;
  reducedMotion?: boolean;
  /** Set false to keep the current action until another command is issued. */
  autonomous?: boolean;
}

export type BoneKind = "body" | "head" | "leg" | "tail";
export interface Bone {
  id: string;
  kind: BoneKind;
  start: Point;
  end: Point;
  /** Used to restrict foot influence to its own side of the hip. */
  root?: Point;
}
export interface PosedBone extends Bone {
  restStart: Point;
  restEnd: Point;
}
export interface PetPose {
  bones: PosedBone[];
  /** Posed joints for an optional debug rig. */
  legs: Point[][];
  body: Point;
  head?: Point;
  tail: Point[];
  movement: number;
}
export interface RenderPetOptions {
  size: number;
  opacity?: number;
  showRig?: boolean;
  rigColor?: string;
}
