export type BodySegment = { kind: "text"; text: string } | { kind: "link"; text: string; slug: string };

// Mirrors slugify in @sammer/shared, whose entry point pulls in node:fs and so can't be bundled for the browser.
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function splitWikiLinks(body: string): BodySegment[] {
  const out: BodySegment[] = [];
  const re = /(!?)\[\[([^\]]+)\]\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const pushText = (text: string) => {
    if (!text) return;
    const prev = out[out.length - 1];
    if (prev?.kind === "text") prev.text += text;
    else out.push({ kind: "text", text });
  };
  while ((m = re.exec(body)) !== null) {
    pushText(body.slice(last, m.index));
    last = re.lastIndex;
    const [target, alias] = m[2]!.split("|", 2) as [string, string | undefined];
    const slug = slugify(target.split("#", 1)[0]!);
    if (m[1] === "!" || !slug) {
      pushText(m[0]);
      continue;
    }
    out.push({ kind: "link", text: (alias ?? target).trim(), slug });
  }
  pushText(body.slice(last));
  return out;
}
