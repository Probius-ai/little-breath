/** Ephemeral, local-only raster tracing. Never included in Project or storage. */
export interface TracingReference {
  bitmap: ImageBitmap;
  opacity: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  fileName: string;
}
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);
export async function loadTracingReference(
  file: File,
): Promise<TracingReference> {
  if (!ALLOWED.has(file.type))
    throw new Error(
      "PNG, JPEG, WebP 사진만 사용할 수 있어요. SVG는 지원하지 않아요.",
    );
  if (file.size > 12 * 1024 * 1024)
    throw new Error("사진은 12MB 이하로 선택해 주세요.");
  if (file.size === 0) throw new Error("빈 사진 파일이에요.");
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every(
    (v, i) => header[i] === v,
  );
  const jpeg = header[0] === 255 && header[1] === 216 && header[2] === 255;
  const webp =
    String.fromCharCode(...header.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...header.slice(8, 12)) === "WEBP";
  if (!(
    (file.type === "image/png" && png) ||
    (file.type === "image/jpeg" && jpeg) ||
    (file.type === "image/webp" && webp)
  ))
    throw new Error(
      "사진의 실제 파일 형식이 맞지 않아요. PNG, JPEG, WebP로 다시 저장해 주세요.",
    );
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(
      "사진을 열지 못했어요. 다른 PNG, JPEG, WebP 파일을 골라주세요.",
    );
  }
  if (
    bitmap.width > 8000 ||
    bitmap.height > 8000 ||
    bitmap.width * bitmap.height > 20_000_000
  ) {
    bitmap.close();
    throw new Error("사진이 너무 커요. 2천만 화소 이하로 줄여주세요.");
  }
  return {
    bitmap,
    opacity: 0.3,
    scale: 0.9,
    offsetX: 0,
    offsetY: 0,
    fileName: file.name,
  };
}
export function drawTracingReference(
  ctx: CanvasRenderingContext2D,
  ref: TracingReference,
  w: number,
  h: number,
) {
  const ratio =
      Math.min(w / ref.bitmap.width, h / ref.bitmap.height) * ref.scale,
    iw = ref.bitmap.width * ratio,
    ih = ref.bitmap.height * ratio;
  ctx.save();
  ctx.globalAlpha = ref.opacity;
  ctx.drawImage(
    ref.bitmap,
    (w - iw) / 2 + ref.offsetX * w,
    (h - ih) / 2 + ref.offsetY * h,
    iw,
    ih,
  );
  ctx.restore();
}
export function releaseTracingReference(ref: TracingReference | null) {
  ref?.bitmap.close();
}
