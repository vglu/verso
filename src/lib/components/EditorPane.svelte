<script lang="ts">
  /**
   * One half of the window: its own tab strip, its own document, its own
   * empty state.
   *
   * The strip only appears here when the window is split. Unsplit, the tabs
   * belong to the top of the window as they always have — one strip across
   * the whole width, above the toolbar. Two strips cannot both be there, so
   * splitting moves them down into the panes they belong to, the way every
   * editor with panes does it.
   */
  import TabBar from './TabBar.svelte';
  import EditorHost from './EditorHost.svelte';
  import EmptyState from './EmptyState.svelte';
  import { tabs, type PaneId } from '../stores/tabs.svelte';
  import { settings } from '../stores/settings.svelte';

  interface Props {
    pane: PaneId;
    booted: boolean;
    onCloseTab: (index: number) => void;
    onCloseTabs: (ids: string[]) => void;
    onLinkClick: (href: string) => void;
    onFind: () => void;
    onSave: () => void;
    onToggleSource: () => void;
    onGoToHeading: () => void;
    onActivity: () => void;
    onNewFile: () => void;
    onOpenFile: () => void;
    onOpenFolder: () => void;
    onOpenRecent: (path: string) => void;
  }

  const {
    pane,
    booted,
    onCloseTab,
    onCloseTabs,
    onLinkClick,
    onFind,
    onSave,
    onToggleSource,
    onGoToHeading,
    onActivity,
    onNewFile,
    onOpenFile,
    onOpenFolder,
    onOpenRecent
  }: Props = $props();

  /** Anything pressed inside a pane makes it the one being worked in. */
  function claimFocus(): void {
    tabs.focusPane(pane);
  }

  function onDragOver(event: DragEvent): void {
    if (!event.dataTransfer?.types.includes('application/x-verso-tab')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }

  function onDrop(event: DragEvent): void {
    const id = event.dataTransfer?.getData('application/x-verso-tab');
    if (!id) return;
    event.preventDefault();
    const index = tabs.tabs.findIndex((tab) => tab.id === id);
    if (index >= 0) tabs.moveToPane(index, pane);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="pane"
  class:focused={tabs.split && tabs.focusedPane === pane}
  onpointerdown={claimFocus}
  ondragover={onDragOver}
  ondrop={onDrop}
>
  {#if tabs.split}
    <TabBar {pane} {onCloseTab} {onCloseTabs} />
  {/if}

  <div class="pane-body">
    <EditorHost
      {pane}
      {onLinkClick}
      {onFind}
      {onSave}
      {onToggleSource}
      {onGoToHeading}
      {onActivity}
    />

    {#if booted && !tabs.hasTabsIn(pane)}
      <EmptyState
        recent={settings.value.recentFiles}
        {onNewFile}
        {onOpenFile}
        {onOpenFolder}
        {onOpenRecent}
      />
    {/if}
  </div>
</div>

<style>
  .pane {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    min-height: 0;
    background: var(--bg);
    position: relative;
  }

  .pane-body {
    flex: 1;
    min-height: 0;
    position: relative;
  }

  /*
   * Which half has the keyboard.
   *
   * A hairline of accent along the top edge, and nothing else: two panes are
   * two documents, and dimming one of them would say that half the window is
   * disabled when it is merely not being typed into.
   */
  .pane.focused::before {
    content: '';
    position: absolute;
    inset: 0 0 auto;
    height: 2px;
    background: var(--accent);
    opacity: 0.55;
    z-index: 3;
    pointer-events: none;
  }
</style>
