import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { slugify, type Source, type SourceMetadata } from "@sammer/shared";
import { parseRecord, serializeRecord } from "./format.js";

// The JSON files hold the metadata that reference the data
export class RawStore {
  constructor(private readonly dir: string) {}

  // `origin` and `id` become path segments and both can arrive over HTTP, so they are
  // slugified rather than trusted — a `../` in either would otherwise escape the archive.
  private file(origin: string, id: string, ext: string): string {
    return join(this.dir, slugify(origin), `${slugify(id)}.${ext}`);
  }

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
  }

  async has(origin: string, id: string): Promise<boolean> {
    return (await this.read(origin, id)) !== null;
  }

  // this will need to be changed for if there are bytes being passed, text only for now
  async write(metadata: SourceMetadata, content: string): Promise<Source> {
    const fileName = `${slugify(metadata.id)}.txt`;
    const contentPath = join(this.dir, slugify(metadata.origin), fileName);
    await mkdir(dirname(contentPath), { recursive: true });
    await writeFile(contentPath, content, "utf8");
    const source: Source = { metadata, fileName };
    await writeFile(this.file(metadata.origin, metadata.id, "json"), serializeRecord(source), "utf8");
    return source;
  }

  async read(origin: string, id: string): Promise<Source | null> {
    try {
      return parseRecord(await readFile(this.file(origin, id, "json"), "utf8"), { origin, id });
    } catch (e: any) {
      if (e.code === "ENOENT") return null;
      throw e;
    }
  }

  async readContent(source: Source): Promise<string> {
    const path = join(this.dir, slugify(source.metadata.origin), source.fileName);
    try {
      return await readFile(path, "utf8");
    } catch (e: any) {
      // The record exists, so the material was stored; a missing content file is damage
      // rather than absence, and reporting it as empty would disguise that.
      if (e.code === "ENOENT") {
        throw new Error(
          `raw source ${source.metadata.origin}/${source.metadata.id} is missing its content file ${source.fileName}`,
        );
      }
      throw e;
    }
  }

  // Metadata only — enumerating the archive never reads a content file.
  async list(): Promise<Source[]> {
    const out: Source[] = [];
    const origins = await readdir(this.dir, { withFileTypes: true }).catch(() => []);
    for (const entry of origins) {
      if (!entry.isDirectory()) continue;
      const files = await readdir(join(this.dir, entry.name)).catch(() => []);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const source = await this.read(entry.name, file.slice(0, -5));
        if (source) out.push(source);
      }
    }
    return out;
  }
}
