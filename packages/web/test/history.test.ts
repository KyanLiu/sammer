import { describe, expect, it } from "vitest";
import { get } from "svelte/store";
import { createHistoryStore } from "../src/lib/stores/history.js";

describe("createHistoryStore", () => {
  it("starts empty", () => {
    const store = createHistoryStore();
    expect(get(store)).toEqual([]);
  });

  it("adds an entry with a generated id and returns it", () => {
    const store = createHistoryStore();

    const entry = store.add("What am I forgetting?", "The pricing sheet.");

    expect(entry.question).toBe("What am I forgetting?");
    expect(entry.answer).toBe("The pricing sheet.");
    expect(entry.id).toBeTruthy();
    expect(get(store)).toEqual([entry]);
  });

  it("appends rather than replacing", () => {
    const store = createHistoryStore();

    store.add("q1", "a1");
    store.add("q2", "a2");

    expect(get(store)).toHaveLength(2);
  });

  it("reset clears all entries", () => {
    const store = createHistoryStore();
    store.add("q1", "a1");

    store.reset();

    expect(get(store)).toEqual([]);
  });
});
