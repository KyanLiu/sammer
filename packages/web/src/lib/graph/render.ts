import type { ZoomTransform } from "d3-zoom";
import { isHub, nodeRadius, spriteScale, type LayoutNode } from "./layout.js";
import { BITMAPS, ORPHAN_GREY, drawBitmap, shade, soulBitmap, withAlpha } from "./sprites.js";

export const REVEAL_DELAY = 120;
export const REVEAL_STAGGER = 90;
export const REVEAL_FADE = 320;

const BACKGROUND = "#000000";
const GRID_DOT = "#1E1E1E";
const WHITE = "#FFFFFF";
const HONEY = "#FFD84A";
const DIMMED = 0.13;
const PRESSED_SHADE = 0.5;
const SMALL_VAULT = 15;

export interface Reveal {
  startedAt: number;
  delays: Map<string, number>;
}

export interface Link {
  a: LayoutNode;
  b: LayoutNode;
}

export interface Scene {
  nodes: LayoutNode[];
  links: Link[];
  colors: Map<string, string>;
  transform: ZoomTransform;
  width: number;
  height: number;
  dpr: number;
  now: number;
  reduced: boolean;
  hover: LayoutNode | null;
  selected: LayoutNode | null;
  dragging: LayoutNode | null;
  reveal: Reveal | null;
  dim: number;
  hidden: ReadonlySet<string>;
  query: string;
  allLabels: boolean;
}

export function planReveal(center: { x?: number; y?: number }, neighbours: LayoutNode[], now: number): Reveal {
  const angle = (n: LayoutNode) => (Math.atan2(n.y! - center.y!, n.x! - center.x!) + Math.PI * 2.5) % (Math.PI * 2);
  const clockwise = [...neighbours].sort((a, b) => angle(a) - angle(b));
  return { startedAt: now, delays: new Map(clockwise.map((n, i) => [n.slug, REVEAL_DELAY + i * REVEAL_STAGGER])) };
}

export function revealProgress(reveal: Reveal, slug: string, now: number): number {
  const delay = reveal.delays.get(slug);
  if (delay === undefined) return 0;
  return Math.max(0, Math.min(1, (now - reveal.startedAt - delay) / REVEAL_FADE));
}

export function nextDim(current: number, selected: boolean, reduced: boolean): number {
  const target = selected ? DIMMED : 1;
  return reduced ? target : current + (target - current) * 0.1;
}

export function matchesQuery(n: LayoutNode, query: string): boolean {
  return query !== "" && n.title.toLowerCase().includes(query);
}

