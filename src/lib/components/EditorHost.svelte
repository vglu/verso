<script lang="ts">
  import { tabs } from '../stores/tabs.svelte';
  import { workspace } from '../stores/workspace.svelte';
  import { createEditor } from '../editor/createEditor';
  import { extractOutline, activeOutlineIndex } from '../editor/outline';

  interface Props {
    onLinkClick: (href: string) => void;
    onFind: () => void;
    onSave: () => void;
    /** Fired on any edit or cursor move, so the chrome can refresh. */
    onActivity: () => void;
  }

  const { onLinkClick, onFind, onSave, onActivity }: Props = $props();

  let outlineTimer: ReturnType<typeof setTimeout> | null = null;

  /** Outline refresh is debounced: typing must not pay for a tree walk. */
  function scheduleOutlineUpdate(tabId: string): void {
    if (outlineTimer) clearTimeout(outlineTimer);
    outlineTimer = setTimeout(() => {
      outlineTimer = null;
      const handle = tabs.handleOf(tabId);
      if (!handle || tabs.active?.id !== tabId) return;
      const items = extractOutline(handle.view.state);
      workspace.setOutline(items, activeOutlineIndex(items, handle.getCursor().pos));
    }, 200);
  }

  function updateActiveOutlineOnly(tabId: string): void {
    const handle = tabs.handleOf(tabId);
    if (!handle || tabs.active?.id !== tabId) return;
    workspace.activeOutline = activeOutlineIndex(workspace.outline, handle.getCursor().pos);
  }

  /** Svelte action: the editor's lifetime is tied to its host element. */
  function mountEditor(node: HTMLElement, tabId: string) {
    const tab = tabs.tabs.find((t) => t.id === tabId);
    if (!tab) return;

    const handle = createEditor({
      parent: node,
      doc: tab.content,
      dir: tab.dirPath,
      readOnly: tab.readonly,
      onChange: (content, meta) => {
        tabs.setContent(tabId, content, meta.userInitiated);
        scheduleOutlineUpdate(tabId);
        onActivity();
      },
      onSelectionChange: () => {
        updateActiveOutlineOnly(tabId);
        onActivity();
      },
      onLinkClick: (href) => onLinkClick(href),
      keymapHooks: { onFind, onSave }
    });

    tabs.registerHandle(tabId, handle);

    if (tab.cursor > 0) handle.setCursor(tab.cursor);
    if (tab.scrollTop > 0) {
      requestAnimationFrame(() => handle.setScrollTop(tab.scrollTop));
    }
    scheduleOutlineUpdate(tabId);

    return {
      destroy(): void {
        tabs.unregisterHandle(tabId);
      }
    };
  }

  // Focus follows the active tab, and the outline follows with it.
  $effect(() => {
    const active = tabs.active;
    if (!active) {
      workspace.setOutline([], -1);
      return;
    }
    const handle = tabs.handleOf(active.id);
    if (!handle) return;
    handle.focus();
    if (active.scrollTop > 0) handle.setScrollTop(active.scrollTop);
    scheduleOutlineUpdate(active.id);
  });
</script>

{#each tabs.tabs as tab, index (tab.id)}
  <div
    class="host"
    class:hidden={index !== tabs.activeIndex}
    use:mountEditor={tab.id}
    data-tab={tab.fileName}
  ></div>
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
