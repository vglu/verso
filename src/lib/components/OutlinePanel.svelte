<script lang="ts">
  import { workspace } from '../stores/workspace.svelte';
  import { t } from '../stores/i18n';
  import { filterHeadings, splitByRanges } from '../editor/headingMatch';
  import { tip } from '../ui/tooltip';

  interface Props {
    onRevealHeading: (pos: number) => void;
  }

  const { onRevealHeading }: Props = $props();

  let resizing = $state(false);
  let listEl = $state<HTMLElement | null>(null);
  let filter = $state('');

  /**
   * The same matcher the go-to palette uses. Typing the same thing in either
   * place has to find the same headings, or the reader has two searches to
   * learn instead of one.
   */
  const shown = $derived(filterHeadings(workspace.outline, filter));

  /** Drag from the panel's left edge, so the handle grows the panel leftwards. */
  function startResize(event: PointerEvent): void {
    // A second finger arriving mid-drag would otherwise take over and teleport
    // the divider to wherever it landed.
    if (resizing) return;

    resizing = true;
    const startX = event.clientX;
    const startWidth = workspace.outlineWidth;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    document.documentElement.classList.add('resizing');

    const move = (e: PointerEvent): void =>
      workspace.setOutlineWidth(startWidth - (e.clientX - startX));
    const stop = (): void => {
      resizing = false;
      document.documentElement.classList.remove('resizing');
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

    // Rows are the filtered list, so the active heading's place in the panel
    // is not its place in the outline.
    const row = shown.findIndex((m) => m.index === index);
    if (row < 0) return;

    const item = listEl.children[row] as HTMLElement | undefined;
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

  {#if workspace.outline.length > 3}
    <!-- Only worth the room once the list is long enough to need it. -->
    <input
      class="filter"
      type="text"
      bind:value={filter}
      placeholder={t('sidebar.filter')}
      aria-label={t('sidebar.filter')}
      autocomplete="off"
      spellcheck="false"
      onkeydown={(e) => {
        if (e.key === 'Escape' && filter) {
          e.stopPropagation();
          filter = '';
        }
      }}
    />
  {/if}

  <div class="body">
    {#if workspace.outline.length === 0}
      <div class="hint">{t('sidebar.noOutline')}</div>
    {:else if shown.length === 0}
      <div class="hint">{t('palette.noMatch')}</div>
    {:else}
      <nav bind:this={listEl} aria-label={t('sidebar.outline')}>
        {#each shown as match (match.item.from)}
          <button
            class="item"
            class:active={match.index === workspace.activeOutline}
            class:top={match.item.level === 1}
            aria-current={match.index === workspace.activeOutline ? 'true' : undefined}
            style="padding-left: {10 + (match.item.level - 1) * 11}px"
            onclick={() => onRevealHeading(match.item.from)}
            use:tip={match.item.text}
          >
            {#each splitByRanges(match.item.text, match.ranges) as part, i (i)}
              {#if part.hit}<mark>{part.text}</mark>{:else}{part.text}{/if}
            {/each}
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

  .filter {
    flex-shrink: 0;
    margin: 0 var(--sp-3) var(--sp-2);
    padding: 4px var(--sp-2);
    font-size: 12px;
    color: var(--fg-ui);
    background: var(--bg-field);
    border: 1px solid var(--border);
    border-radius: var(--radius-s);
    outline: none;
    transition:
      border-color var(--t-fast) var(--ease),
      background-color var(--t-fast) var(--ease);
  }

  .filter::placeholder {
    color: var(--fg-faint);
  }

  .filter:focus {
    border-color: var(--accent);
  }

  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding-bottom: var(--sp-4);
  }

  mark {
    background: transparent;
    color: var(--accent);
    font-weight: 600;
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
      border-color var(--t-fast) var(--ease),
      transform var(--t-press) var(--ease-out);
  }

  .item:active {
    transform: scale(var(--press-scale-row));
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
    transition: background-color var(--t-fast) var(--ease);
  }

  .resizer.active {
    background: var(--accent-soft);
  }
</style>
