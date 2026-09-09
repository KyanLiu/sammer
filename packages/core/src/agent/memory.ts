import type { ModelMessage } from "@sammer/shared";

// Agent Memory, simple managed memory for now
export class Memory {
  private messages: ModelMessage[];

  constructor(seed: ModelMessage[] = []) {
    this.messages = [...seed];
  }

  get(): ModelMessage[] {
    return this.messages;
  }

  append(...entries: ModelMessage[]): void {
    this.messages.push(...entries);
  }

  clear(): void {
    this.messages = [];
  }
}
