/**
 * Home/Work favourites (Moovit teardown gap #3 — highest daily-retention impact).
 *
 * Persists to AsyncStorage when it's installed, otherwise keeps favourites
 * in-memory for the session. This avoids forcing a new native dependency
 * (cost/footprint constraint); add `@react-native-async-storage/async-storage`
 * later to make them survive app restarts — no code change needed here.
 */
import type { Favourite } from "../types";

export type FavKey = "home" | "work";
export type Favourites = Partial<Record<FavKey, Favourite>>;

const STORAGE_KEY = "godeez_favs";
let cache: Favourites = {};
const listeners = new Set<(f: Favourites) => void>();

// Best-effort dynamic handle to AsyncStorage; null when not installed.
let storage: {
  getItem: (k: string) => Promise<string | null>;
  setItem: (k: string, v: string) => Promise<void>;
} | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  storage = require("@react-native-async-storage/async-storage").default;
} catch {
  storage = null;
}

export async function loadFavourites(): Promise<Favourites> {
  if (storage) {
    try {
      const raw = await storage.getItem(STORAGE_KEY);
      cache = raw ? (JSON.parse(raw) as Favourites) : {};
    } catch {
      cache = {};
    }
  }
  emit();
  return cache;
}

function persist() {
  if (storage) storage.setItem(STORAGE_KEY, JSON.stringify(cache)).catch(() => {});
}

function emit() {
  for (const l of listeners) l({ ...cache });
}

export function getFavourites(): Favourites {
  return { ...cache };
}

export function isFavourite(key: FavKey, stopId: string): boolean {
  return cache[key]?.stop_id === stopId;
}

/** Toggle: set the favourite, or clear it if the same stop is already saved. */
export function toggleFavourite(key: FavKey, fav: Favourite): boolean {
  if (cache[key]?.stop_id === fav.stop_id) {
    delete cache[key];
    persist();
    emit();
    return false;
  }
  cache[key] = fav;
  persist();
  emit();
  return true;
}

export function subscribe(fn: (f: Favourites) => void): () => void {
  listeners.add(fn);
  fn({ ...cache });
  return () => listeners.delete(fn);
}
