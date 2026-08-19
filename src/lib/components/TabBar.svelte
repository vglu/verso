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
        tabindex="0"
        aria-selected={index === tabs.activeIndex}
        title={tab.path ?? tab.fileName}
        onclick={() => tabs.activate(index)}
        onauxclick={(e) => onAuxClick(e, index)}
        onkeydown={(e) => e.key === 'Enter' && tabs.activate(index)}
      >
        <span class="name">{tab.fileName}</span>

        {#if tab.dirty}
          <span class="dot" aria-label="Unsaved changes"></span>
        {/if}

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

  .tab:hover {
    background: var(--bg-hover);
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

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent);
    flex-shrink: 0;
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
    flex-shrink: 0;
    transition:
      opacity var(--t-fast) var(--ease),
      background-color var(--t-fast) var(--ease);
  }

  .tab:hover .close,
  .tab.active .close {
    opacity: 1;
  }

  .close:hover {
    background: var(--bg-active);
    color: var(--fg-ui);
  }

  /* The dirty dot yields to the close button while hovering. */
  .tab:hover .dot {
    display: none;
  }
</style>
