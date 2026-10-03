import type { WeatherSnapshot } from "./weather";
import { renderPet, type PetDrawing, type PetState } from "./engine/index";
export interface SceneOptions {
  width: number;
  height: number;
  time: number;
  weather: WeatherSnapshot;
  pet: PetDrawing;
  state: PetState;
  showRig: boolean;
  reducedMotion: boolean;
  petScale?: number;
  food?: { x: number; y: number; kind?: "seeds" | "berry" | "carrot" };
  water?: { x: number; y: number };
}
const palettes = {
  sunny: ["#d7e7df", "#f4e9c7", "#8ba683", "#526e60"],
  cloudy: ["#d1dddc", "#e6e6d6", "#91a494", "#63796e"],
  rain: ["#aebfc0", "#d1d8cd", "#758c80", "#4c685f"],
  snow: ["#d8e5e4", "#f3f2e7", "#baccc2", "#7c9b92"],
  storm: ["#829799", "#b5c0b6", "#62796f", "#3b554f"],
  fog: ["#d3dcd3", "#e7e7d9", "#b0bbab", "#8d9f8e"],
};
function ellipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: string,
) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}
function path(ctx: CanvasRenderingContext2D, points: number[][], fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (const p of points.slice(1)) ctx.lineTo(p[0], p[1]);
  ctx.closePath();
  ctx.fill();
}
function cloud(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  color: string,
) {
  ellipse(ctx, x, y, 56 * s, 15 * s, color);
  ellipse(ctx, x - 22 * s, y - 9 * s, 26 * s, 19 * s, color);
  ellipse(ctx, x + 11 * s, y - 17 * s, 31 * s, 25 * s, color);
  ellipse(ctx, x + 39 * s, y - 5 * s, 26 * s, 14 * s, color);
}
function tree(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  color: string,
  phase: number,
) {
  ctx.strokeStyle = "#708373";
  ctx.lineWidth = 9 * s;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.bezierCurveTo(
    x + 6 * s,
    y - 75 * s,
    x - 10 * s,
    y - 110 * s,
    x + phase,
    y - 142 * s,
  );
  ctx.stroke();
  ctx.lineWidth = 4 * s;
  ctx.beginPath();
  ctx.moveTo(x, y - 64 * s);
  ctx.lineTo(x - 38 * s, y - 99 * s);
  ctx.moveTo(x + 1, y - 72 * s);
  ctx.lineTo(x + 32 * s, y - 115 * s);
  ctx.stroke();
  ellipse(ctx, x - 38 * s + phase, y - 117 * s, 44 * s, 45 * s, color);
  ellipse(ctx, x + 29 * s + phase, y - 126 * s, 47 * s, 47 * s, color);
  ellipse(ctx, x - 4 * s + phase, y - 166 * s, 48 * s, 52 * s, color);
}
export function renderScene(ctx: CanvasRenderingContext2D, o: SceneOptions) {
  const { width: w, height: h, weather: weather, time: rawTime } = o,
    t = o.reducedMotion ? 0 : rawTime;
  const night = weather.timeOfDay === "night";
  const pal = palettes[weather.scene];
  ctx.clearRect(0, 0, w, h);
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, night ? "#273f4a" : pal[0]);
  sky.addColorStop(1, night ? "#647566" : pal[1]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  if (night) {
    for (let i = 0; i < 34; i++) {
      const x = (Math.sin(i * 41.3) * 0.5 + 0.5) * w,
        y = (Math.cos(i * 23.7) * 0.5 + 0.5) * h * 0.58;
      ellipse(
        ctx,
        x,
        y,
        1.1,
        1.1,
        `rgba(255,251,224,${0.3 + (Math.sin(t + i) + 1) * 0.18})`,
      );
    }
    ellipse(ctx, w * 0.78, h * 0.17, 27, 27, "#f9ecd1");
    ellipse(ctx, w * 0.794, h * 0.156, 25, 25, "#314951");
  } else if (weather.scene === "sunny") {
    const glow = ctx.createRadialGradient(
      w * 0.77,
      h * 0.18,
      2,
      w * 0.77,
      h * 0.18,
      100,
    );
    glow.addColorStop(0, "#fffbea");
    glow.addColorStop(0.3, "#fbf2d5");
    glow.addColorStop(1, "#fff6dc00");
    ctx.fillStyle = glow;
    ctx.fillRect(w * 0.77 - 100, h * 0.18 - 100, 200, 200);
    ellipse(ctx, w * 0.77, h * 0.18, 30, 30, "#fff8e6");
  }
  const ccolor = night ? "#aebbb522" : "#fffef080";
  cloud(ctx, w * 0.24 + Math.sin(t * 0.03) * 15, h * 0.22, 0.83, ccolor);
  cloud(ctx, w * 0.64 + Math.sin(t * 0.025 + 2) * 18, h * 0.34, 0.56, ccolor);
  if (weather.scene !== "sunny")
    cloud(ctx, w * 0.7, h * 0.14, 1.3, night ? "#c4d4d21f" : "#edf1e9b3");
  // Far hills, a tiny footbridge, and the river are original vector scenery.
  ctx.fillStyle = night ? "#5d796f" : pal[2];
  ctx.beginPath();
  ctx.moveTo(0, h * 0.58);
  ctx.bezierCurveTo(w * 0.18, h * 0.25, w * 0.3, h * 0.62, w * 0.49, h * 0.47);
  ctx.bezierCurveTo(w * 0.7, h * 0.2, w * 0.8, h * 0.57, w, h * 0.42);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.fill();
  ctx.fillStyle = night
    ? "#46675a"
    : weather.scene === "snow"
      ? "#e0e7dc"
      : "#adc09a";
  ctx.beginPath();
  ctx.moveTo(0, h * 0.71);
  ctx.bezierCurveTo(w * 0.2, h * 0.48, w * 0.3, h * 0.59, w * 0.53, h * 0.68);
  ctx.bezierCurveTo(w * 0.7, h * 0.49, w * 0.91, h * 0.58, w, h * 0.55);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.fill();
  const water = ctx.createLinearGradient(0, h * 0.62, 0, h);
  water.addColorStop(0, night ? "#81a5a8" : "#b3d4cc");
  water.addColorStop(1, night ? "#56808c" : "#7cb7bd");
  ctx.fillStyle = water;
  ctx.beginPath();
  ctx.moveTo(w * 0.73, h * 0.59);
  ctx.bezierCurveTo(w * 0.83, h * 0.67, w * 0.64, h * 0.69, w * 0.78, h * 0.78);
  ctx.bezierCurveTo(w * 0.88, h * 0.84, w * 0.84, h * 0.89, w * 0.96, h);
  ctx.lineTo(w, h);
  ctx.lineTo(w, h * 0.61);
  ctx.fill();
  for (let i = 0; i < 12; i++) {
    const y = h * 0.65 + i * h * 0.029,
      x = w * (0.84 + 0.07 * Math.sin(i * 3 + t * 0.12));
    ctx.strokeStyle = night ? "#cce8df25" : "#ecf8ef70";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 15, y);
    ctx.lineTo(x + 15 + (i % 3) * 10, y);
    ctx.stroke();
  }
  // Foreground meadow has a softly curved walking plane.
  ctx.fillStyle = night
    ? "#668365"
    : weather.scene === "snow"
      ? "#f1f2e7"
      : "#cccf9d";
  ctx.beginPath();
  ctx.moveTo(0, h * 0.72);
  ctx.bezierCurveTo(w * 0.25, h * 0.63, w * 0.63, h * 0.76, w * 0.77, h * 0.81);
  ctx.lineTo(w * 0.88, h);
  ctx.lineTo(0, h);
  ctx.fill();
  tree(
    ctx,
    w * 0.12,
    h * 0.73,
    0.67,
    night ? "#527459" : weather.scene === "snow" ? "#d8e1d0" : "#87a37c",
    Math.sin(t * 0.6) * 1.8,
  );
  tree(
    ctx,
    w * 0.02,
    h * 0.69,
    0.82,
    night ? "#3d604e" : weather.scene === "snow" ? "#c1d2bf" : "#658e71",
    Math.sin(t * 0.6 + 1) * 2,
  );
  tree(
    ctx,
    w * 0.92,
    h * 0.61,
    0.47,
    night ? "#3d6756" : weather.scene === "snow" ? "#c4d6c8" : "#75a18a",
    Math.sin(t * 0.6 + 2) * 2,
  );
  // Stone path and meadow details remain deterministic across refreshes.
  for (let i = 0; i < 8; i++) {
    const x = w * (0.03 + i * 0.077),
      y = h * (0.88 + Math.sin(i * 1.7) * 0.028);
    ellipse(ctx, x, y, 14 + (i % 3) * 3, 5, night ? "#8c927754" : "#e4d9b4a0");
  }
  for (let i = 0; i < 48; i++) {
    const x = (Math.sin(i * 23.1) * 0.5 + 0.5) * w * 0.74,
      y = h * (0.79 + (Math.cos(i * 14.2) * 0.5 + 0.5) * 0.21);
    ctx.strokeStyle = night ? "#a1b0804d" : "#8aa27385";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x - 2, y - 5, x - 4 + Math.sin(t + i), y - 7);
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 3, y - 6, x + 3 + Math.sin(t + i), y - 10);
    ctx.stroke();
    if (i % 7 === 0) {
      ellipse(ctx, x + 3, y - 11, 2.2, 2.2, night ? "#d7c99e" : "#fff4cf");
      ellipse(ctx, x - 4, y - 8, 2, 2, night ? "#cca68d" : "#d7a69a");
    }
  }
  ellipse(ctx, w * 0.65, h * 0.81, 24, 11, night ? "#6d7f6d" : "#b1b3a1");
  ellipse(ctx, w * 0.683, h * 0.825, 15, 7, night ? "#81907b" : "#c7c5af");
  if (o.food) {
    const { x, y } = o.food;
    ellipse(ctx, x, y + 4, 22, 5, "#64553628");
    ctx.fillStyle = "#b57952";
    ctx.beginPath();
    ctx.ellipse(x, y, 22, 7, 0, 0, Math.PI);
    ctx.lineTo(x - 21, y);
    ctx.fill();
    ellipse(ctx, x, y, 21, 6, "#cfad81");
    if (o.food.kind === "berry") {
      for (let i = 0; i < 5; i++)
        ellipse(ctx, x - 10 + i * 5, y - 4 - (i % 2) * 3, 4.2, 4.2, "#9b647f");
      ctx.strokeStyle = "#7c9268";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y - 8);
      ctx.lineTo(x + 4, y - 14);
      ctx.stroke();
    } else if (o.food.kind === "carrot") {
      path(
        ctx,
        [
          [x - 10, y - 3],
          [x + 8, y - 13],
          [x + 12, y - 6],
        ],
        "#d89758",
      );
      ctx.strokeStyle = "#7b9868";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + 9, y - 10);
      ctx.lineTo(x + 17, y - 15);
      ctx.moveTo(x + 9, y - 10);
      ctx.lineTo(x + 18, y - 9);
      ctx.stroke();
    } else
      for (let i = 0; i < 6; i++)
        ellipse(ctx, x - 12 + i * 4, y - 1 + (i % 2), 2.7, 2.7, "#7b6447");
  }
  if (o.water) {
    const { x, y } = o.water;
    ellipse(ctx, x, y + 4, 20, 5, "#64553628");
    ellipse(ctx, x, y, 22, 7, "#96bab8");
    ellipse(ctx, x, y - 1, 16, 4, "#d9edeb");
  }
  renderPet(ctx, o.pet, o.state, t, {
    size: Math.min(w * 0.28, h * 0.51) * (o.petScale ?? 1),
    showRig: o.showRig,
  });
  if (weather.scene === "rain" || weather.scene === "storm") {
    ctx.strokeStyle = night ? "#cce0df45" : "#f8ffff70";
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 75; i++) {
      const x = (((i * 83.19 - t * 45) % w) + w) % w,
        y = (i * 59.27 + t * 230) % h;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 5, y + 15);
      ctx.stroke();
    }
  }
  if (weather.scene === "snow") {
    for (let i = 0; i < 60; i++) {
      const x = (((i * 63.42 + Math.sin(t * 0.7 + i) * 14) % w) + w) % w,
        y = (i * 23.76 + t * 22) % h;
      ellipse(ctx, x, y, 1.5 + (i % 3) * 0.7, 1.5 + (i % 3) * 0.7, "#fffdf1b5");
    }
  }
  if (weather.scene === "fog") {
    for (let i = 0; i < 3; i++) {
      const fog = ctx.createLinearGradient(
        0,
        h * (0.4 + i * 0.15),
        0,
        h * (0.7 + i * 0.1),
      );
      fog.addColorStop(0, "#f5f4e500");
      fog.addColorStop(0.5, "#f5f4e54d");
      fog.addColorStop(1, "#f5f4e500");
      ctx.fillStyle = fog;
      ctx.fillRect(0, h * (0.4 + i * 0.15), w, h * 0.3);
    }
  }
  // No flashing lightning; storm contrast and rain communicate the scene safely.
  if (night) {
    const vignette = ctx.createRadialGradient(
      w * 0.5,
      h * 0.5,
      h * 0.2,
      w * 0.5,
      h * 0.5,
      w * 0.7,
    );
    vignette.addColorStop(0, "#172c3d00");
    vignette.addColorStop(1, "#14263350");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
  }
}
