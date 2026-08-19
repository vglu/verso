<script lang="ts">
  import FileTreeNode from './FileTreeNode.svelte';
  import { workspace } from '../stores/workspace.svelte';
  import { tabs } from '../stores/tabs.svelte';
  import { t } from '../stores/i18n';
  import { baseName } from '../editor/pathUtil';

  interface Props {
    onOpenFile: (path: string) => void;
    onRevealHeading: (pos: number) => void;
  }

  const { onOpenFile, onRevealHeading }: Props = $props();

  const rootEntries = $derived(
    workspace.treeRoot ? (workspace.children[workspace.treeRoot] ?? []) : []
  );
  const activePath = $derived(tabs.active?.path ?? null);

  let resizing = $state(false);

  function startResize(event: PointerEvent): void {
    resizing = true;
    const startX = event.clientX;
    const startWidth = workspace.width;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);

    const move = (e: PointerEvent): void => workspace.setWidth(startWidth + (e.clientX - startX));
    const stop = (): void => {
      resizing = false;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  }
</script>

<aside
  class="sidebar"
  class:overlay={workspace.overlayMode}
  style="width: {workspace.width}px"
  aria-label="Sidebar"
>
  <div class="segment" role="tablist">
    <button
      class="seg-btn"
      class:on={workspace.panel === 'files'}
      role="tab"
      aria-selected={workspace.panel === 'files'}
      onclick={() => workspace.showPanel('files')}
    >
      {t('sidebar.files')}
    </button>
    <button
      class="seg-btn"
      class:on={workspace.panel === 'outline'}
      role="tab"
      aria-selected={workspace.panel === 'outline'}
      onclick={() => workspace.showPanel('outline')}
    >
      {t('sidebar.outline')}
    </button>
  </div>

  <div class="body">
    {#if workspace.panel === 'files'}
      {#if workspace.treeRoot}
        <div class="root-name" title={workspace.treeRoot}>{baseName(workspace.treeRoot)}</div>
        {#if rootEntries.length === 0}
          <div class="hint">{t('sidebar.emptyTree')}</div>
        {:else}
          <div role="tree" aria-label="Files">
            {#each rootEntries as entry (entry.path)}
              <FileTreeNode {entry} depth={0} {activePath} onOpen={onOpenFile} />
            {/each}
          </div>
        {/if}
      {:else}
        <div class="hint">{t('empty.hint')}</div>
      {/if}
    {:else if workspace.outline.length === 0}
      <div class="hint">{t('sidebar.noOutline')}</div>
    {:else}
      <nav aria-label="Outline">
        {#each workspace.outline as item, index (item.from)}
          <button
            class="outline-item"
            class:active={index === workspace.activeOutline}
            style="padding-left: {8 + (item.level - 1) * 12}px"
            onclick={() => onRevealHeading(item.from)}
            title={item.text}
          >
            {item.text}
          </button>
        {/each}
      </nav>
    {/if}
  </div>

  <div
    class="resizer"
    class:active={resizing}
    role="separator"
    aria-orientation="vertical"
    aria-label="Resize sidebar"
    onpointerdown={startResize}
  ></div>
</aside>

<style>
  .sidebar {
    position: relative;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--bg-panel);
    border-right: 1px solid var(--border);
  }

  .sidebar.overlay {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    z-index: 20;
    box-shadow: var(--shadow-panel);
  }

  .segment {
    display: flex;
    gap: 2px;
    padding: var(--sp-2);
    flex-shrink: 0;
  }

  .seg-btn {
    flex: 1;
    padding: 5px var(--sp-2);
    border-radius: var(--radius-s);
    font-size: 12px;
    font-weight: 500;
    color: var(--fg-muted);
    transition:
      background-color var(--t-fast) var(--ease),
      color var(--t-fast) var(--ease);
  }

  .seg-btn:hover {
    background: var(--bg-hover);
  }

  .seg-btn.on {
    background: var(--bg-active);
    color: var(--fg-ui);
  }

  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0 var(--sp-2) var(--sp-4);
  }

  .root-name {
    padding: var(--sp-1) var(--sp-2) var(--sp-2);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--fg-faint);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hint {
    padding: var(--sp-4) var(--sp-2);
    font-size: 12px;
    color: var(--fg-faint);
    line-height: 1.5;
  }

  .outline-item {
    display: block;
    width: 100%;
    padding: 4px var(--sp-2);
    border-radius: var(--radius-s);
    text-align: left;
    font-size: 12.5px;
    color: var(--fg-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    border-left: 2px solid transparent;
    transition:
      background-color var(--t-fast) var(--ease),
      color var(--t-fast) var(--ease);
  }

  .outline-item:hover {
    background: var(--bg-hover);
    color: var(--fg-ui);
  }

  .outline-item.active {
    color: var(--accent);
    border-left-color: var(--accent);
  }

  .resizer {
    position: absolute;
    top: 0;
    right: -3px;
    width: 6px;
    height: 100%;
    cursor: col-resize;
    z-index: 5;
  }

  .resizer:hover,
  .resizer.active {
    background: var(--accent-soft);
  }
</style>
