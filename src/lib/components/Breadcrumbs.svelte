<script lang="ts">
  import { workspace } from '../stores/workspace.svelte';
  import type { OutlineItem } from '../editor/outline';
  import { tip } from '../ui/tooltip';

  interface Props {
    onRevealHeading: (pos: number) => void;
  }

  const { onRevealHeading }: Props = $props();

  /**
   * The chain of headings above the section on screen.
   *
   * Walking backwards and keeping each heading that is shallower than the
   * last gives the path, whatever levels the document actually uses — a
   * document that jumps from H1 to H3 still reads correctly.
   */
  const trail = $derived.by((): OutlineItem[] => {
    const index = workspace.activeOutline;
    if (index < 0 || index >= workspace.outline.length) return [];

    const current = workspace.outline[index];
    // While the heading itself is still on screen the crumbs would only
    // repeat what the eye can already read, and a bar that is always there
    // is a bar nobody looks at.
    if (!current || current.from >= workspace.viewportFrom) return [];

    const path: OutlineItem[] = [];
    let level = Number.POSITIVE_INFINITY;
    for (let i = index; i >= 0; i--) {
      const item = workspace.outline[i];
      if (!item || item.level >= level) continue;
      path.unshift(item);
      level = item.level;
      if (level === 1) break;
    }
    return path;
  });
</script>

<!--
  Only shown once the reader has scrolled past the heading itself. While the
  heading is on screen the crumbs would repeat what the eye can already see,
  and a bar that is always there is a bar nobody reads.
-->
{#if trail.length > 0}
  <div class="crumbs" aria-label="Location">
    {#each trail as item, i (item.from)}
      {#if i > 0}<span class="sep" aria-hidden="true">›</span>{/if}
      <button class="crumb" onclick={() => onRevealHeading(item.from)} use:tip={item.text}>
        {item.text}
      </button>
    {/each}
  </div>
{/if}

<style>
  .crumbs {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    flex-shrink: 0;
    height: 24px;
    padding: 0 var(--sp-3);
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    font-size: 11.5px;
    color: var(--fg-faint);
    white-space: nowrap;
    overflow: hidden;
    user-select: none;
  }

  .crumb {
    padding: 1px 4px;
    border-radius: var(--radius-s);
    color: inherit;
    font-size: inherit;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 34ch;
    transition:
      background-color var(--t-fast) var(--ease),
      color var(--t-fast) var(--ease),
      transform var(--t-press) var(--ease-out);
  }

  .crumb:active {
    transform: scale(var(--press-scale));
  }

  /* The section you are actually in reads a shade stronger than its parents. */
  .crumb:last-child {
    color: var(--fg-muted);
  }

  .sep {
    opacity: 0.6;
    flex-shrink: 0;
  }

  @media (hover: hover) and (pointer: fine) {
    .crumb:hover {
      background: var(--bg-hover);
      color: var(--fg-ui);
    }
  }
</style>
