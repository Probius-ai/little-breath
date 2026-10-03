/** Dependency-free procedural pet animation. No training, server or model weights. */
export * from "./types";
export { createPetState, setPetAction, updatePet } from "./behavior";
export { solveIK } from "./ik";
export { computePose, getRestBones, gaitFoot } from "./pose";
export {
  bindSkin,
  deformStrokes,
  invalidateSkin,
  transformByBone,
} from "./skinning";
export type { SkinBinding } from "./skinning";
export { renderPet, getGroundLevel } from "./render";
export { clamp, distance, hashSeed } from "./math";
