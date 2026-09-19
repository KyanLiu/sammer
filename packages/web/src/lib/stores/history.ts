import { writable, type Writable } from "svelte/store";

export interface HistoryEntry {
  id: string;
  question: string;
  answer: string;
}

export interface HistoryStore extends Writable<HistoryEntry[]> {
  add(question: string, answer: string): HistoryEntry;
  reset(): void;
}

export function createHistoryStore(): HistoryStore {
  const store = writable<HistoryEntry[]>([]);

  return {
    ...store,
    add(question: string, answer: string): HistoryEntry {
      const entry: HistoryEntry = { id: crypto.randomUUID(), question, answer };
      store.update((entries) => [...entries, entry]);
      return entry;
    },
    reset(): void {
      store.set([]);
    },
  };
}

export const history = createHistoryStore();
