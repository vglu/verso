<script lang="ts">
  import Self from './FileTreeNode.svelte';
  import { workspace } from '../stores/workspace.svelte';
  import { tabs } from '../stores/tabs.svelte';
  import type { TreeEntry } from '../ipc/types';

  interface Props {
    entry: TreeEntry;
    depth: number;
    activePath: string | null;
    onOpen: (path: string) => void;
    onContext: (entry: TreeEntry, x: number, y: number) => void;
  }

  const { entry, depth, activePath, onOpen, onContext }: Props = $props();

  const isOpen = $derived(Boolean(workspace.expanded[entry.path]));
  const isActive = $derived(activePath === entry.path);

  /**
   * The same dot the tab shows, in the tree.
   *
   * A file with unsaved work is a fact about the file, and the tree is where
   * people look at their files — being told only on the tab means being told
   * only about the one you are looking at.
   */
  const isDirty = $derived(
    !entry.isDir && tabs.tabs.some((tab) => tab.path === entry.path && tab.dirty)
  );
  const children = $derived(workspace.children[entry.path] ?? []);

  function activate(): void {
    if (entry.isDir) void workspace.toggleDir(entry.path);
    else onOpen(entry.path);
  }

  /** Markdown extensions are noise in a Markdown app; the icon carries it. */
  function displayName(name: string): string {
    return name.replace(/\.(md|markdown|mdown|mkd)$/i, '');
  }
</script>

<!-- Keys are handled once, by the tree itself: a row is not a tab stop, and a
     handler here would fight the arrow navigation in Sidebar.svelte. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="row"
  class:active={isActive}
  class:dir={entry.isDir}
  style="padding-left: {8 + depth * 14}px"
  role="treeitem"
  data-path={entry.path}
  data-dir={entry.isDir ? 'true' : undefined}
  data-depth={depth}
  aria-level={depth + 1}
  aria-expanded={entry.isDir ? isOpen : undefined}
  aria-selected={isActive}
  aria-current={isActive ? 'true' : undefined}
  tabindex="-1"
  title={entry.path}
  onclick={activate}
  oncontextmenu={(e) => {
    e.preventDefault();
    e.stopPropagation();
    onContext(entry, e.clientX, e.clientY);
  }}
>
  {#if entry.isDir}
    <svg class="chev" class:open={isOpen} viewBox="0 0 12 12" aria-hidden="true">
      <path
        d="M4.5 2.5L8 6l-3.5 3.5"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  {:else}
    <span class="chev spacer"></span>
  {/if}

  <span class="label">{entry.isDir ? entry.name : displayName(entry.name)}</span>
  {#if isDirty}
    <span class="dirty" title="Unsaved changes" aria-label="Unsaved changes"></span>
  {/if}
</div>

{#if entry.isDir && isOpen}
  {#each children as child (child.path)}
    <Self entry={child} depth={depth + 1} {activePath} {onOpen} {onContext} />
  {/each}
{/if}

<style>
  .row {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    height: 28px;
    padding-right: var(--sp-2);
    color: var(--fg-muted);
    font-size: 13px;
    cursor: default;
    user-select: none;
    border-radius: var(--radius-s);
    transition:
      background-color var(--t-fast) var(--ease),
      color var(--t-fast) var(--ease);
  }

  .row.active {
    background: var(--accent-soft);
    color: var(--accent);
  }

  @media (hover: hover) and (pointer: fine) {
    .row:hover {
      background: var(--bg-hover);
      color: var(--fg-ui);
    }
  }

  .row.dir {
    color: var(--fg-ui);
  }

  .chev {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
    color: var(--fg-faint);
    transition: transform var(--t-fast) var(--ease-out);
  }

  .chev.open {
    transform: rotate(90deg);
  }

  .spacer {
    display: inline-block;
  }

  .label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* The same mark as the tab, at the same size, in the accent colour: two
     places saying one thing should look like one thing. */
  .dirty {
    width: 6px;
    height: 6px;
    margin-left: auto;
    margin-right: var(--sp-1);
    flex-shrink: 0;
    border-radius: 50%;
    background: var(--accent);
  }
</style>
