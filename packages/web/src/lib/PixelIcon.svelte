<script lang="ts">
  const MAPS: Record<string, string[]> = {
    heart: [".XX.XX.", "XXXXXXX", "XXXXXXX", ".XXXXX.", "..XXX..", "...X..."],
    chevronUp: ["...X...", "..XXX..", ".XXXXX.", "XXXXXXX"],
    chevronDown: ["XXXXXXX", ".XXXXX.", "..XXX..", "...X..."],
    mic: [
      "....XXXX....",
      "...XXXXXX...",
      "...XXXXXX...",
      "...XXXXXX...",
      "...XXXXXX...",
      "...XXXXXX...",
      "...XXXXXX...",
      ".X..XXXX..X.",
      ".X..XXXX..X.",
      ".XX......XX.",
      "..XXXXXXXX..",
      ".....XX.....",
      ".....XX.....",
      "...XXXXXX...",
    ],
  };

  let { name, size = 16 }: { name: keyof typeof MAPS; size?: number } = $props();

  const map = $derived(MAPS[name] ?? []);
  const rows = $derived(map.length);
  const cols = $derived(map[0]?.length ?? 0);
  const cells = $derived(
    map.flatMap((row, y) => [...row].flatMap((ch, x) => (ch === "X" ? [{ x, y }] : []))),
  );
</script>

<svg
  aria-hidden="true"
  viewBox="0 0 {cols} {rows}"
  width={(size * cols) / rows}
  height={size}
  shape-rendering="crispEdges"
>
  {#each cells as cell (`${cell.x},${cell.y}`)}
    <rect x={cell.x} y={cell.y} width="1" height="1" fill="currentColor"></rect>
  {/each}
</svg>

<style>
  svg {
    display: block;
    flex: 0 0 auto;
  }
</style>