export function drawScene(ctx: CanvasRenderingContext2D, s: Scene) {
  ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, s.width, s.height);
  drawGrid(ctx, s);

  ctx.save();
  ctx.translate(s.transform.x, s.transform.y);
  ctx.scale(s.transform.k, s.transform.k);

  const visible = (n: LayoutNode) => !s.hidden.has(n.category);
  const progress = (n: LayoutNode) => (s.reveal ? revealProgress(s.reveal, n.slug, s.now) : 0);
  const alphaOf = (n: LayoutNode) => {
    if (!s.selected) return s.dim;
    if (n === s.selected) return 1;
    return s.dim + (1 - s.dim) * progress(n);
  };

  for (const { a, b } of s.links) {
    if (!visible(a) || !visible(b)) continue;
    const hubPath = isHub(a) && isHub(b);
    if (!s.selected) {
      ctx.globalAlpha = s.dim;
      drawEdge(ctx, a, b, hubPath);
      continue;
    }
    const other = a === s.selected ? b : b === s.selected ? a : null;
    if (other) {
      ctx.globalAlpha = s.dim * 0.6;
      drawEdge(ctx, a, b, false);
      const p = progress(other);
      if (p > 0) {
        ctx.globalAlpha = p;
        drawLitEdge(ctx, s.selected, other, s.colors);
      }
      continue;
    }
    ctx.globalAlpha = Math.max(s.dim * 0.6, Math.min(progress(a), progress(b)) * 0.35);
    drawEdge(ctx, a, b, hubPath);
  }

  const fewPages = s.nodes.length <= SMALL_VAULT;
  const order = s.nodes.filter(visible).sort((a, b) => alphaOf(a) - alphaOf(b) || a.degree - b.degree);
  for (const n of order) {
    ctx.globalAlpha = alphaOf(n);
    drawNode(ctx, n, s);
  }

  for (const n of order) {
    const matched = matchesQuery(n, s.query);
    const show = s.selected
      ? n === s.selected || progress(n) > 0.3 || n === s.hover || matched
      : s.allLabels || fewPages || isHub(n) || n === s.hover || matched || s.transform.k > 1.35 || n.degree >= 3;
    if (!show) continue;
    ctx.globalAlpha = s.selected ? Math.max(alphaOf(n), n === s.hover ? 1 : 0) : s.dim;
    drawLabel(ctx, n, s.transform.k, n === s.selected || n === s.hover || matched);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawGrid(ctx: CanvasRenderingContext2D, s: Scene) {
  const step = 16 * s.transform.k;
  if (step < 7) return;
  ctx.fillStyle = GRID_DOT;
  const ox = ((s.transform.x % step) + step) % step;
  const oy = ((s.transform.y % step) + step) % step;
  const dot = s.transform.k > 1.6 ? 3 : 2;
  for (let x = ox; x < s.width; x += step) {
    for (let y = oy; y < s.height; y += step) ctx.fillRect(Math.round(x), Math.round(y), dot, dot);
  }
}

function drawEdge(ctx: CanvasRenderingContext2D, a: LayoutNode, b: LayoutNode, hubPath: boolean) {
  if (hubPath) {
    ctx.fillStyle = withAlpha(HONEY, 0.55);
    const steps = Math.floor(Math.hypot(b.x! - a.x!, b.y! - a.y!) / 7);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      ctx.fillRect(Math.round(a.x! + (b.x! - a.x!) * t) - 1, Math.round(a.y! + (b.y! - a.y!) * t) - 1, 2, 2);
    }
    return;
  }
  ctx.strokeStyle = "rgba(255,255,255,.26)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(a.x!, a.y!);
  ctx.lineTo(b.x!, b.y!);
  ctx.stroke();
}

function drawLitEdge(ctx: CanvasRenderingContext2D, from: LayoutNode, to: LayoutNode, colors: Map<string, string>) {
  const color = colors.get(to.category) ?? WHITE;
  ctx.strokeStyle = withAlpha(color === WHITE ? HONEY : color, 0.85);
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(from.x!, from.y!);
  ctx.lineTo(to.x!, to.y!);
  ctx.stroke();
}

function drawNode(ctx: CanvasRenderingContext2D, n: LayoutNode, s: Scene) {
  const base = n.degree === 0 ? ORPHAN_GREY : (s.colors.get(n.category) ?? WHITE);
  const pressed = (n === s.hover || n === s.selected) && n !== s.dragging;
  const color = pressed ? shade(base, PRESSED_SHADE) : base;
  const px = spriteScale(n);

  if (isHub(n)) {
    const twinkle = s.reduced ? 0 : Math.floor(s.now / 300 + n.phase) % 2;
    const glowPx = px + (twinkle ? 1 : 2);
    drawBitmap(ctx, BITMAPS.star, withAlpha(color, 0.22), Math.round(n.x! - (7 * glowPx) / 2), Math.round(n.y! - (7 * glowPx) / 2), glowPx);
    drawBitmap(ctx, twinkle ? BITMAPS.starTwinkle : BITMAPS.star, color, Math.round(n.x! - (7 * px) / 2), Math.round(n.y! - (7 * px) / 2), px);
    return;
  }
  drawBitmap(ctx, soulBitmap(n), color, Math.round(n.x! - (7 * px) / 2), Math.round(n.y! - (6 * px) / 2), px);
}

function drawLabel(ctx: CanvasRenderingContext2D, n: LayoutNode, k: number, emphasised: boolean) {
  const size = Math.round(19 / Math.sqrt(k));
  ctx.font = `${size}px VT323, monospace`;
  const w = Math.ceil(ctx.measureText(n.title).width) + 8;
  const x = Math.round(n.x! - w / 2);
  const y = Math.round(n.y! + nodeRadius(n) + 6);
  ctx.fillStyle = emphasised ? HONEY : BACKGROUND;
  ctx.fillRect(x, y, w, size);
  ctx.fillStyle = emphasised ? BACKGROUND : WHITE;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(n.title, Math.round(n.x!), y + size / 2 + 1);
}
