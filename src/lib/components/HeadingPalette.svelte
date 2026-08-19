<script lang="ts">
  import { workspace } from '../stores/workspace.svelte';
  import { t } from '../stores/i18n';
  import { filterHeadings, splitByRanges } from '../editor/headingMatch';
  import { paletteIn, paletteOut, scrimIn, scrimOut } from '../ui/motion';

  interface Props {
    onGo: (pos: number) => void;
    onClose: () => void;
  }

  const { onGo, onClose }: Props = $props();

  let query = $state('');
  let selected = $state(0);
  let listEl = $state<HTMLElement | null>(null);

  const matches = $derived(filterHeadings(workspace.outline, query));

  // A new query means a new list; the old highlight has nothing to do with it.
  $effect(() => {
    void query;
    selected = 0;
  });

  $effect(() => {
    const item = listEl?.children[selected] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  });

  function move(delta: number): void {
    if (matches.length === 0) return;
    // Wrapping is what makes a short list usable: one press up from the top
    // reaches the last heading instead of doing nothing.
    selected = (selected + delta + matches.length) % matches.length;
  }

  function choose(index = selected): void {
    const match = matches[index];
    if (!match) return;
    onClose();
    onGo(match.item.from);
  }

  function onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        move(-1);
        break;
      case 'Enter':
        event.preventDefault();
        choose();
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        onClose();
        break;
    }
  }

  function autofocus(node: HTMLInputElement): void {
    node.focus();
  }
</script>

<!-- Click-outside dismisses; Escape is handled on the field, which has focus. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="scrim" role="presentation" onclick={onClose} in:scrimIn out:scrimOut>
  <div
    class="palette"
    role="dialog"
    aria-modal="true"
    aria-label={t('palette.title')}
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
    in:paletteIn
    out:paletteOut
  >
    <input
      class="field"
      type="text"
      value={query}
      oninput={(e) => (query = e.currentTarget.value)}
      onkeydown={onKeydown}
      use:autofocus
      placeholder={t('palette.placeholder')}
      aria-label={t('palette.title')}
      aria-controls="palette-list"
      autocomplete="off"
      spellcheck="false"
    />

    {#if workspace.outline.length === 0}
      <div class="empty">{t('sidebar.noOutline')}</div>
    {:else if matches.length === 0}
      <div class="empty">{t('palette.noMatch')}</div>
    {:else}
      <div class="list" id="palette-list" role="listbox" bind:this={listEl}>
        {#each matches as match, index (match.item.from)}
          <button
            class="row"
            class:selected={index === selected}
            role="option"
            aria-selected={index === selected}
            onmouseenter={() => (selected = index)}
            onclick={() => choose(index)}
          >
            <span class="level">H{match.item.level}</span>
            <span class="text" style="padding-left: {(match.item.level - 1) * 10}px">
              {#each splitByRanges(match.item.text, match.ranges) as part, i (i)}
                {#if part.hit}<mark>{part.text}</mark>{:else}{part.text}{/if}
              {/each}
            </span>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 12vh var(--sp-5) var(--sp-5);
    background: var(--scrim);
    backdrop-filter: blur(3px);
  }

  .palette {
    width: min(560px, 100%);
    display: flex;
    flex-direction: column;
    min-height: 0;
    max-height: 60vh;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: var(--radius-l);
    box-shadow: var(--shadow-panel);
    overflow: hidden;
  }

  .field {
    flex-shrink: 0;
    padding: var(--sp-3) var(--sp-4);
    font-size: 14px;
    color: var(--fg-ui);
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--border);
    outline: none;
  }

  .field::placeholder {
    color: var(--fg-faint);
  }

  .empty {
    padding: var(--sp-4);
    font-size: 12.5px;
    color: var(--fg-faint);
  }

  .list {
    overflow-y: auto;
    padding: var(--sp-1) 0 var(--sp-2);
  }

  .row {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    width: 100%;
    padding: 5px var(--sp-4);
    text-align: left;
    font-size: 13px;
    color: var(--fg-muted);
    /* Colour only: the row under the cursor moves through a long list quickly,
       and anything that shifts would strobe. */
    transition: background-color var(--t-fast) var(--ease);
  }

  .row.selected {
    background: var(--accent-soft);
    color: var(--fg-ui);
  }

  .level {
    flex-shrink: 0;
    width: 20px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--fg-faint);
  }

  .row.selected .level {
    color: var(--accent);
  }

  .text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  mark {
    background: transparent;
    color: var(--accent);
    font-weight: 600;
  }
</style>
