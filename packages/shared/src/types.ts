export type Slug = string

export interface RecordMetadata {
  id: string;
  title: string;
  category: string;
  tags: string[];
  summary: string;
  created: string; // ISO
  updated: string; // ISO
}
// metadata for each page
export interface PageMetadata extends RecordMetadata {
  slug: Slug; // the .md file name
  sources: SourceMetadata[]; // metadata of the sources this page was curated from
}
// Page is derived and created from sources, can reference other pages 
export interface Page {
  metadata: PageMetadata;
  body: string; // markdown body
  links: Slug[]; // slugs referenced via [[..]] in body
}
// Source types
export const SOURCE_KINDS = ["text", "conversation", "image", "pdf", "audio", "video"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];
// metadata for the raw sources
export interface SourceMetadata extends RecordMetadata {
  kind: SourceKind;
  origin: string;
  externalId?: string;
  url?: string;
}
export interface Source<T extends SourceMetadata = SourceMetadata> {
// Raw Source
  metadata: T;
  fileName: string;
}
export interface TextSourceMetadata extends SourceMetadata {
  kind: "text" | "conversation";
}
export type TextSource = Source<TextSourceMetadata>;

export interface ImageSourceMetadata extends SourceMetadata {
  kind: "image";
  width?: number;
  height?: number;
  mime?: string;
}
export type ImageSource = Source<ImageSourceMetadata>;

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

export type AgentEvent =
  | { type: "agent-start"; timestamp: number; runId: string; parentRunId?: string; agentId: string }
  | {
      type: "agent-end";
      timestamp: number;
      runId: string;
      agentId: string;
      durationMs: number;
      output?: string;
      error?: string;
    }
  | {
      type: "tool-start";
      timestamp: number;
      runId: string;
      agentId: string;
      iteration: number;
      callId: string;
      name: string;
      args: Record<string, unknown>;
    }
  | {
      type: "tool-end";
      timestamp: number;
      runId: string;
      agentId: string;
      iteration: number;
      callId: string;
      name: string;
      result: string;
      durationMs: number;
    };
