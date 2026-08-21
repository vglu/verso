<script lang="ts">
  import { flip } from 'svelte/animate';
  import { tabs } from '../stores/tabs.svelte';
  import { t } from '../stores/i18n';
  import { revealInOs } from '../ipc/commands';
  import { flipMotion } from '../ui/motion';
  import { scrollFade } from '../ui/scrollFade';
  import { tip } from '../ui/tooltip';
  import ContextMenu, { type ContextItem } from './ContextMenu.svelte';

  interface Props {
    onCloseTab: (index: number) => void;
    /** Close a set of tabs, asking about any with unsaved changes. */
    onCloseTabs: (ids: string[]) => void;
  }

  const { onCloseTab, onCloseTabs }: Props = $props();

  let context = $state<{ x: number; y: number; items: ContextItem[] } | null>(null);
  let strip = $state<HTMLElement | null>(null);

  /**
   * Keep the open document visible in the strip.
   *
   * With a dozen files open the tab that was just activated — or the one that
   * was just opened, which lands at the end — can be past the right edge. The
   * document changes and the strip shows no sign of it, which reads as the
   * click having missed.
   */
  $effect(() => {
    void tabs.activeIndex;
    void tabs.tabs.length;
    const active = strip?.querySelector<HTMLElement>('[aria-selected="true"]');
    active?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });

  /**
   * The menu a tab strip is expected to have.
   *
   * Right-clicking a tab used to produce the webview's own menu — Back,
   * Refresh, Print, "Send tab to your devices" — which is a browser showing
   * through a desktop application. These are the things the tab itself can do.
   */
  function openTabMenu(event: MouseEvent, index: number): void {
    event.preventDefault();
    event.stopPropagation();

    const tab = tabs.tabs[index];
    if (!tab) return;

    const ids = (list: number[]): string[] =>
      list.map((i) => tabs.tabs[i]?.id).filter((id): id is string => Boolean(id));

    const items: ContextItem[] = [
      { label: t('tab.close'), onSelect: () => onCloseTab(index) },
      { label: t('tab.closeOthers'), onSelect: () => onCloseTabs(ids(tabs.othersThan(index))) },
      { label: t('tab.closeRight'), onSelect: () => onCloseTabs(ids(tabs.rightOf(index))) },
      {
        label: t('tab.closeAll'),
        onSelect: () => onCloseTabs(ids(tabs.tabs.map((_, i) => i)))
      },
      { label: t('tab.save'), onSelect: () => void tabs.save(index), divider: true },
      { label: t('tab.saveAs'), onSelect: () => void tabs.saveAs(index) }
    ];

    if (tab.path) {
      items.push(
        { label: t('tab.copyPath'), onSelect: () => void copy(tab.path!), divider: true },
        { label: t('tab.copyName'), onSelect: () => void copy(tab.fileName) },
        { label: t('tree.reveal'), onSelect: () => void revealInOs(tab.path!) },
        {
          label: t('tab.reload'),
          onSelect: () => void tabs.reloadFromDisk(index),
          divider: true
        }
      );
    }

    context = { x: event.clientX, y: event.clientY, items };
  }

  async function copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.warn('copy failed', error);
    }
  }

  function onAuxClick(event: MouseEvent, index: number): void {
    if (event.button === 1) {
      event.preventDefault();
      onCloseTab(index);
    }
  }

  /**
   * A tab strip is one stop on the Tab key, not one per document.
   *
   * With every tab tabbable, reaching the editor from the sidebar meant
   * pressing Tab once for each open file. Arrow keys move between tabs, which
   * is what a tablist is supposed to do.
   */
  function onTabKeydown(event: KeyboardEvent, index: number): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      tabs.activate(index);
      return;
    }

    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (delta === 0) return;

    event.preventDefault();
    tabs.activateNext(delta);
    focusActiveTab(event.currentTarget as HTMLElement);
  }

  function focusActiveTab(from: HTMLElement): void {
    const strip = from.closest('.tabbar');
    const next = strip?.querySelectorAll<HTMLElement>('[role="tab"]')[tabs.activeIndex];
    next?.focus();
  }

  function onWheel(event: WheelEvent): void {
    const el = event.currentTarget as HTMLElement;
    if (el.scrollWidth > el.clientWidth) {
      el.scrollLeft += event.deltaY;
    }
  }
