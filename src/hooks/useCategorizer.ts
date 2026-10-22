import { useEffect, useState } from 'react';
import { onClassifierStatus, type ClassifierStatus } from '../services/classifier';

/** Subscribe to the lazy zero-shot model's loading status. */
export function useClassifierStatus(): { status: ClassifierStatus; progress: number } {
  const [state, setState] = useState<{ status: ClassifierStatus; progress: number }>({ status: 'idle', progress: 0 });
  useEffect(() => onClassifierStatus((status, progress) => setState({ status, progress })), []);
  return state;
}
