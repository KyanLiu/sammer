import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RawStore } from "../../src/raw/store.js";
import { archiveFile, archiveText } from "../../src/raw/archive.js";
import { sourceId } from "../../src/raw/id.js";

let store: RawStore;
let work: string;

beforeEach(async () => {
  store = new RawStore(await mkdtemp(join(tmpdir(), "sammer-archive-")));
  await store.init();
  work = await mkdtemp(join(tmpdir(), "sammer-work-"));
});

const fileWith = async (name: string, content: Buffer | string) => {
  const path = join(work, name);
  await writeFile(path, content);
  return path;
};

describe("archiveFile", () => {
  it("copies a binary file byte for byte under its own extension", async () => {
    const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff, 0xfe, 0x80]);
    const path = await fileWith("report.pdf", pdf);

    const archived = await archiveFile(store, path, { origin: "file" });

    expect(archived.skipped).toBe(false);
    expect(archived.source.metadata.kind).toBe("pdf");
    expect(archived.source.fileName).toBe(`${sourceId(pdf)}.pdf`);
    expect((await store.readBytes(archived.source)).equals(pdf)).toBe(true);
  });

  it("survives a file that is not valid utf8, which a text read would corrupt", async () => {
    const latin1 = Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a]);
    const path = await fileWith("cafe.txt", latin1);

    const archived = await archiveFile(store, path, { origin: "file" });

    expect((await store.readBytes(archived.source)).equals(latin1)).toBe(true);
  });

  it("records where the file came from", async () => {
    const path = await fileWith("conversations.txt", "chat log");

    const { source } = await archiveFile(store, path, { origin: "file" });

    expect(source.metadata.title).toBe("conversations.txt");
    expect(source.metadata.url).toBe(path);
    expect(source.metadata.origin).toBe("file");
  });

  it("skips a file it already holds, without rewriting it", async () => {
    const path = await fileWith("notes.md", "# Cats");
    const first = await archiveFile(store, path, { origin: "file" });
    await writeFile(join(work, "sentinel"), "");

    const second = await archiveFile(store, path, { origin: "file" });

    expect(second.skipped).toBe(true);
    expect(second.source.metadata.id).toBe(first.source.metadata.id);
    expect(await store.list()).toHaveLength(1);
  });

  it("gives two files with the same name but different content two records", async () => {
    const monday = await archiveFile(store, await fileWith("export.txt", "monday"), { origin: "file" });
    const friday = await archiveFile(store, await fileWith("export.txt", "friday"), { origin: "file" });

    expect(monday.source.metadata.id).not.toBe(friday.source.metadata.id);
    expect(await store.list()).toHaveLength(2);
  });

  it("hands back the bytes it archived, so the caller need not read the file again", async () => {
    const path = await fileWith("notes.md", "# Cats");

    const { bytes } = await archiveFile(store, path, { origin: "file" });

    expect(bytes.toString("utf8")).toBe("# Cats");
  });
});

describe("archiveText", () => {
  it("stores exactly the bytes it hashed, trimmed", async () => {
    const archived = await archiveText(store, "  Capybaras are large.\n\n", { origin: "cli" });

    expect(archived.source.metadata.id).toBe(sourceId(Buffer.from("Capybaras are large.", "utf8")));
    expect(await store.readContent(archived.source)).toBe("Capybaras are large.");
    expect(archived.source.fileName.endsWith(".txt")).toBe(true);
  });

  it("skips text it already holds, whatever the surrounding whitespace", async () => {
    await archiveText(store, "Capybaras are large.", { origin: "cli" });

    const again = await archiveText(store, "\nCapybaras are large.  ", { origin: "cli" });

    expect(again.skipped).toBe(true);
    expect(await store.list()).toHaveLength(1);
  });

  it("keeps the same words apart when they arrive by different routes", async () => {
    await archiveText(store, "same words", { origin: "cli" });

    const viaChat = await archiveText(store, "same words", { origin: "chat", kind: "conversation" });

    expect(viaChat.skipped).toBe(false);
    expect(viaChat.source.metadata.kind).toBe("conversation");
    expect(await store.list()).toHaveLength(2);
  });

  it("files records under the day they were archived", async () => {
    const { source } = await archiveText(store, "today's note", { origin: "cli" });
    const today = new Date().toISOString().slice(0, 10);

    expect(source.metadata.created.slice(0, 10)).toBe(today);
    const onDisk = await readFile(
      join((store as unknown as { dir: string }).dir, "cli", today, `${source.metadata.id}.txt`),
      "utf8",
    );
    expect(onDisk).toBe("today's note");
  });
});
