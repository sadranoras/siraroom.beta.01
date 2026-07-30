import { useEffect, useState } from 'react';
import { create } from './toastState';

export type ToastKind = 'success' | 'error' | 'info';
export type Toast = { id: number; kind: ToastKind; message: string };

let counter = 0;
export function pushToast(message: string, kind: ToastKind = 'info') {
  create({ id: ++counter, kind, message });
}

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => {
    return create.subscribe((t) => {
      setToasts((prev) => [...prev, t]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== t.id));
      }, 3200);
    });
  }, []);
  return toasts;
}
