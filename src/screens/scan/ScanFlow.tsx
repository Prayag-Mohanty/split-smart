import { useCallback, useEffect, useRef, useState } from 'react';
import { AppBar } from '../../components/AppBar';
import { toast } from '../../components/Toast';
import { navigate } from '../../hooks/useHashRoute';
import { todayIso } from '../../lib/ids';
import { parseReceipt, type OcrLine } from '../../lib/receiptParser';
import type { Category, Group } from '../../lib/types';
import { categorize } from '../../services/classifier';
import { canvasToBlob, drawRotated, enhanceForOcr, loadBitmap, type Rotation } from '../../services/imagePrep';
import { disposeOcr, recognizeReceipt, type OcrProgress } from '../../services/ocr';
import { useGroup, useStore } from '../../store/useStore';
import { NotFound } from '../NotFound';
import { AssignStep } from './AssignStep';
import { CaptureStep } from './CaptureStep';
import { draftFromExpense, draftFromParsed, draftToExpense, emptyDraft, type Draft } from './draft';
import { ProcessingStep } from './ProcessingStep';
import { ReviewStep } from './ReviewStep';
import { SummaryStep } from './SummaryStep';

let categorizerWarned = false;

export type Step = 'capture' | 'processing' | 'review' | 'assign' | 'summary';

export interface ScanImage {
  url: string;
  width: number;
  height: number;
  lines: OcrLine[];
  meanConfidence: number;
}

const STEPS: { id: Step; label: string }[] = [
  { id: 'capture', label: 'Scan' },
  { id: 'review', label: 'Review' },
  { id: 'assign', label: 'Assign' },
  { id: 'summary', label: 'Split' },
];

export default function ScanFlow({ groupId, expenseId }: { groupId: string; expenseId?: string }) {
  const group = useGroup(groupId);
  const existing = group?.expenses.find((e) => e.id === expenseId);
  if (!group) return <NotFound />;
  if (expenseId && existing?.kind !== 'itemized') return <NotFound message="This receipt no longer exists." />;
  if (group.members.length === 0) return <NotFound message="Add members to the group before scanning a receipt." />;
  return <Flow key={expenseId ?? 'new'} group={group} editing={existing?.kind === 'itemized' ? existing : undefined} />;
}

