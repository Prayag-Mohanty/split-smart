/**
 * Main-thread client for the categorisation worker. The worker (and therefore the model)
 * is created lazily on the first call, so it never slows down the first screen.
 */
import { categoryHint } from '../lib/categoryHints';
import type { Category } from '../lib/types';
import type { ClassifierRequest, ClassifierResponse } from './classifierProtocol';

export type ClassifierStatus = 'idle' | 'loading' | 'ready' | 'error';

type Listener = (status: ClassifierStatus, progress: number) => void;

let worker: Worker | null = null;
let nextId = 1;
let status: ClassifierStatus = 'idle';
let progress = 0;
const pending = new Map<number, { resolve: (r: Category[]) => void; reject: (e: Error) => void }>();
const listeners = new Set<Listener>();

function setStatus(s: ClassifierStatus, p = progress) {
  status = s;
  progress = p;
  listeners.forEach((l) => l(status, progress));
}

export function onClassifierStatus(listener: Listener): () => void {
  listeners.add(listener);
  listener(status, progress);
  return () => listeners.delete(listener);
}

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('../workers/classifier.worker.ts', import.meta.url), { type: 'module' });
  setStatus('loading', 0);
  worker.onmessage = (e: MessageEvent<ClassifierResponse>) => {
    const msg = e.data;
    if (msg.type === 'progress') setStatus('loading', msg.progress);
    else if (msg.type === 'ready') {
      if (status !== 'ready') setStatus('ready', 1);
    } else if (msg.type === 'result') {
      pending.get(msg.id)?.resolve(msg.results.map((r) => r.category));
      pending.delete(msg.id);
    } else if (msg.type === 'error') {
      setStatus('error');
      pending.get(msg.id)?.reject(new Error(msg.message));
      pending.delete(msg.id);
    }
  };
  worker.onerror = (e) => {
    setStatus('error');
    for (const p of pending.values()) p.reject(new Error(e.message || 'Categoriser failed to load'));
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

export interface CategorizeResult {
  /** In input order; undefined where neither a keyword hint nor the model gave an answer. */
  categories: (Category | undefined)[];
  /** Set when the model could not run (offline, blocked download…); hints still apply. */
  modelError?: Error;
}

/**
 * Categorise item names: keyword hints first (instant, works offline), then the
 * zero-shot model for whatever is left. The model is only loaded if it's needed.
 */
export async function categorize(texts: string[]): Promise<CategorizeResult> {
  const categories: (Category | undefined)[] = texts.map((t) => categoryHint(t));
  const unknown = texts.map((t, i) => ({ t, i })).filter(({ i }) => categories[i] === undefined);
  if (unknown.length === 0) return { categories };
  try {
    const fromModel = await runModel(unknown.map((u) => u.t));
    unknown.forEach((u, k) => (categories[u.i] = fromModel[k]));
    return { categories };
  } catch (err) {
    return { categories, modelError: err instanceof Error ? err : new Error(String(err)) };
  }
}

/** Run the zero-shot model in its worker. Resolves in input order. */
function runModel(texts: string[]): Promise<Category[]> {
  if (texts.length === 0) return Promise.resolve([]);
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    if (status === 'error') setStatus('loading', 0);
    getWorker().postMessage({ id, texts } satisfies ClassifierRequest);
  });
}
