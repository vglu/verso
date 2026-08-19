<script lang="ts">
  import { tabs } from '../stores/tabs.svelte';
  import { workspace } from '../stores/workspace.svelte';
  import { settings } from '../stores/settings.svelte';
  import { createEditor } from '../editor/createEditor';
  import { extractOutline } from '../editor/outline';
  import { createOutlineSync } from '../editor/outlineSync';

  interface Props {
    onLinkClick: (href: string) => void;
    onFind: () => void;
    onSave: () => void;
    onToggleSource: () => void;
    onGoToHeading: () => void;
    /** Fired on any edit or cursor move, so the chrome can refresh. */
    onActivity: () => void;
  }

  const { onLinkClick, onFind, onSave, onToggleSource, onGoToHeading, onActivity }: Props =
    $props();

  // A mode switch applies to every open document, not just the active one.
  $effect(() => {
    const source = settings.value.editorMode === 'source';
    for (const tab of tabs.tabs) tabs.handleOf(tab.id)?.setSourceMode(source);
  });

  /** Outline refresh is debounced: typing must not pay for a tree walk. */
  const outlineSync = createOutlineSync(
    {
      activeId: () => tabs.active?.id ?? null,
      outlineOf: (id) => {
        const handle = tabs.handleOf(id);
        return handle ? extractOutline(handle.view.state) : null;
      },
      activeIndexOf: (id) => tabs.handleOf(id)?.getActiveOutlineIndex() ?? -1
    },
    (items, activeIndex) => workspace.setOutline(items, activeIndex)
  );

  function scheduleOutlineUpdate(tabId: string): void {
    outlineSync.schedule(tabId);
  }

  /**
   * Which section the reader is in — decided by what is on screen, not by
   * where the caret happens to sit.
   *
   * They are different questions, and answering the second while the reader
   * is scrolling means the outline highlights a heading nowhere near the
   * text in front of them.
   */
  function updateActiveOutlineOnly(tabId: string): void {
    const handle = tabs.handleOf(tabId);
    if (!handle || tabs.active?.id !== tabId) return;
    workspace.activeOutline = handle.getActiveOutlineIndex();
    workspace.viewportFrom = handle.view.visibleRanges[0]?.from ?? 0;
  }

  /** Svelte action: the editor's lifetime is tied to its host element. */
  function mountEditor(node: HTMLElement, tabId: string) {
    const tab = tabs.tabs.find((t) => t.id === tabId);
    if (!tab) return;

    const handle = createEditor({
      parent: node,
      doc: tab.content,
      dir: tab.dirPath,
      fileName: tab.fileName,
      readOnly: tab.readonly,
      sourceMode: settings.value.editorMode === 'source',
      spellcheck: settings.value.spellcheck,
      onChange: (content, meta) => {
        tabs.setContent(tabId, content, meta.userInitiated);
        scheduleOutlineUpdate(tabId);
        onActivity();
      },
      onSelectionChange: () => {
        updateActiveOutlineOnly(tabId);
        onActivity();
      },
      onStructureChange: () => scheduleOutlineUpdate(tabId),
      onViewportChange: () => updateActiveOutlineOnly(tabId),
      onLinkClick: (href) => onLinkClick(href),
      keymapHooks: { onFind, onSave, onToggleSource, onGoToHeading }
    });

    tabs.registerHandle(tabId, handle);

    if (tab.cursor > 0) handle.setCursor(tab.cursor);
    if (tab.scroll.pos > 0 || tab.scroll.offset !== 0) handle.setScrollAnchor(tab.scroll);

    // The editor is built the first time its tab is shown, which is after the
    // effect that would normally hand it the focus and the outline has already
    // run and found nothing. So it does that work here, where the editor
    // actually exists.
    if (tabs.active?.id === tabId) {
      handle.focus();
      outlineSync.schedule(tabId);
      outlineSync.flush();
    } else {
      scheduleOutlineUpdate(tabId);
    }

    return {
      destroy(): void {
        tabs.unregisterHandle(tabId);
      }
    };
  }

  /**
   * Documents that have been looked at, and so have an editor.
   *
   * A restored session can be a dozen files, and building a CodeMirror
   * instance for each one before the first is on screen is work done for
   * nobody: twelve of them are behind a tab the reader has not chosen. The
   * editor is built when its tab is first shown and kept from then on, so
   * coming back to it is instant.
   */
  let opened = $state<string[]>([]);

  // Focus follows the active tab, and the outline follows with it.
  $effect(() => {
    const active = tabs.active;
    if (!active) {
      workspace.setOutline([], -1);
      return;
    }
    // A tab restored from the last session is only a path until now. Reading
    // it flips `loaded`, which brings this effect back with a document.
    if (!active.loaded) {
      void tabs.ensureLoaded(active.id);
      return;
    }

    if (!opened.includes(active.id)) opened = [...opened, active.id];

    const handle = tabs.handleOf(active.id);
    if (!handle) return;
    handle.focus();
    if (active.scroll.pos > 0 || active.scroll.offset !== 0) handle.setScrollAnchor(active.scroll);
    // Switching documents refreshes the panel at once: a debounce here would
    // leave the previous document's headings on screen next to this one's text.
    outlineSync.schedule(active.id);
    outlineSync.flush();
  });
</script>

{#each tabs.tabs as tab, index (tab.id)}
  {#if opened.includes(tab.id)}
    <div
      class="host"
      class:hidden={index !== tabs.activeIndex}
      use:mountEditor={tab.id}
      data-tab={tab.fileName}
    ></div>
  {/if}
{/each}

<style>
  .host {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }

  /* Inactive editors stay alive: keeping the instance preserves undo
     history, scroll position and selection when switching back. */
  .hidden {
    display: none;
  }
</style>
