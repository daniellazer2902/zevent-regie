import type { HistoryEntry } from "./types";

const HISTORY_KEY = "zevent-regie:history";
const HISTORY_MAX = 40;

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Stockage plein ou navigation privée : l'historique est un confort,
    // son échec ne doit jamais interrompre la régie.
  }
}

export function readHistory(): HistoryEntry[] {
  return readJson<HistoryEntry[]>(HISTORY_KEY, []);
}

export function pushHistory(entry: Omit<HistoryEntry, "seenAt">): HistoryEntry[] {
  const rest = readHistory().filter((h) => h.login !== entry.login);
  const next = [{ ...entry, seenAt: Date.now() }, ...rest].slice(0, HISTORY_MAX);
  writeJson(HISTORY_KEY, next);
  return next;
}

export function clearHistory(): HistoryEntry[] {
  writeJson(HISTORY_KEY, []);
  return [];
}