</script>

{#if tabs.hasTabs}
  <!-- The frame carries the surface and the hairline; the strip inside it
       scrolls and fades at the edges, so the chrome never dissolves with it. -->
  <div class="tabbar-frame">
    <div
      class="tabbar strip-scroll"
      role="tablist"
      onwheel={onWheel}
      bind:this={strip}
      use:scrollFade
    >
      {#each tabs.tabs as tab, index (tab.id)}
        <div
          class="tab"
          class:active={index === tabs.activeIndex}
          role="tab"
          tabindex={index === tabs.activeIndex ? 0 : -1}
          aria-selected={index === tabs.activeIndex}
          animate:flip={flipMotion()}
          use:tip={tab.path ?? tab.fileName}
          onclick={() => tabs.activate(index)}
          onauxclick={(e) => onAuxClick(e, index)}
          oncontextmenu={(e) => openTabMenu(e, index)}
          onkeydown={(e) => onTabKeydown(e, index)}
        >
          <span class="name">{tab.fileName}</span>

          <!-- The unsaved dot and the close button share one cell: they
             cross-fade instead of swapping, so nothing shifts on hover. -->
          <span class="affordance" class:dirty={tab.dirty}>
            <span class="dot" aria-label="Unsaved changes"></span>

            <button
              class="close"
              aria-label="Close tab"
              onclick={(e) => {
                e.stopPropagation();
                onCloseTab(index);
              }}
            >
              <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
                <path
                  d="M3 3l6 6M9 3l-6 6"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                />
              </svg>
            </button>
          </span>
        </div>
      {/each}
    </div>
  </div>
{/if}

{#if context}
  <ContextMenu x={context.x} y={context.y} items={context.items} onClose={() => (context = null)} />
{/if}

<style>
  .tabbar-frame {
    flex-shrink: 0;
    background: var(--bg-app);
    border-bottom: 1px solid var(--border);
  }

  .tabbar {
    display: flex;
    align-items: stretch;
    height: var(--tabbar-height);
    overflow-y: hidden;
    user-select: none;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: 0 var(--sp-2) 0 var(--sp-3);
    max-width: 180px;
    min-width: 90px;
    border-right: 1px solid var(--border);
    color: var(--fg-muted);
    font-size: 12.5px;
    cursor: default;
    transition:
      background-color var(--t-fast) var(--ease),
      color var(--t-fast) var(--ease);
  }

  @media (hover: hover) and (pointer: fine) {
    .tab:hover {
      background: var(--bg-hover);
    }
  }

  .tab.active {
    background: var(--bg);
    color: var(--fg-ui);
  }

  .name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .affordance {
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }

  .dot,
  .close {
    grid-area: 1 / 1;
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent);
    opacity: 0;
    transition: opacity var(--t-fast) var(--ease);
  }

  .affordance.dirty .dot {
    opacity: 1;
  }

  .close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: var(--radius-s);
    color: var(--fg-faint);
    opacity: 0;
    transition:
      opacity var(--t-fast) var(--ease),
      background-color var(--t-fast) var(--ease),
      color var(--t-fast) var(--ease),
      transform var(--t-press) var(--ease-out);
  }

  /* A clean active tab shows its close button; a modified one keeps the dot,
     so the unsaved signal is never traded away for an affordance. */
  .tab.active .affordance:not(.dirty) .close,
  .close:focus-visible {
    opacity: 1;
  }

  .close:active {
    transform: scale(var(--press-scale-icon));
  }

  @media (hover: hover) and (pointer: fine) {
    .tab:hover .close {
      opacity: 1;
    }

    .tab:hover .affordance.dirty .dot {
      opacity: 0;
    }

    .close:hover {
      background: var(--bg-active);
      color: var(--fg-ui);
    }
  }
</style>
