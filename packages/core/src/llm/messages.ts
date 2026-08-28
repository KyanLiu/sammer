import type { ModelMessage } from "@sammer/shared";

// separate the system messages from the rest, one segment per message
export function splitSystem(messages: ModelMessage[]): {
  system: string[];
  rest: ModelMessage[];
} {
  const system: string[] = [];
  const rest: ModelMessage[] = [];
  for (const m of messages) {
    if (m.role === "system") system.push(m.content);
    else rest.push(m);
  }
  return { system, rest };
}
