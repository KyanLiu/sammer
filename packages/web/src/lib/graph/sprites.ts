export type Bitmap = readonly string[];

const HEART: Bitmap = [".XX.XX.", "XXXXXXX", "XXXXXXX", ".XXXXX.", "..XXX..", "...X..."];

export const BITMAPS = {
  heart: HEART,
  brokenHeart: [".XX.XX.", "XXX.XXX", "XX.XXXX", ".XX.XX.", "..X.X..", "...X..."],
  monsterHeart: [...HEART].reverse(),
  star: ["...X...", "...X...", "..XXX..", "XXXXXXX", "..XXX..", "...X...", "...X..."],
  starTwinkle: [".......", "...X...", "..XXX..", ".XXXXX.", "..XXX..", "...X...", "......."],
} satisfies Record<string, Bitmap>;

export const UNCATEGORIZED = "Uncategorized";
export const MONSTER_WHITE = "#FFFFFF";
export const ORPHAN_GREY = "#8F8F8F";
const SOUL_PALETTE = ["#FF2B2B", "#FF9A1F", "#FFE81F", "#2BE34A", "#3FE0FF", "#C34BFF", "#2F6BFF"];

export function categoryColors(nodes: { category: string }[]): Map<string, string> {
  const counts = new Map<string, number>();
  for (const { category } of nodes) counts.set(category, (counts.get(category) ?? 0) + 1);
  const ranked = [...counts.keys()]
    .filter((c) => c !== UNCATEGORIZED)
    .sort((a, b) => counts.get(b)! - counts.get(a)! || a.localeCompare(b));
  const colors = new Map(ranked.map((c, i) => [c, SOUL_PALETTE[i % SOUL_PALETTE.length]]));
  if (counts.has(UNCATEGORIZED)) colors.set(UNCATEGORIZED, MONSTER_WHITE);
  return colors;
}

export function soulBitmap(n: { degree: number; category: string }): Bitmap {
  if (n.degree === 0) return BITMAPS.brokenHeart;
  return n.category === UNCATEGORIZED ? BITMAPS.monsterHeart : BITMAPS.heart;
}

export function drawBitmap(ctx: CanvasRenderingContext2D, rows: Bitmap, color: string, x: number, y: number, px: number) {
  ctx.fillStyle = color;
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) if (row[i] !== ".") ctx.fillRect(x + i * px, y + j * px, px, px);
  });
}

export function shade(hex: string, k: number): string {
  const v = parseInt(hex.slice(1), 16);
  const channel = (c: number) => Math.round(c * k).toString(16).padStart(2, "0");
  return `#${channel((v >> 16) & 255)}${channel((v >> 8) & 255)}${channel(v & 255)}`;
}

export function withAlpha(hex: string, a: number): string {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
}

export function sprite(canvas: HTMLCanvasElement, params: { rows: Bitmap; color: string }) {
  function paint({ rows, color }: { rows: Bitmap; color: string }) {
    const px = 2;
    const w = rows[0].length, h = rows.length;
    canvas.width = w * px;
    canvas.height = h * px;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBitmap(ctx, rows, color, 0, 0, px);
  }
  paint(params);
  return { update: paint };
}
