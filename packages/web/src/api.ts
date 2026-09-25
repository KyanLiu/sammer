export interface AskResponse {
  answer: string;
}

export interface Session {
  email?: string;
  role: string;
}

// VITE_SERVER_URL must be the @sammer/server root URL (no trailing path) —
// requests are made to `${baseUrl()}/ask`. Unset, it defaults to "/api" in dev
// (the Vite proxy path, see vite.config.ts) and "" in a production build,
// since there the same server serves both the API and this bundle from one origin.
function baseUrl(): string {
  return import.meta.env.VITE_SERVER_URL ?? (import.meta.env.DEV ? "/api" : "");
}

interface SseFrame {
  event?: string;
  data?: string;
}

function parseSseFrame(raw: string): SseFrame {
  const frame: SseFrame = {};
  const dataLines: string[] = [];
  for (const line of raw.split("\n")) {
    // A leading colon marks a comment (the server's keep-alive heartbeat) —
    // ignore it per the SSE spec, same as EventSource would.
    if (!line || line.startsWith(":")) continue;
    const sep = line.indexOf(": ");
    if (sep === -1) continue;
    const field = line.slice(0, sep);
    const value = line.slice(sep + 2);
    if (field === "event") frame.event = value;
    else if (field === "data") dataLines.push(value);
  }
  if (dataLines.length) frame.data = dataLines.join("\n");
  return frame;
}

// The server negotiates SSE for /ask so a slow local-model answer keeps the
// connection alive via heartbeats instead of looking like a dead socket
// (see packages/server/src/routes/ask.ts). This reads that stream for the
// one "answer" (or "error") frame it ultimately sends, ignoring the leading
// "ack" frame and any heartbeat comments in between.
async function readAnswer(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = parseSseFrame(buffer.slice(0, sep));
      buffer = buffer.slice(sep + 2);
      if (frame.event === "answer" && frame.data !== undefined) {
        return (JSON.parse(frame.data) as AskResponse).answer;
      }
      if (frame.event === "error" && frame.data !== undefined) {
        throw new Error((JSON.parse(frame.data) as { message: string }).message);
      }
    }
  }
  throw new Error("ask stream ended without an answer");
}

export async function ask(question: string, opts: { allowWrite?: boolean } = {}): Promise<string> {
  const res = await fetch(`${baseUrl()}/ask`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ question, allowWrite: opts.allowWrite }),
  });
  if (!res.ok) {
    throw new Error(`ask failed: ${res.status} ${res.statusText}`);
  }
  if (res.body && res.headers.get("content-type")?.includes("text/event-stream")) {
    return readAnswer(res.body);
  }
  const data = (await res.json()) as AskResponse;
  return data.answer;
}

export async function login(email: string, password: string): Promise<Session> {
  const res = await fetch(`${baseUrl()}/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "login failed");
  }
  return (await res.json()) as Session;
}

export async function logout(): Promise<void> {
  await fetch(`${baseUrl()}/auth/logout`, { method: "POST", credentials: "include" });
}

export async function me(): Promise<Session> {
  const res = await fetch(`${baseUrl()}/auth/me`, { credentials: "include" });
  return (await res.json()) as Session;
}

export interface IngestResult {
  summary: string;
  skipped: boolean;
  curated: boolean;
}

export async function ingestText(
  text: string,
  source?: { origin: string; title?: string; url?: string },
): Promise<IngestResult> {
  const res = await fetch(`${baseUrl()}/ingest`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, source }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "ingest failed");
  }
  return (await res.json()) as IngestResult;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, { credentials: "include" });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `request to ${path} failed`);
  }
  return (await res.json()) as T;
}

export interface PageSummary {
  slug: string;
  title: string;
  category: string;
  summary: string;
  role: string;
  updated: string;
}

export interface GraphNode {
  slug: string;
  title: string;
  category: string;
  role: string;
  summary: string;
}

export interface GraphEdge {
  src: string;
  dst: string;
}

export interface PageGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface Page {
  metadata: {
    id: string;
    title: string;
    slug: string;
    category: string;
    tags: string[];
    summary: string;
    created: string;
    updated: string;
    role: string;
  };
  body: string;
  links: string[];
}

export interface RawSource {
  metadata: {
    id: string;
    title: string;
    kind: string;
    origin: string;
    created: string;
    updated: string;
  };
  fileName: string;
}

export interface RawSourceContent {
  source: RawSource;
  content: string;
}

export async function listPageSummaries(): Promise<PageSummary[]> {
  return getJson<PageSummary[]>("/pages");
}

export async function getPageGraph(): Promise<PageGraph> {
  return getJson<PageGraph>("/pages/graph");
}

export async function getGeneratedFile(name: "index" | "log"): Promise<string> {
  const data = await getJson<{ name: string; content: string }>(`/pages/generated/${name}`);
  return data.content;
}

export async function getPage(slug: string): Promise<Page> {
  return getJson<Page>(`/pages/${encodeURIComponent(slug)}`);
}

export async function getPageRaw(slug: string): Promise<string> {
  const data = await getJson<{ slug: string; raw: string }>(`/pages/${encodeURIComponent(slug)}/raw`);
  return data.raw;
}

export async function savePageRaw(slug: string, raw: string): Promise<Page> {
  const res = await fetch(`${baseUrl()}/pages/${encodeURIComponent(slug)}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "save failed");
  }
  return (await res.json()) as Page;
}

export async function listRawSources(): Promise<RawSource[]> {
  return getJson<RawSource[]>("/raw");
}

export async function getRawSource(origin: string, id: string): Promise<RawSourceContent> {
  return getJson<RawSourceContent>(`/raw/${encodeURIComponent(origin)}/${encodeURIComponent(id)}`);
}
