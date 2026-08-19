<script lang="ts">
  import FileTreeNode from './FileTreeNode.svelte';
  import BrandMark from './BrandMark.svelte';
  import { workspace } from '../stores/workspace.svelte';
  import { tabs } from '../stores/tabs.svelte';
  import { t } from '../stores/i18n';
  import { baseName } from '../editor/pathUtil';
  import { APP_NAME, SIDEBAR_CONDENSE_WIDTH, loadVersion, signatureLine } from '../ui/product';

  interface Props {
    onOpenFile: (path: string) => void;
    onNewFile: (dirPath: string) => void;
    onAbout: () => void;
  }

  const { onOpenFile, onNewFile, onAbout }: Props = $props();

  let version = $state('');
  void loadVersion().then((v) => (version = v));

  /**
   * Narrow the panel and the signature gives up its words before it gives up
   * its presence: name and copyright fold away, the version stays, and the
   * full line survives in the tooltip.
   */
  const condensed = $derived(workspace.width < SIDEBAR_CONDENSE_WIDTH);
  const signature = $derived(version ? signatureLine(version) : APP_NAME);

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
  <div class="head">
    <span>{t('sidebar.files')}</span>
    <button
      class="head-action"
      onclick={() => onNewFile(workspace.treeRoot ?? '')}
      title={t('sidebar.newFile')}
      aria-label={t('sidebar.newFile')}
    >
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M8 3.5v9M3.5 8h9"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
        />
      </svg>
    </button>
  </div>

  <div class="body">
    {#if workspace.treeRoot}
      <div class="root-name" title={workspace.treeRoot}>{baseName(workspace.treeRoot)}</div>
      {#if rootEntries.length === 0}
        <div class="hint">{t('sidebar.emptyTree')}</div>
      {:else}
        <div role="tree" aria-label={t('sidebar.files')}>
          {#each rootEntries as entry (entry.path)}
            <FileTreeNode {entry} depth={0} {activePath} onOpen={onOpenFile} />
          {/each}
        </div>
      {/if}
    {:else}
      <div class="hint">{t('empty.hint')}</div>
    {/if}
  </div>

  <button class="footer" onclick={onAbout} title={signature} aria-label={t('about.open')}>
    <span class="footer-mark"><BrandMark size={14} /></span>

    {#if !condensed}
      <span class="footer-name">{APP_NAME}</span>
    {/if}

    {#if version}
      <span class="footer-version">{version}</span>
    {/if}
  </button>

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

  .head {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2);
    padding: var(--sp-3) var(--sp-2) var(--sp-2) var(--sp-3);
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--fg-faint);
  }

  /* Quiet until wanted: the panel is for reading, and a button competing with
     the file names would be the loudest thing in it. */
  .head-action {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: var(--radius-s);
    color: var(--fg-faint);
    opacity: 0.65;
    transition:
      opacity var(--t-fast) var(--ease),
      background-color var(--t-fast) var(--ease),
      transform var(--t-press) var(--ease-out);
  }

  .head-action svg {
    width: 14px;
    height: 14px;
  }

  .head-action:active {
    transform: scale(0.94);
  }

  .head-action:focus-visible {
    opacity: 1;
    color: var(--fg-ui);
  }

  @media (hover: hover) and (pointer: fine) {
    .head-action:hover {
      opacity: 1;
      color: var(--fg-ui);
      background: var(--bg-hover);
    }
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

  @media (hover: hover) and (pointer: fine) {
    .resizer:hover {
      background: var(--accent-soft);
    }
  }

  /* The product signature: quiet, always there, and the way into About. */
  .footer {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    flex-shrink: 0;
    width: 100%;
    padding: var(--sp-2) var(--sp-3);
    border-top: 1px solid var(--border);
    color: var(--fg-faint);
    font-size: 11px;
    overflow: hidden;
    white-space: nowrap;
    transition:
      background-color var(--t-fast) var(--ease),
      color var(--t-fast) var(--ease);
  }

  .footer-mark {
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }

  .footer-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 500;
  }

  .footer-version {
    margin-left: auto;
    font-family: var(--font-mono);
    font-size: 10.5px;
    opacity: 0.85;
    flex-shrink: 0;
  }

  @media (hover: hover) and (pointer: fine) {
    .footer:hover {
      background: var(--bg-hover);
      color: var(--fg-muted);
    }
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

  .resizer.active {
    background: var(--accent-soft);
  }
</style>
