import { ProgressBar } from '../../components/ui';
import type { OcrProgress } from '../../services/ocr';

export function ProcessingStep({ preview, progress, onCancel }: { preview: string; progress: OcrProgress; onCancel: () => void }) {
  return (
    <div className="processing">
      <div className="scan-visual">
        {preview && <img src={preview} alt="" />}
        <span className="scan-line" aria-hidden="true" />
      </div>
      <div className="processing-status" aria-live="polite">
        <strong>{progress.stage}…</strong>
        <span className="muted">{Math.round(progress.progress * 100)}%</span>
      </div>
      <ProgressBar value={progress.progress} label="Reading receipt" />
      <p className="small muted center-text">You can keep using the app — text recognition runs in a background worker.</p>
      <button type="button" className="btn btn-ghost" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
