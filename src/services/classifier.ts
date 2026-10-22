/**
 * Main-thread client for the categorisation worker. The worker (and therefore the model)
 * is created lazily on the first call, so it never slows down the first screen.
 */
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
    else if (msg.type === 'ready') status !== 'ready' && setStatus('ready', 1);
    else if (msg.type === 'result') {
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

/** Categorise item names with the zero-shot model. Resolves in input order. */
export function categorize(texts: string[]): Promise<Category[]> {
  if (texts.length === 0) return Promise.resolve([]);
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    if (status === 'error') setStatus('loading', 0);
    getWorker().postMessage({ id, texts } satisfies ClassifierRequest);
  });
}
