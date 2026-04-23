import { useState, useCallback, useRef } from 'react';

interface ToastState {
  message: string;
  onUndo: () => void;
}

export function useUndoToast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissToast = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setToast(null);
  }, []);

  const showUndo = useCallback((message: string, undoAction: () => void) => {
    // Dismiss any existing toast first
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setToast({ message, onUndo: undoAction });
  }, []);

  return { toast, showUndo, dismissToast };
}
