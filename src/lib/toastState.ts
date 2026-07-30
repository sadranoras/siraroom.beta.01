import type { Toast } from './toast';

type Listener = (t: Toast) => void;
const listeners = new Set<Listener>();

export function create(t: Toast) {
  listeners.forEach((l) => l(t));
}

create.subscribe = (l: Listener) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
