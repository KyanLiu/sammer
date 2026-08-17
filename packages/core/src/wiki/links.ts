import { EMBEDDABLE_FILE, slugify } from "@sammer/shared";

export function extractLinks(body: string): string[] {
  const out: string[] = [];
  const re = /(!?)\[\[([^\]]+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    // An Obsidian link may carry a heading anchor (`#`) and/or a display alias
    // (`|`); only the text before either names the page being linked to.
    const target = m[2]!.split(/[|#]/, 1)[0]!.trim();
    // A leading `!` makes it an embed. Transcluding a note still references that
    // page, but an embedded asset is a file — there is no page for it to link to.
    if (m[1] === "!" && EMBEDDABLE_FILE.test(target)) continue;
    const slug = slugify(target);
    if (slug && !out.includes(slug)) out.push(slug);
  }
  return out;
}
