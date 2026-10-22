/**
 * Tesseract.js wrapper. The library itself runs recognition inside a Web Worker, so the
 * UI thread stays responsive. The module (and the ~10 MB English model) is only loaded the
 * first time a receipt is scanned, and the model is cached in IndexedDB afterwards.
 */
import type { OcrLine } from '../lib/receiptParser';

export interface OcrProgress {
  /** Human readable stage, e.g. "Loading OCR engine". */
  stage: string;
  /** 0..1 overall progress. */
  progress: number;
}

export interface OcrResult {
  lines: OcrLine[];
  text: string;
  meanConfidence: number;
}

type TesseractWorker = Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>>;

let workerPromise: Promise<TesseractWorker> | null = null;
let progressListener: ((p: OcrProgress) => void) | null = null;

const STAGES: Record<string, [string, number, number]> = {
  // status -> [label, start, span] within the overall 0..1 bar
  'loading tesseract core': ['Loading OCR engine', 0, 0.1],
  'initializing tesseract': ['Starting OCR engine', 0.1, 0.05],
  'loading language traineddata': ['Downloading English model (first time only)', 0.15, 0.2],
  'loading language traineddata (from cache)': ['Loading English model', 0.15, 0.2],
  'initializing api': ['Preparing', 0.35, 0.05],
  'recognizing text': ['Reading text', 0.4, 0.6],
};

function report(status: string, progress: number) {
  const stage = STAGES[status];
  if (!stage || !progressListener) return;
  const [label, start, span] = stage;
  progressListener({ stage: label, progress: Math.min(1, start + span * progress) });
}

async function getWorker(): Promise<TesseractWorker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker, PSM } = await import('tesseract.js');
      const worker = await createWorker('eng', 1, {
        logger: (m: { status: string; progress: number }) => report(m.status, m.progress),
      });
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_COLUMN, // receipts are one column of variable-size text
        preserve_interword_spaces: '1',
      });
      return worker;
    })().catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

/** Recognise text on a (preprocessed) receipt image. */
export async function recognizeReceipt(image: HTMLCanvasElement | Blob, onProgress?: (p: OcrProgress) => void): Promise<OcrResult> {
  progressListener = onProgress ?? null;
  onProgress?.({ stage: 'Loading OCR engine', progress: 0.02 });
  try {
    const worker = await getWorker();
    const { data } = await worker.recognize(image);
    const lines: OcrLine[] = (data.lines ?? []).map((line) => ({
      text: line.text.trim(),
      confidence: line.confidence,
      words: line.words.map((w) => ({ text: w.text, confidence: w.confidence, bbox: w.bbox })),
      bbox: line.bbox,
    }));
    onProgress?.({ stage: 'Done', progress: 1 });
    return { lines, text: data.text, meanConfidence: data.confidence };
  } catch (err) {
    if (!navigator.onLine) {
      throw new Error('You are offline and the OCR model has not been downloaded yet. Connect once to scan, or add items manually.');
    }
    throw err instanceof Error ? err : new Error(String(err));
  } finally {
    progressListener = null;
  }
}

/** Free the worker's memory (e.g. when leaving the scan screen on low-end phones). */
export async function disposeOcr(): Promise<void> {
  if (!workerPromise) return;
  const p = workerPromise;
  workerPromise = null;
  try {
    await (await p).terminate();
  } catch {
    /* ignore */
  }
}
