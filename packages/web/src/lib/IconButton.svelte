<script lang="ts">
  import PixelIcon from "./PixelIcon.svelte";

  const SIZES: Record<string, number> = { sm: 34, md: 44, lg: 52 };
  const ICON_SIZES: Record<string, number> = { sm: 20, md: 24, lg: 28 };

  let {
    icon,
    size = "md",
    variant = "ghost",
    label,
    active = false,
    disabled = false,
    onclick,
  }: {
    icon: "mic" | "heart";
    size?: "sm" | "md" | "lg";
    variant?: "ghost" | "solid" | "soft";
    label: string;
    active?: boolean;
    disabled?: boolean;
    onclick?: () => void;
  } = $props();

  let hover = $state(false);
  let pressed = $state(false);

  const dimension = $derived(SIZES[size] ?? SIZES.md);
  const iconSize = $derived(ICON_SIZES[size] ?? ICON_SIZES.md);
  const background = $derived(
    variant === "solid"
      ? "var(--action-primary)"
      : variant === "soft" || (hover && variant === "ghost")
        ? "var(--surface-sunken)"
        : "transparent",
  );
  const foreground = $derived(
    variant === "solid" ? "var(--text-on-accent)" : active ? "var(--text-accent)" : "var(--text-muted)",
  );
</script>

<button
  type="button"
  class="icon-button"
  class:ghost={variant === "ghost"}
  aria-label={label}
  title={label}
  disabled={disabled}
  onclick={onclick}
  onmouseenter={() => (hover = true)}
  onmouseleave={() => {
    hover = false;
    pressed = false;
  }}
  onmousedown={() => (pressed = true)}
  onmouseup={() => (pressed = false)}
  style="width:{dimension}px;height:{dimension}px;color:{foreground};background:{background};transform:{pressed
    ? 'translate(var(--press-offset), var(--press-offset))'
    : 'none'}"
>
  <PixelIcon name={icon} size={iconSize} />
</button>

<style>
  .icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: var(--border-width) solid var(--line-soft);
    border-radius: var(--radius-pill);
    cursor: pointer;
    transition:
      background var(--dur-fast) var(--ease-standard),
      transform var(--dur-instant) var(--ease-standard),
      color var(--dur-fast) var(--ease-standard);
  }
  .icon-button.ghost {
    border-color: transparent;
  }
  .icon-button:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }
</style>
