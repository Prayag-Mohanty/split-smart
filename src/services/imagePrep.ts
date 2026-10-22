/**
 * Canvas preprocessing before OCR: orientation, downscaling, grayscale and a contrast
 * stretch, which noticeably helps Tesseract on faded thermal-paper receipts.
 * Everything happens on-device; the image never leaves the browser.
 */

export type Rotation = 0 | 90 | 180 | 270;

const MAX_SIDE = 2200;
const MIN_WIDTH = 1000;

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
  let scale = Math.min(1, MAX_SIDE / Math.max(outW0, outH0));
  if (outW0 * scale < MIN_WIDTH) scale = Math.min(2, MIN_WIDTH / outW0); // upscale tiny images a little
  const w = Math.round(outW0 * scale);
  const h = Math.round(outH0 * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(w / 2, h / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  const dw = (swap ? h : w);
  const dh = (swap ? w : h);
  ctx.drawImage(bitmap, -dw / 2, -dh / 2, dw, dh);
  return canvas;
}

/** Grayscale + percentile contrast stretch, in place. */
export function enhanceForOcr(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    d[i] = g;
    hist[g | 0]++;
  }
  // Stretch between the 2nd and 98th percentile so faded grey text becomes black.
  const total = d.length / 4;
  let lo = 0;
  let hi = 255;
  for (let acc = 0, i = 0; i < 256; i++) if ((acc += hist[i]) >= total * 0.02) { lo = i; break; }
  for (let acc = 0, i = 255; i >= 0; i--) if ((acc += hist[i]) >= total * 0.02) { hi = i; break; }
  const range = Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    let v = ((d[i] - lo) * 255) / range;
    v = v < 0 ? 0 : v > 255 ? 255 : v;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), type, quality),
  );
}
