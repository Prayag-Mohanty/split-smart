/**
 * Copies Tesseract.js's worker, WASM core and English model from node_modules into
 * public/ocr so OCR is served from our own origin: no third-party CDN, and the service
 * worker can cache it for offline use. Runs automatically before dev/build.
 */
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'ocr');
mkdirSync(out, { recursive: true });

const pkgDir = (name) => dirname(require.resolve(`${name}/package.json`));
const files = [
  [join(pkgDir('tesseract.js'), 'dist', 'worker.min.js'), 'worker.min.js'],
  [join(pkgDir('tesseract.js-core'), 'tesseract-core-simd-lstm.wasm.js'), 'tesseract-core-simd-lstm.wasm.js'],
  [join(pkgDir('tesseract.js-core'), 'tesseract-core-lstm.wasm.js'), 'tesseract-core-lstm.wasm.js'],
  [join(pkgDir('@tesseract.js-data/eng'), '4.0.0_best_int', 'eng.traineddata.gz'), 'eng.traineddata.gz'],
];
for (const [src, name] of files) {
  if (!existsSync(src)) throw new Error(`Missing OCR asset: ${src}`);
  copyFileSync(src, join(out, name));
}
console.log(`Copied ${files.length} OCR assets to public/ocr`);
