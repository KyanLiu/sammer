import { mkdir, readFile, writeFile, appendFile, readdir, unlink, stat } from "node:fs/promises";
import { join } from "node:path";
import { RESERVED_SLUGS, type Page } from "@sammer/shared";
import { parsePage, serializePage, type PageDates } from "./format.js";

export class WikiStore {
  constructor(private readonly dir: string) {}

  private path(slug: string): string {
    return join(this.dir, `${slug}.md`);
  }

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
  }

  // The filesystem is the only record of when a hand-added page was written,
  // so it supplies the dates that its frontmatter leaves out.
  private async fileDates(file: string): Promise<PageDates> {
    const st = await stat(file);
    const updated = st.mtime.toISOString();
    // birthtime is unsupported on some filesystems, which report it as 0 or as
    // a time after mtime; mtime is the safe upper bound for when a file was born.
    const born = st.birthtimeMs > 0 && st.birthtimeMs <= st.mtimeMs ? st.birthtime.toISOString() : updated;
    return { created: born, updated };
  }

  async read(slug: string): Promise<Page | null> {
    const file = this.path(slug);
    try {
      const md = await readFile(file, "utf8");
      return parsePage(slug, md, await this.fileDates(file));
    } catch (e: any) {
      if (e.code === "ENOENT") return null;
      throw e;
    }
  }

  async write(page: Page): Promise<void> {
    await writeFile(this.path(page.slug), serializePage(page), "utf8");
  }

  async remove(slug: string): Promise<void> {
    try {
      await unlink(this.path(slug));
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
    }
  }

  // Raw text I/O, bypassing the Page abstraction — for the engine-maintained
  // files, which are generated markdown rather than pages with frontmatter.
  async readText(slug: string): Promise<string | null> {
    try {
      return await readFile(this.path(slug), "utf8");
    } catch (e: any) {
      if (e.code === "ENOENT") return null;
      throw e;
    }
  }

  async writeText(slug: string, content: string): Promise<void> {
    await writeFile(this.path(slug), content, "utf8");
  }

  async appendText(slug: string, text: string): Promise<void> {
    await appendFile(this.path(slug), text, "utf8");
  }

  async list(): Promise<string[]> {
    const entries = await readdir(this.dir).catch(() => []);
    return entries
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.slice(0, -3))
      .filter((slug) => !RESERVED_SLUGS.has(slug))
      .sort();
  }
}
