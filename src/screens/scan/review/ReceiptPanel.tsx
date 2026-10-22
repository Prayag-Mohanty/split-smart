import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../../components/Icon';
import { Modal } from '../../../components/Modal';
import { LOW_CONFIDENCE } from '../../../lib/receiptParser';
import type { ScanImage } from '../ScanFlow';

interface ReceiptPanelProps {
  image: ScanImage | null;
  /** False when editing a saved receipt (photos are never stored). */
  fromScan: boolean;
  activeLine?: number;
  canRescan: boolean;
  onRotate: (delta: number) => void;
  onRetake: () => void;
}

/**
 * The original photo beside (desktop) or above (phone) the parsed table, with
 * low-confidence words outlined and the line being edited highlighted.
 */
export function ReceiptPanel({ image, fromScan, activeLine, canRescan, onRotate, onRetake }: ReceiptPanelProps) {
  // Phones start with a compact strip (in the page flow, not floating) so the fields to fix come first;
  // desktop shows the photo beside the table.
  const [showImage, setShowImage] = useState(() => window.matchMedia?.('(min-width: 960px)').matches ?? true);
  const [zoomed, setZoomed] = useState(false);
  const [zoom, setZoom] = useState<1 | 2>(1);
  const stageRef = useRef<HTMLDivElement>(null);

  // Keep the line being edited in view inside the photo strip / panel.
  useEffect(() => {
    const stage = stageRef.current;
    const box = activeLine !== undefined ? image?.lines[activeLine]?.bbox : undefined;
    if (!stage || !box || !image) return;
    const scale = stage.scrollWidth / image.width;
    stage.scrollTo({ top: Math.max(0, box.y0 * scale - stage.clientHeight / 3), behavior: 'smooth' });
  }, [activeLine, image, showImage]);

  if (!image) {
    return (
      <aside className="review-image" aria-label="Original receipt">
        {!fromScan && (
          <div className="card muted small">
            <Icon name="image" /> Receipt photos are never stored — only the items you saved.
          </div>
        )}
      </aside>
    );
  }

  return (
    <>
      <aside className={`review-image${showImage ? '' : ' is-strip'}`} aria-label="Original receipt">
        <div className="card">
          <div className="review-image-head">
            <strong>Original</strong>
            <button type="button" className="btn btn-sm btn-ghost hide-desktop" onClick={() => setShowImage((s) => !s)} aria-expanded={showImage}>
              {showImage ? 'Hide' : 'Show'}
            </button>
          </div>
          <div
            ref={stageRef}
            className={`image-stage${showImage ? '' : ' compact'}`}
            onClick={() => !showImage && setZoomed(true)}
            role={showImage ? undefined : 'button'}
            tabIndex={showImage ? undefined : 0}
            aria-label={showImage ? undefined : 'Open the receipt photo full screen'}
            onKeyDown={(e) => !showImage && (e.key === 'Enter' || e.key === ' ') && setZoomed(true)}
          >
            <ReceiptImage image={image} activeLine={activeLine} />
            {!showImage && (
              <span className="strip-hint">
                <Icon name="image" size={14} /> Tap to zoom
              </span>
            )}
          </div>
          {showImage && (
            <>
              <div className="preview-tools" role="toolbar" aria-label="Image tools">
                <button type="button" className="btn btn-sm" onClick={() => setZoomed(true)} aria-label="Open full screen">
                  <Icon name="image" size={16} /> Zoom
                </button>
                <button type="button" className="btn btn-sm" onClick={() => onRotate(-90)} disabled={!canRescan} aria-label="Rotate left and re-scan">
                  <Icon name="rotateL" size={16} />
                </button>
                <button type="button" className="btn btn-sm" onClick={() => onRotate(90)} disabled={!canRescan} aria-label="Rotate right and re-scan">
                  <Icon name="rotateR" size={16} />
                </button>
                <button type="button" className="btn btn-sm" onClick={onRetake}>
                  <Icon name="camera" size={16} /> Retake
                </button>
              </div>
              <p className="small muted legend-inline">
                <span className="legend-swatch low" /> low-confidence words · tap a row to locate it
              </p>
              <details className="small raw-text">
                <summary>Raw OCR text</summary>
                <pre>{image.lines.map((l) => l.text).join('\n') || '(no text found)'}</pre>
              </details>
            </>
          )}
        </div>
      </aside>
      <Modal open={zoomed} title="Original receipt" onClose={() => setZoomed(false)} wide>
        <div className="zoom-controls">
          <button type="button" className="btn btn-sm" onClick={() => setZoom((z) => (z === 1 ? 2 : 1))} aria-pressed={zoom === 2}>
            {zoom === 1 ? 'Zoom in 2×' : 'Fit to screen'}
          </button>
        </div>
        <div className="zoom-stage">
          <div style={{ width: `${zoom * 100}%` }}>
            <ReceiptImage image={image} activeLine={activeLine} />
          </div>
        </div>
      </Modal>
    </>
  );
}

/** The receipt photo with low-confidence words and the active line outlined. */
function ReceiptImage({ image, activeLine }: { image: ScanImage; activeLine?: number }) {
  const active = activeLine !== undefined ? image.lines[activeLine]?.bbox : undefined;
  return (
    <div className="receipt-image">
      <img src={image.url} alt="Scanned receipt" />
      <svg viewBox={`0 0 ${image.width} ${image.height}`} className="ocr-overlay" aria-hidden="true">
        {image.lines.flatMap((l, li) =>
          l.words
            .filter((w) => w.bbox && w.confidence < LOW_CONFIDENCE)
            .map((w, wi) => (
              <rect
                key={`${li}-${wi}`}
                className="ocr-low"
                x={w.bbox!.x0}
                y={w.bbox!.y0}
                width={w.bbox!.x1 - w.bbox!.x0}
                height={w.bbox!.y1 - w.bbox!.y0}
                rx={4}
              />
            )),
        )}
        {active && (
          <rect className="ocr-active" x={active.x0 - 6} y={active.y0 - 4} width={active.x1 - active.x0 + 12} height={active.y1 - active.y0 + 8} rx={6} />
        )}
      </svg>
    </div>
  );
}
