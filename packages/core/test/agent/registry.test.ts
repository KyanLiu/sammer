import { describe, it, expect } from "vitest";
import { z } from "zod";
import { ToolRegistry, type Tool } from "../../src/agent/registry.js";
import { defineTool } from "../../src/agent/define-tool.js";

function tool(name: string, mutates: boolean, run: Tool["run"] = async () => "ok"): Tool {
  return { def: { name, description: "d", parameters: { type: "object", properties: {} } }, mutates, run };
}

describe("ToolRegistry", () => {
  it("hides mutating tools when the caller asks for read-only ones", () => {
    const registry = new ToolRegistry();
    registry.register(tool("read_page", false));
    registry.register(tool("write_page", true));

    expect(registry.defs().map((d) => d.name)).toEqual(["read_page", "write_page"]);
    expect(registry.defs({ readOnly: true }).map((d) => d.name)).toEqual(["read_page"]);
  });

  it("refuses to dispatch a mutating tool to a read-only caller", async () => {
    const registry = new ToolRegistry();
    registry.register(tool("write_page", true, async () => "WROTE"));

    const out = await registry.invoke("write_page", {}, { readOnly: true });

    expect(out).not.toContain("WROTE");
    expect(out).toMatch(/not available/i);
  });

  it("returns the tool's output", async () => {
    const registry = new ToolRegistry();
    registry.register(tool("search_wiki", false, async (args: any) => `found ${args.query}`));

    expect(await registry.invoke("search_wiki", { query: "cats" })).toBe("found cats");
  });

  it("reports an unknown tool instead of throwing", async () => {
    const registry = new ToolRegistry();
    expect(await registry.invoke("nope", {})).toBe('Error: unknown tool "nope".');
  });

  it("reports a throwing tool instead of propagating", async () => {
    const registry = new ToolRegistry();
    registry.register(
      tool("search_wiki", false, async () => {
        throw new Error("index unavailable");
      }),
    );

    expect(await registry.invoke("search_wiki", {})).toBe("Error: index unavailable");
  });

  it("passes the abort signal through to the tool", async () => {
    const registry = new ToolRegistry();
    const controller = new AbortController();
    let seen: AbortSignal | undefined;
    registry.register(
      tool("slow", false, async (_args, ctx) => {
        seen = ctx.signal;
        return "ok";
      }),
    );

    await registry.invoke("slow", {}, { signal: controller.signal });

    expect(seen).toBe(controller.signal);
  });
});

describe("defineTool", () => {
  const search = defineTool({
    name: "search_wiki",
    description: "Search it",
    mutates: false,
    schema: z.object({ query: z.string(), limit: z.number().optional() }),
    run: async ({ query, limit }) => `${query}:${limit ?? 5}`,
  });

  it("derives the JSON Schema the model sees from the zod schema", () => {
    expect(search.def.name).toBe("search_wiki");
    expect(search.def.parameters).toMatchObject({
      type: "object",
      properties: { query: { type: "string" }, limit: { type: "number" } },
      required: ["query"],
    });
  });

  it("hands run the parsed arguments", async () => {
    expect(await search.run({ query: "cats", limit: 2 }, {})).toBe("cats:2");
  });

  it("turns invalid arguments into a readable error", async () => {
    const registry = new ToolRegistry();
    registry.register(search);

    const out = await registry.invoke("search_wiki", { limit: 2 });

    expect(out).toMatch(/^Error: invalid arguments/);
    expect(out).toContain("query");
  });
});
