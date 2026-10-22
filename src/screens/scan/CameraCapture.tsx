import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { Modal } from '../../components/Modal';
import { Banner } from '../../components/ui';

interface CameraCaptureProps {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
  /** Called when the camera can't be used so the parent can offer upload instead. */
  onUnavailable: (message: string) => void;
}

function describeError(err: unknown): string {
  const name = (err as DOMException)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'Camera permission was denied. You can still upload a photo of the receipt — or allow camera access in your browser settings and try again.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found on this device. Upload a photo of the receipt instead.';
  if (name === 'NotReadableError') return 'The camera is being used by another app. Close it, or upload a photo instead.';
  return 'The camera could not be started. Upload a photo of the receipt instead.';
}

/** Live camera viewfinder using getUserMedia (rear camera preferred). */
export function CameraCapture({ open, onClose, onCapture, onUnavailable }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setReady(false);
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      const msg = 'This browser cannot open the camera here (it needs HTTPS). Upload a photo instead.';
      onUnavailable(msg);
      onClose();
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then((stream) => {
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          v.play().then(() => setReady(true), () => setReady(true));
        }
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = describeError(err);
        setError(msg);
        onUnavailable(msg);
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open, onClose, onUnavailable]);

  const snap = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    c.toBlob(
      (blob) => {
        if (blob) onCapture(new File([blob], `receipt-${Date.now()}.jpg`, { type: 'image/jpeg' }));
        onClose();
      },
      'image/jpeg',
      0.92,
    );
  };

  return (
    <Modal open={open} title="Take a photo" onClose={onClose} wide>
      {error ? (
        <Banner tone="warn">{error}</Banner>
      ) : (
        <div className="camera">
          <video ref={videoRef} playsInline muted aria-label="Camera preview" />
          {!ready && <p className="camera-hint">Starting camera…</p>}
          <div className="camera-guide" aria-hidden="true" />
          <p className="small muted center-text">Fill the frame with the receipt, flat and well lit.</p>
          <button type="button" className="btn btn-primary btn-lg shutter" onClick={snap} disabled={!ready}>
            <Icon name="camera" /> Capture
          </button>
        </div>
      )}
    </Modal>
  );
}
