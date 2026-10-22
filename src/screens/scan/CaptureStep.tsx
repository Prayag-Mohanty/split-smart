import { useCallback, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { Banner } from '../../components/ui';
import { CameraCapture } from './CameraCapture';

interface CaptureStepProps {
  preview: string;
  error: string;
  queueLength: number;
  onFiles: (files: File[]) => void;
  onRotate: (delta: number) => void;
  onProcess: () => void;
  onClear: () => void;
  onManual: () => void;
}

const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif';

export function CaptureStep({ preview, error, queueLength, onFiles, onRotate, onProcess, onClear, onManual }: CaptureStepProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraMessage, setCameraMessage] = useState('');
  const [dragging, setDragging] = useState(false);

  const closeCamera = useCallback(() => setCameraOpen(false), []);
  const onUnavailable = useCallback((msg: string) => setCameraMessage(msg), []);
  const onCapture = useCallback((f: File) => onFiles([f]), [onFiles]);

  const pick = (list: FileList | null) => {
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic)$/i.test(f.name));
    if (files.length) onFiles(files);
  };

  if (preview) {
    return (
      <div className="capture-preview stack">
        {error && <Banner tone="error">{error}</Banner>}
        <div className="card preview-card">
          <img src={preview} alt="Receipt preview" className="preview-img" />
          <div className="preview-tools" role="toolbar" aria-label="Image tools">
            <button type="button" className="btn btn-sm" onClick={() => onRotate(-90)} aria-label="Rotate left">
              <Icon name="rotateL" size={18} /> Rotate
            </button>
            <button type="button" className="btn btn-sm" onClick={() => onRotate(90)} aria-label="Rotate right">
              <Icon name="rotateR" size={18} />
            </button>
            <button type="button" className="btn btn-sm" onClick={onClear}>
              <Icon name="camera" size={18} /> Retake
            </button>
          </div>
        </div>
        <p className="small muted center-text">Make sure the text reads upright — rotate if needed. {queueLength > 1 && `${queueLength} receipts queued.`}</p>
        <div className="fab-bar">
          <button type="button" className="btn btn-primary btn-lg" onClick={onProcess} autoFocus>
            <Icon name="sparkle" /> Read receipt
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="stack-lg">
      {error && <Banner tone="error">{error}</Banner>}
      {/* While the camera dialog is open it shows the message itself; don't repeat it behind the dialog. */}
      {cameraMessage && !cameraOpen && <Banner tone="warn">{cameraMessage}</Banner>}
      <div
        className={`dropzone${dragging ? ' dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files);
        }}
      >
        <div className="dropzone-icon">
          <Icon name="receipt" size={36} />
        </div>
        <h2>Add a receipt</h2>
        <p className="muted">Take a photo or upload one (JPG/PNG). Select several to batch-scan a whole trip.</p>
        <div className="capture-actions">
          <button type="button" className="btn btn-primary btn-lg" onClick={() => setCameraOpen(true)}>
            <Icon name="camera" /> Use camera
          </button>
          <button type="button" className="btn btn-lg" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" /> Upload photo
          </button>
        </div>
        {/* On phones the native picker also offers the camera directly. */}
        <input ref={fileRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => pick(e.target.files)} aria-label="Upload receipt images" />
        <p className="small muted">or drag & drop images here</p>
      </div>
      <button type="button" className="btn btn-ghost" onClick={onManual}>
        <Icon name="edit" size={18} /> No photo? Enter items by hand
      </button>
      <ul className="tips small muted">
        <li>Lay the receipt flat in good light and fill the frame.</li>
        <li>Everything runs on your device — the photo is never uploaded.</li>
        <li>The first scan downloads the OCR model (~7 MB); later scans are faster and work offline.</li>
      </ul>
      <CameraCapture open={cameraOpen} onClose={closeCamera} onCapture={onCapture} onUnavailable={onUnavailable} />
    </div>
  );
}
