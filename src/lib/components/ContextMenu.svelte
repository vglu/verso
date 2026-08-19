<script lang="ts">
  import { paletteIn, paletteOut } from '../ui/motion';

  export interface ContextItem {
    label: string;
    onSelect: () => void;
    /** Drawn as a separator above this item. */
    divider?: boolean;
  }

  interface Props {
    x: number;
    y: number;
    items: ContextItem[];
    onClose: () => void;
  }

  const { x, y, items, onClose }: Props = $props();

  let selected = $state(0);

  /**
   * Keep the menu on screen.
   *
   * A right-click near the bottom edge is the common case, not the exception,
   * and a menu that opens off-screen is a menu with no items.
   */
  const placement = $derived.by(() => {
    const width = 220;
    const height = items.length * 30 + 12;
    const left = Math.min(x, Math.max(8, window.innerWidth - width - 8));
    const top = Math.min(y, Math.max(8, window.innerHeight - height - 8));
    return `left: ${left}px; top: ${top}px;`;
  });

  function choose(index: number): void {
    const item = items[index];
    onClose();
    item?.onSelect();
  }

  function onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        selected = (selected + 1) % items.length;
        break;
      case 'ArrowUp':
        event.preventDefault();
        selected = (selected - 1 + items.length) % items.length;
        break;
      case 'Enter':
        event.preventDefault();
        choose(selected);
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        onClose();
        break;
    }
  }

  function autofocus(node: HTMLElement): void {
    node.focus();
  }
</script>

<svelte:window onresize={onClose} onblur={onClose} />

<!-- The backdrop is invisible but real: it catches the click that dismisses
     the menu, including the right-click that opens another one. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="catcher"
  onclick={onClose}
  oncontextmenu={(e) => {
    e.preventDefault();
    onClose();
  }}
>
  <div
    class="menu"
    role="menu"
    tabindex="-1"
    style={placement}
    use:autofocus
    onkeydown={onKeydown}
    onclick={(e) => e.stopPropagation()}
    in:paletteIn
    out:paletteOut
  >
    {#each items as item, index (item.label)}
      {#if item.divider}<div class="divider"></div>{/if}
      <button
        class="item"
        class:selected={index === selected}
        role="menuitem"
        tabindex="-1"
        onmouseenter={() => (selected = index)}
        onclick={() => choose(index)}
      >
        {item.label}
      </button>
    {/each}
  </div>
</div>

<style>
  .catcher {
    position: fixed;
    inset: 0;
    z-index: 110;
  }

  .menu {
    position: absolute;
    min-width: 200px;
    padding: 4px;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: var(--radius-m);
    box-shadow: var(--shadow-panel);
    outline: none;
  }

  .item {
    display: block;
    width: 100%;
    padding: 5px 10px;
    text-align: left;
    font-size: 12.5px;
    color: var(--fg-ui);
    border-radius: var(--radius-s);
    white-space: nowrap;
    transition: background-color var(--t-fast) var(--ease);
  }

  .item.selected {
    background: var(--bg-hover);
  }

  .divider {
    height: 1px;
    margin: 4px 6px;
    background: var(--border);
  }
</style>
