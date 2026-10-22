/// <reference lib="webworker" />
/**
 * Zero-shot item categorisation with Xenova/mobilebert-uncased-mnli (Transformers.js).
 * Runs in a dedicated Web Worker so model download and inference never block the UI.
 * Weights (~25 MB quantised) download on first use and are cached by the browser.
 */
import { env, pipeline, type ZeroShotClassificationPipeline } from '@huggingface/transformers';
import { CATEGORY_LABELS, type ClassifierRequest, type ClassifierResponse } from '../services/classifierProtocol';

env.allowLocalModels = false;
env.useBrowserCache = true;

const MODEL = 'Xenova/mobilebert-uncased-mnli';
// pipeline()'s overloads are too large for TS to infer here; pin the one signature we use.
const createPipeline = pipeline as unknown as (
  task: 'zero-shot-classification',
  model: string,
  options: Record<string, unknown>,
) => Promise<ZeroShotClassificationPipeline>;
let classifierPromise: Promise<ZeroShotClassificationPipeline> | null = null;

const post = (msg: ClassifierResponse) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg);

function load(): Promise<ZeroShotClassificationPipeline> {
  if (!classifierPromise) {
    const files = new Map<string, { loaded: number; total: number }>();
    classifierPromise = createPipeline('zero-shot-classification', MODEL, {
      dtype: 'q8',
      progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
        if (p.status === 'progress' && p.file && p.total) {
          files.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
          let loaded = 0;
          let total = 0;
          for (const f of files.values()) {
            loaded += f.loaded;
            total += f.total;
          }
          post({ type: 'progress', progress: total ? loaded / total : 0 });
        }
      },
    }).catch((err) => {
      classifierPromise = null;
      throw err;
    });
  }
  return classifierPromise;
}

const labels = CATEGORY_LABELS.map((c) => c.label);

self.onmessage = async (event: MessageEvent<ClassifierRequest>) => {
  const { id, texts } = event.data;
  try {
    const classifier = await load();
    post({ type: 'ready' });
    const results = [];
    for (const text of texts) {
      const out = (await classifier(text.toLowerCase(), labels, {
        hypothesis_template: 'This purchase is {}.',
      })) as { labels: string[]; scores: number[] };
      const top = CATEGORY_LABELS.find((c) => c.label === out.labels[0])!;
      results.push({ category: top.category, score: out.scores[0] });
    }
    post({ type: 'result', id, results });
  } catch (err) {
    post({ type: 'error', id, message: err instanceof Error ? err.message : String(err) });
  }
};
