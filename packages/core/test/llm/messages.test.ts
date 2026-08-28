import { describe, it, expect } from "vitest";
import { splitSystem } from "../../src/llm/messages.js";

describe("splitSystem", () => {
  it("hoists the system message out of the list", () => {
    const { system, rest } = splitSystem([
      { role: "system", content: "you are sammer" },
      { role: "user", content: "hi" },
    ]);
    expect(system).toEqual(["you are sammer"]);
    expect(rest).toEqual([{ role: "user", content: "hi" }]);
  });

  it("keeps multiple system messages separate and in order", () => {
    const { system } = splitSystem([
      { role: "system", content: "first" },
      { role: "user", content: "hi" },
      { role: "system", content: "second" },
    ]);
    expect(system).toEqual(["first", "second"]);
  });

  it("returns no segments when there is no system message", () => {
    const { system, rest } = splitSystem([{ role: "user", content: "hi" }]);
    expect(system).toEqual([]);
    expect(rest).toHaveLength(1);
  });
});
