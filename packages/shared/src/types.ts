export interface PageMetadata {
  id: string;
  title: string;
  slug: string;
  category: string; // single primary bucket — drives the section in index.md
  tags: string[]; // cross-cutting labels for search/filtering (many per page)
  summary: string; // one-line summary shown in index.md
  created: string; // ISO
  updated: string; // ISO
  sources: string[]; // raw-blob refs (populated in a later milestone)
}

export interface Page extends PageMetadata {
  body: string; // markdown body (no metadata)
  links: string[]; // slugs referenced via [[..]] in body
}

export interface Chunk {
  pageId: string;
  ord: number;
  text: string;
}

export interface SearchHit {
  slug: string;
  title: string;
  score: number;
  snippet: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON schema
}

export type ModelMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; content: string };
