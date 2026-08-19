<script lang="ts">
  import { tabs } from '../stores/tabs.svelte';

  interface Props {
    onCloseTab: (index: number) => void;
  }

  const { onCloseTab }: Props = $props();

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
  <div class="tabbar" role="tablist" onwheel={onWheel}>
    {#each tabs.tabs as tab, index (tab.id)}
      <div
        class="tab"
        class:active={index === tabs.activeIndex}
        role="tab"
        tabindex={index === tabs.activeIndex ? 0 : -1}
        aria-selected={index === tabs.activeIndex}
        title={tab.path ?? tab.fileName}
        onclick={() => tabs.activate(index)}
        onauxclick={(e) => onAuxClick(e, index)}
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
{/if}

<style>
  .tabbar {
    display: flex;
    align-items: stretch;
    height: var(--tabbar-height);
    flex-shrink: 0;
    background: var(--bg-app);
    border-bottom: 1px solid var(--border);
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    user-select: none;
  }

  .tabbar::-webkit-scrollbar {
    display: none;
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
    transform: scale(0.88);
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
