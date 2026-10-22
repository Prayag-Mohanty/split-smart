/**
 * Canvas preprocessing before OCR: orientation, downscaling, grayscale and a contrast
 * stretch, which noticeably helps Tesseract on faded thermal-paper receipts.
 * Everything happens on-device; the image never leaves the browser.
 */

export type Rotation = 0 | 90 | 180 | 270;

/**
 * Tesseract reads best when characters are ~30 px tall. Compressed photos (e.g. forwarded on
 * WhatsApp) are often ~1500 px, which leaves receipt text far too small, so we scale every
 * image to a ~3600 px long side — up to 3× up, or down for huge camera photos — within a
 * pixel budget that is safe for phone memory.
 */
const TARGET_LONG_SIDE = 3600;
const MAX_UPSCALE = 3;
const MAX_PIXELS = 8_000_000;

export async function loadBitmap(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Some browsers reject the options bag or HEIC data; fall back to an <img>.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return await createImageBitmap(img);
    } catch {
      throw new Error('This file could not be read as an image. Try a JPG or PNG photo.');
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** Draw the bitmap rotated and scaled into a new canvas. */
export function drawRotated(bitmap: ImageBitmap, rotation: Rotation): HTMLCanvasElement {
  const swap = rotation === 90 || rotation === 270;
  const srcW = bitmap.width;
  const srcH = bitmap.height;
  const outW0 = swap ? srcH : srcW;
  const outH0 = swap ? srcW : srcH;
  let scale = Math.min(MAX_UPSCALE, TARGET_LONG_SIDE / Math.max(outW0, outH0));
  scale = Math.min(scale, Math.sqrt(MAX_PIXELS / (outW0 * outH0)));
  const w = Math.round(outW0 * scale);
  const h = Math.round(outH0 * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(w / 2, h / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  const dw = swap ? h : w;
  const dh = swap ? w : h;
  ctx.drawImage(bitmap, -dw / 2, -dh / 2, dw, dh);
  return canvas;
}

/**
 * Grayscale + local adaptive contrast, in place.
 * Each pixel is compared with the mean brightness of its neighbourhood (Bradley's method,
 * via an integral image). Pixels near the local paper colour become white and anything
 * clearly darker is ramped to black. Unlike a global stretch this copes with faded thermal
 * print, shadows and a table or background showing around the receipt.
 */
export function enhanceForOcr(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const { width: w, height: h } = canvas;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const gray = new Uint8ClampedArray(w * h);
  for (let i = 0, p = 0; p < gray.length; i += 4, p++) gray[p] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;

  // Integral image for O(1) window means.
  // Uint32 is exact here: MAX_PIXELS × 255 < 2³².
  const integral = new Uint32Array((w + 1) * (h + 1));
  for (let y = 1; y <= h; y++) {
    let row = 0;
    for (let x = 1; x <= w; x++) {
      row += gray[(y - 1) * w + (x - 1)];
      integral[y * (w + 1) + x] = integral[(y - 1) * (w + 1) + x] + row;
    }
  }
  const r = Math.max(8, Math.round(Math.max(w, h) / 40)); // window radius ≈ a few text lines
  const WHITE_AT = 0.92; // ≥ 92% of the local mean reads as paper
  const BLACK_AT = 0.6; // ≤ 60% of the local mean is solid ink
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const sum = integral[y1 * (w + 1) + x1] - integral[y0 * (w + 1) + x1] - integral[y1 * (w + 1) + x0] + integral[y0 * (w + 1) + x0];
      const mean = sum / ((x1 - x0) * (y1 - y0)) || 1;
      const ratio = gray[y * w + x] / mean;
      const v = ratio >= WHITE_AT ? 255 : ratio <= BLACK_AT ? 0 : ((ratio - BLACK_AT) / (WHITE_AT - BLACK_AT)) * 255;
      const i = (y * w + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), type, quality));
}
