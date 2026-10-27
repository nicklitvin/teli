import { useSyncExternalStore } from 'react';

/** Your display name: set in Profile settings, shown to your crew. Saved on this device. */

const KEY = 'teli:name:v1';
const subs = new Set<() => void>();
let current = read();

function read(): string {
  try {
    const v = localStorage.getItem(KEY);
    if (v !== null) return v.slice(0, 40);
    // Names used to live with the crew settings.
    const old = JSON.parse(localStorage.getItem('teli:crew:v1') ?? 'null');
    return typeof old?.name === 'string' ? old.name.slice(0, 40) : '';
  } catch {
    return '';
  }
}

export function setName(name: string) {
  current = name.slice(0, 40);
  try {
    localStorage.setItem(KEY, current);
  } catch {
    /* quota / private mode — the name lasts until reload */
  }
  subs.forEach((f) => f());
}

export function useName(): string {
  return useSyncExternalStore((f) => {
    subs.add(f);
    return () => subs.delete(f);
  }, () => current);
}
