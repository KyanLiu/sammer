export interface LayoutEdge {
  src: string;
  dst: string;
}

export interface Point {
  x: number;
  y: number;
}

// A small, dependency-free force-directed layout: repulsion between every
// node pair, springs along edges, a mild pull toward center. Run for a fixed
// number of iterations and rendered once at rest — a personal wiki's graph is
// small enough that this is cheap, and a static layout reads better than a
// live physics sim jittering into place on every visit.
export function layoutGraph(
  slugs: string[],
  edges: LayoutEdge[],
  opts: { width: number; height: number; iterations?: number },
): Map<string, Point> {
  const { width, height, iterations = 300 } = opts;
  const cx = width / 2;
  const cy = height / 2;
  const spread = Math.min(width, height) * 0.3;

  const nodes = new Map<string, { x: number; y: number; vx: number; vy: number }>();
  slugs.forEach((slug, i) => {
    // Deterministic starting ring, not random, so the same graph always
    // renders the same way between visits.
    const angle = (i / Math.max(slugs.length, 1)) * Math.PI * 2;
    nodes.set(slug, { x: cx + Math.cos(angle) * spread, y: cy + Math.sin(angle) * spread, vx: 0, vy: 0 });
  });

  const REPULSION = 2200;
  const SPRING_LENGTH = 110;
  const SPRING_STRENGTH = 0.02;
  const CENTER_STRENGTH = 0.01;
  const DAMPING = 0.85;

  for (let iter = 0; iter < iterations; iter++) {
    for (const slug of slugs) {
      const a = nodes.get(slug)!;
      let fx = (cx - a.x) * CENTER_STRENGTH;
      let fy = (cy - a.y) * CENTER_STRENGTH;
      for (const other of slugs) {
        if (other === slug) continue;
        const b = nodes.get(other)!;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distSq = Math.max(dx * dx + dy * dy, 1);
        const dist = Math.sqrt(distSq);
        const force = REPULSION / distSq;
        fx += (dx / dist) * force;
        fy += (dy / dist) * force;
      }
      a.vx = (a.vx + fx) * DAMPING;
      a.vy = (a.vy + fy) * DAMPING;
    }

    for (const { src, dst } of edges) {
      const a = nodes.get(src);
      const b = nodes.get(dst);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const force = (dist - SPRING_LENGTH) * SPRING_STRENGTH;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }

    for (const slug of slugs) {
      const a = nodes.get(slug)!;
      a.x = Math.max(30, Math.min(width - 30, a.x + a.vx));
      a.y = Math.max(30, Math.min(height - 30, a.y + a.vy));
    }
  }

  const out = new Map<string, Point>();
  for (const [slug, n] of nodes) out.set(slug, { x: n.x, y: n.y });
  return out;
}
