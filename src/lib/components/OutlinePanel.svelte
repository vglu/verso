<script lang="ts">
  import { workspace } from '../stores/workspace.svelte';
  import { t } from '../stores/i18n';

  interface Props {
    onRevealHeading: (pos: number) => void;
  }

  const { onRevealHeading }: Props = $props();

  let resizing = $state(false);
  let listEl = $state<HTMLElement | null>(null);

  /** Drag from the panel's left edge, so the handle grows the panel leftwards. */
  function startResize(event: PointerEvent): void {
    resizing = true;
    const startX = event.clientX;
    const startWidth = workspace.outlineWidth;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);

    const move = (e: PointerEvent): void =>
      workspace.setOutlineWidth(startWidth - (e.clientX - startX));
    const stop = (): void => {
      resizing = false;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  }

  /**
   * Keep the active heading in view as the reader scrolls the document —
   * but only nudge the list when the entry has actually left the panel,
   * so the outline is not constantly shifting under the pointer.
   */
  $effect(() => {
    const index = workspace.activeOutline;
    if (!listEl || index < 0) return;

    const item = listEl.children[index] as HTMLElement | undefined;
    if (!item) return;

    const panel = listEl.parentElement;
    if (!panel) return;

    const above = item.offsetTop < panel.scrollTop;
    const below = item.offsetTop + item.offsetHeight > panel.scrollTop + panel.clientHeight;
    if (above || below) {
      item.scrollIntoView({ block: 'nearest' });
    }
  });
</script>

<aside
  class="outline"
  class:overlay={workspace.overlayMode}
  style="width: {workspace.outlineWidth}px"
  aria-label={t('sidebar.outline')}
>
  <div
    class="resizer"
    class:active={resizing}
    role="separator"
    aria-orientation="vertical"
    aria-label="Resize outline"
    onpointerdown={startResize}
  ></div>

  <div class="head">{t('sidebar.outline')}</div>

  <div class="body">
    {#if workspace.outline.length === 0}
      <div class="hint">{t('sidebar.noOutline')}</div>
    {:else}
      <nav bind:this={listEl} aria-label={t('sidebar.outline')}>
        {#each workspace.outline as item, index (item.from)}
          <button
            class="item"
            class:active={index === workspace.activeOutline}
            class:top={item.level === 1}
            style="padding-left: {10 + (item.level - 1) * 11}px"
            onclick={() => onRevealHeading(item.from)}
            title={item.text}
          >
            {item.text}
          </button>
        {/each}
      </nav>
    {/if}
  </div>
</aside>

<style>
  .outline {
    position: relative;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--bg-app);
    border-left: 1px solid var(--border);
  }

  .outline.overlay {
    position: absolute;
    top: 0;
    bottom: 0;
    right: 0;
    z-index: 20;
    background: var(--bg-panel);
    box-shadow: var(--shadow-panel);
  }

  .head {
    flex-shrink: 0;
    padding: var(--sp-3) var(--sp-3) var(--sp-2);
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--fg-faint);
  }

  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding-bottom: var(--sp-4);
  }

  .hint {
    padding: var(--sp-2) var(--sp-3);
    font-size: 12px;
    color: var(--fg-faint);
    line-height: 1.5;
  }

  .item {
    display: block;
    width: 100%;
    padding: 4px var(--sp-3) 4px 0;
    text-align: left;
    font-size: 12.5px;
    line-height: 1.45;
    color: var(--fg-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    border-left: 2px solid transparent;
    transition:
      background-color var(--t-fast) var(--ease),
      color var(--t-fast) var(--ease),
      border-color var(--t-fast) var(--ease);
  }

  /* Top-level headings carry a little more weight, so the shape of a long
     document is readable at a glance rather than as a flat list. */
  .item.top {
    color: var(--fg-ui);
    font-weight: 500;
  }

  .item.active {
    color: var(--accent);
    border-left-color: var(--accent);
    background: var(--accent-soft);
  }

  @media (hover: hover) and (pointer: fine) {
    .item:hover {
      background: var(--bg-hover);
      color: var(--fg-ui);
    }

    .resizer:hover {
      background: var(--accent-soft);
    }
  }

  .resizer {
    position: absolute;
    top: 0;
    left: -3px;
    width: 6px;
    height: 100%;
    cursor: col-resize;
    z-index: 5;
  }

  .resizer.active {
    background: var(--accent-soft);
  }
</style>
