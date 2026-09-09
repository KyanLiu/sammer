import { mkdir, readFile, writeFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { slugify, toDay, type Source, type SourceMetadata } from "@sammer/shared";
import { parseRecord, serializeRecord } from "./format.js";

const META_SUFFIX = ".meta.json";
const DEFAULT_EXT = ".txt";

const exists = (path: string) => stat(path).then(() => true, () => false);

// The JSON files hold the metadata that reference the data
export class RawStore {
  constructor(private readonly dir: string) {}

  // the dir for the raw source content, adds the origin suffix
  // ex: /data/raw/cli
  private originDir(origin: string): string {
    return join(this.dir, slugify(origin));
  }
  // raw sources are grouped by date, returns all day entries
  private async days(origin: string): Promise<string[]> {
    const entries = await readdir(this.originDir(origin), { withFileTypes: true }).catch(() => []);
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .reverse();
  }
  // locates an ID by looping through all the day entries
  private async locate(origin: string, id: string): Promise<string | null> {
    const file = `${slugify(id)}${META_SUFFIX}`;
    for (const day of await this.days(origin)) {
      const dir = join(this.originDir(origin), day);
      if (await exists(join(dir, file))) return dir;
    }
    return null;
  }

  // public calls

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
  }

  async has(origin: string, id: string): Promise<boolean> {
    return (await this.read(origin, id)) !== null;
  }

  // write both metadata and content bytes
  async write(
    metadata: SourceMetadata,
    content: Buffer | string,
    ext: string = DEFAULT_EXT,
  ): Promise<Source> {
    const dir = join(this.originDir(metadata.origin), toDay(metadata.created, new Date().toISOString()));
    await mkdir(dir, { recursive: true });

    const fileName = `${slugify(metadata.id)}${ext}`;
    await writeFile(join(dir, fileName), content);
    const source: Source = { metadata, fileName };
    await writeFile(
      join(dir, `${slugify(metadata.id)}${META_SUFFIX}`),
      serializeRecord(source),
      "utf8",
    );
    return source;
  }

  // returns the a source, containing url to content
  async read(origin: string, id: string): Promise<Source | null> {
    const dir = await this.locate(origin, id);
    if (dir === null) return null;
    const json = await readFile(join(dir, `${slugify(id)}${META_SUFFIX}`), "utf8");
    return parseRecord(json, { origin, id });
  }
  
  // returns bytes for a source
  async readBytes(source: Source): Promise<Buffer> {
    const { origin, id } = source.metadata;
    const dir = await this.locate(origin, id);
    if (dir !== null) {
      const bytes = await readFile(join(dir, source.fileName)).catch((e: NodeJS.ErrnoException) => {
        if (e.code !== "ENOENT") throw e;
        return null;
      });
      if (bytes !== null) return bytes;
    }
    throw new Error(`raw source ${origin}/${id} is missing its content file ${source.fileName}`);
  }

  async readContent(source: Source): Promise<string> {
    return (await this.readBytes(source)).toString("utf8");
  }

  // Metadata only — enumerating the archive never reads a content file.
  async list(): Promise<Source[]> {
    const out: Source[] = [];
    const origins = await readdir(this.dir, { withFileTypes: true }).catch(() => []);
    for (const origin of origins) {
      if (!origin.isDirectory()) continue;
      for (const day of await this.days(origin.name)) {
        const dir = join(this.originDir(origin.name), day);
        for (const file of await readdir(dir).catch(() => [])) {
          if (!file.endsWith(META_SUFFIX)) continue;
          const id = file.slice(0, -META_SUFFIX.length);
          const json = await readFile(join(dir, file), "utf8").catch(() => null);
          if (json !== null) out.push(parseRecord(json, { origin: origin.name, id }));
        }
      }
    }
    return out;
  }
}