function Flow({ group, editing }: { group: Group; editing?: Extract<Group['expenses'][number], { kind: 'itemized' }> }) {
  const saveExpense = useStore((s) => s.saveExpense);
  const deleteExpense = useStore((s) => s.deleteExpense);
  const autoCategorize = useStore((s) => s.settings.autoCategorize);

  const [step, setStep] = useState<Step>(editing ? 'review' : 'capture');
  const [queue, setQueue] = useState<File[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [rotation, setRotation] = useState<Rotation>(0);
  const [preview, setPreview] = useState<string>('');
  const [image, setImage] = useState<ScanImage | null>(null);
  const [progress, setProgress] = useState<OcrProgress>({ stage: 'Preparing', progress: 0 });
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Draft>(() => (editing ? draftFromExpense(editing) : emptyDraft(group.meId ?? group.members[0].id, todayIso())));
  const [categorizing, setCategorizing] = useState(false);
  const runId = useRef(0);
  const dirty = useRef(false);
  /** True until the user rotates by hand; while true a poor read retries other orientations. */
  const autoOrient = useRef(true);

  // Free memory when leaving the scanner.
  useEffect(() => () => void disposeOcr(), []);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  useEffect(() => () => void (image && URL.revokeObjectURL(image.url)), [image]);

  // Warn before closing the tab with unsaved edits.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const updateDraft = useCallback((fn: (d: Draft) => Draft) => {
    dirty.current = true;
    setDraft(fn);
  }, []);

  /** Load a file and show its preview (before any processing). */
  const loadFile = useCallback(async (file: File) => {
    setError('');
    try {
      const bmp = await loadBitmap(file);
      setBitmap(bmp);
      setRotation(0);
      autoOrient.current = true;
      setImage(null);
      setStep('capture');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  // Regenerate the preview whenever the image or rotation changes.
  useEffect(() => {
    if (!bitmap) return;
    let cancelled = false;
    canvasToBlob(drawRotated(bitmap, rotation)).then((b) => !cancelled && setPreview(URL.createObjectURL(b)));
    return () => {
      cancelled = true;
    };
  }, [bitmap, rotation]);

  const runCategorizer = useCallback(
    async (d: Draft) => {
      if (!autoCategorize || d.items.length === 0) return;
      setCategorizing(true);
      try {
        const cats: Category[] = await categorize(d.items.map((i) => i.name || 'item'));
        const byId = new Map(d.items.map((it, i) => [it.id, cats[i]]));
        setDraft((cur) => ({
          ...cur,
          items: cur.items.map((it) => (it.categoryLocked || !byId.has(it.id) ? it : { ...it, category: byId.get(it.id)! })),
        }));
      } catch {
        // Say it once per session, not on every receipt.
        if (!categorizerWarned) {
          categorizerWarned = true;
          toast('Auto-categorisation is unavailable right now — pick categories manually.', 'info');
        }
      } finally {
        setCategorizing(false);
      }
    },
    [autoCategorize],
  );

  /** Preprocess + OCR + parse. */
  const process = useCallback(
    async (rot: Rotation = rotation) => {
      if (!bitmap) return;
      const id = ++runId.current;
      setStep('processing');
      setError('');
      setProgress({ stage: 'Enhancing image', progress: 0.01 });
      try {
        // Read at the chosen rotation; if nothing sensible comes out and the user hasn't
        // rotated manually, try the two sideways orientations and keep the best read.
        const attempts: Rotation[] = autoOrient.current ? [rot, ((rot + 90) % 360) as Rotation, ((rot + 270) % 360) as Rotation] : [rot];
        let best: { rot: Rotation; canvas: HTMLCanvasElement; result: Awaited<ReturnType<typeof recognizeReceipt>>; parsed: ReturnType<typeof parseReceipt>; score: number } | null = null;
        for (const [n, r] of attempts.entries()) {
          if (n > 0) setProgress({ stage: 'Trying another orientation', progress: 0.4 });
          const canvas = drawRotated(bitmap, r);
          enhanceForOcr(canvas);
          const result = await recognizeReceipt(canvas, (p) => id === runId.current && setProgress(n > 0 ? { ...p, stage: `Trying ${r}° rotation` } : p));
          if (id !== runId.current) return;
          const parsed = parseReceipt(result.lines);
          const score = parsed.items.length * 10 + (parsed.totalPaise !== undefined ? 15 : 0) + result.meanConfidence / 10;
          if (!best || score > best.score) best = { rot: r, canvas, result, parsed, score };
          if (parsed.items.length >= 2 || (parsed.items.length > 0 && result.meanConfidence >= 50)) break;
        }
        if (!best) return;
        const { result, parsed } = best;
        if (best.rot !== rot) {
          setRotation(best.rot);
          toast(`The receipt looked sideways, so it was rotated ${best.rot}°`, 'info');
        }
        const colourUrl = URL.createObjectURL(await canvasToBlob(drawRotated(bitmap, best.rot)));
        setImage({ url: colourUrl, width: best.canvas.width, height: best.canvas.height, lines: result.lines, meanConfidence: result.meanConfidence });
        const next = draftFromParsed(parsed, emptyDraft(draft.payerId, todayIso()));
        // A short "what we found" beat before the review screen.
        const taxes = parsed.adjustments.filter((a) => a.kind === 'tax').length;
        setProgress({
          stage: parsed.items.length
            ? `Found ${parsed.items.length} item${parsed.items.length === 1 ? '' : 's'}${taxes ? `, ${taxes} tax${taxes === 1 ? '' : 'es'}` : ''}`
            : 'No items found',
          progress: 1,
        });
        await new Promise((r) => setTimeout(r, 650));
        if (id !== runId.current) return;
        setDraft(next);
        dirty.current = true;
        setStep('review');
        runCategorizer(next);
      } catch (e) {
        if (id !== runId.current) return;
        setError((e as Error).message || 'Something went wrong while reading the receipt.');
        setStep('capture');
      }
    },
    [bitmap, rotation, draft.payerId, runCategorizer],
  );

  const cancelProcessing = () => {
    runId.current++;
    setStep('capture');
  };

  const startManual = () => {
    setImage(null);
    setDraft((d) => ({ ...emptyDraft(d.payerId, todayIso()), description: 'Receipt' }));
    setStep('review');
  };

  const addFiles = (files: File[]) => {
    if (files.length === 0) return;
    setQueue(files);
    setQueueIndex(0);
    loadFile(files[0]);
  };

  const save = () => {
    const expense = draftToExpense(draft, editing?.createdAt);
    saveExpense(group.id, expense);
    dirty.current = false;
    const next = queueIndex + 1;
    if (!editing && next < queue.length) {
      toast(`Saved “${expense.description}”. Next receipt ${next + 1} of ${queue.length}`);
      setQueueIndex(next);
      setDraft(emptyDraft(draft.payerId, todayIso()));
      loadFile(queue[next]);
      return;
    }
    toast(editing ? 'Receipt updated' : 'Receipt saved and split');
    navigate(`/g/${group.id}/balances`, true);
  };

  const stepIndex = STEPS.findIndex((s) => s.id === (step === 'processing' ? 'capture' : step));
  // Slide forward or back depending on the direction of travel between steps.
  const lastIndex = useRef(stepIndex);
  const direction = stepIndex >= lastIndex.current ? 'forward' : 'back';
  useEffect(() => {
    lastIndex.current = stepIndex;
  }, [stepIndex]);
  const batchLabel = queue.length > 1 ? ` · receipt ${queueIndex + 1} of ${queue.length}` : '';

  return (
    <>
      <AppBar back={`#/g/${group.id}`} title={editing ? 'Edit receipt' : 'Scan receipt'} subtitle={`${group.name}${batchLabel}`} />
      <nav className="stepper" aria-label="Progress">
        <ol>
          {STEPS.map((s, i) => (
            <li key={s.id} className={i < stepIndex ? 'done' : i === stepIndex ? 'current' : ''} aria-current={i === stepIndex ? 'step' : undefined}>
              <span className="step-dot">{i + 1}</span>
              <span className="step-label">{s.label}</span>
            </li>
          ))}
        </ol>
      </nav>
      <main id="main" className={`page with-fab ${step === 'review' ? 'wide' : ''}`}>
        <div key={step} className={`step-anim step-${direction}`}>
        {step === 'capture' && (
          <CaptureStep
            preview={bitmap ? preview : ''}
            error={error}
            onFiles={addFiles}
            onRotate={(delta) => {
              autoOrient.current = false;
              setRotation((r) => (((r + delta + 360) % 360) as Rotation));
            }}
            onProcess={() => process()}
            onClear={() => {
              setBitmap(null);
              setPreview('');
              setQueue([]);
            }}
            onManual={startManual}
            queueLength={queue.length}
          />
        )}
        {step === 'processing' && <ProcessingStep preview={preview} progress={progress} onCancel={cancelProcessing} />}
        {step === 'review' && (
          <ReviewStep
            draft={draft}
            update={updateDraft}
            image={image}
            categorizing={categorizing}
            canRescan={!!bitmap}
            onRotate={(delta) => {
              autoOrient.current = false;
              const r = (((rotation + delta + 360) % 360) as Rotation);
              setRotation(r);
              process(r);
            }}
            onRetake={() => {
              setStep('capture');
              setBitmap(null);
              setPreview('');
            }}
            onManualFallback={startManual}
            onNext={() => setStep('assign')}
          />
        )}
        {step === 'assign' && <AssignStep group={group} draft={draft} update={updateDraft} onBack={() => setStep('review')} onNext={() => setStep('summary')} />}
        {step === 'summary' && (
          <SummaryStep
            group={group}
            draft={draft}
            update={updateDraft}
            onBack={() => setStep('assign')}
            onSave={save}
            onDelete={
              editing
                ? () => {
                    deleteExpense(group.id, editing.id);
                    dirty.current = false;
                    toast('Receipt deleted', 'success', { label: 'Undo', onClick: () => saveExpense(group.id, editing) });
                    navigate(`/g/${group.id}`, true);
                  }
                : undefined
            }
          />
        )}
        </div>
      </main>
    </>
  );
}
