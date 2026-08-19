<script lang="ts">
  import { onMount } from 'svelte';
  import { openSearchPanel } from '@codemirror/search';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { getCurrentWebview } from '@tauri-apps/api/webview';

  import TabBar from './lib/components/TabBar.svelte';
  import Sidebar from './lib/components/Sidebar.svelte';
  import EditorHost from './lib/components/EditorHost.svelte';
  import StatusStrip from './lib/components/StatusStrip.svelte';
  import EmptyState from './lib/components/EmptyState.svelte';
  import Banner from './lib/components/Banner.svelte';
  import Modal from './lib/components/Modal.svelte';
  import SettingsModal from './lib/components/SettingsModal.svelte';

  import { tabs } from './lib/stores/tabs.svelte';
  import { workspace } from './lib/stores/workspace.svelte';
  import { settings } from './lib/stores/settings.svelte';
  import { flushSession, restoreSession, scheduleSessionSave } from './lib/stores/session';
  import { t } from './lib/stores/i18n';
  import {
    draftDelete,
    draftGet,
    draftsList,
    getStartupFiles,
    openExternal
  } from './lib/ipc/commands';
  import { onFsChanged, onMenuAction, onOpenFile } from './lib/ipc/events';
  import { pickFile, pickFolder } from './lib/ipc/dialogs';
  import type { DraftInfo, MenuActionId } from './lib/ipc/types';
  import { baseName, isRemoteUrl } from './lib/editor/pathUtil';

  let revision = $state(0);
  let showSettings = $state(false);
  let pendingRecovery = $state<DraftInfo[]>([]);
  let closeRequest = $state<{ index: number; quitting: boolean } | null>(null);
  let narrow = $state(false);

  const activeTab = $derived(tabs.active);

  function bump(): void {
    revision += 1;
    scheduleSessionSave();
  }

  // ---- opening ----

  async function openPath(path: string): Promise<void> {
    const ok = await tabs.openPath(path);
    if (!ok) return;
    if (!workspace.treeRoot) await workspace.setRootFromFile(path);
    bump();
  }

  async function chooseFile(): Promise<void> {
    const picked = await pickFile(activeTab?.dirPath ?? null);
    if (picked) await openPath(picked);
  }

  async function chooseFolder(): Promise<void> {
    const picked = await pickFolder(workspace.treeRoot);
    if (!picked) return;
    await workspace.setRoot(picked);
    workspace.showPanel('files');
    bump();
  }

  // ---- saving / closing ----

  async function save(): Promise<void> {
    await tabs.save();
    bump();
  }

  async function saveAs(): Promise<void> {
    await tabs.saveAs();
    bump();
  }

  function requestClose(index: number): void {
    const tab = tabs.tabs[index];
    if (!tab) return;
    if (tab.dirty) {
      closeRequest = { index, quitting: false };
      return;
    }
    tabs.close(index);
    bump();
  }

  async function confirmSaveAndClose(): Promise<void> {
    const request = closeRequest;
    if (!request) return;
    const saved = await tabs.save(request.index);
    if (!saved) return; // conflict or error: keep the tab open, banner explains
    finishClose(request);
  }

  function discardAndClose(): void {
    const request = closeRequest;
    if (!request) return;
    tabs.close(request.index, { discardDraft: true });
    finishClose(request);
  }

  function finishClose(request: { index: number; quitting: boolean }): void {
    closeRequest = null;
    bump();
    if (request.quitting) void quitNow();
  }

  async function quitNow(): Promise<void> {
    await tabs.flushDrafts();
    await settings.flush();
    await flushSession();
    await getCurrentWindow().destroy();
  }

  // ---- links ----

  async function handleLink(href: string): Promise<void> {
    if (isRemoteUrl(href)) {
      await openExternal(href).catch((e) => console.warn('open external failed', e));
      return;
    }
    // A relative link to another document opens as a tab.
    const dir = activeTab?.dirPath ?? '';
    const { joinPath, stripUrlSuffix, decodeUrlPath } = await import('./lib/editor/pathUtil');
    const target = joinPath(dir, decodeUrlPath(stripUrlSuffix(href)));
    await openPath(target);
  }

  function focusSearch(): void {
    const handle = activeTab ? tabs.handleOf(activeTab.id) : null;
    if (handle) openSearchPanel(handle.view);
  }

  function toggleReader(): void {
    if (!activeTab) return;
    const handle = tabs.handleOf(activeTab.id);
    if (!handle) return;
    const next = !handle.isReaderMode();
    handle.setReaderMode(next);
    handle.view.contentDOM.classList.toggle('md-reader', next);
  }

  // ---- recovery ----

  async function restoreDraft(info: DraftInfo): Promise<void> {
    pendingRecovery = pendingRecovery.filter((d) => d.docId !== info.docId);
    await openPath(info.path);
    const index = tabs.indexOfPath(info.path);
    const tab = tabs.tabs[index];
    const draft = await draftGet(info.docId).catch(() => null);
    if (!tab || !draft) return;
    tab.content = draft.content;
    tab.dirty = true;
    tabs.handleOf(tab.id)?.setContent(draft.content, true);
    bump();
  }

  function discardDraft(info: DraftInfo): void {
    pendingRecovery = pendingRecovery.filter((d) => d.docId !== info.docId);
    void draftDelete(info.docId).catch(() => undefined);
  }

  // ---- menu / keyboard ----

  function runAction(id: MenuActionId): void {
    switch (id) {
      case 'open':
        void chooseFile();
        break;
      case 'openFolder':
        void chooseFolder();
        break;
      case 'save':
        void save();
        break;
      case 'saveAs':
        void saveAs();
        break;
      case 'closeTab':
        if (tabs.activeIndex >= 0) requestClose(tabs.activeIndex);
        break;
      case 'settings':
        showSettings = true;
        break;
      case 'toggleSidebar':
        workspace.toggleSidebar();
        bump();
        break;
      case 'find':
        focusSearch();
        break;
      case 'about':
        showSettings = true;
        break;
    }
  }

  function onKeydown(event: KeyboardEvent): void {
    const mod = event.ctrlKey || event.metaKey;
    if (!mod) return;

    if (event.key === 'Tab') {
      event.preventDefault();
      tabs.activateNext(event.shiftKey ? -1 : 1);
      return;
    }
    if (event.key === '\\') {
      event.preventDefault();
      if (event.shiftKey) workspace.showPanel(workspace.panel === 'files' ? 'outline' : 'files');
      else workspace.toggleSidebar();
      bump();
      return;
    }
    if (event.key.toLowerCase() === 'e') {
      event.preventDefault();
      toggleReader();
      return;
    }
    if (event.key === '=' || event.key === '+') {
      event.preventDefault();
      settings.update({ editorFontSize: Math.min(24, settings.value.editorFontSize + 1) });
      return;
    }
    if (event.key === '-') {
      event.preventDefault();
      settings.update({ editorFontSize: Math.max(12, settings.value.editorFontSize - 1) });
      return;
    }
    if (event.key === '0') {
      event.preventDefault();
      settings.update({ editorFontSize: 16 });
      return;
    }
    if (/^[1-9]$/.test(event.key)) {
      event.preventDefault();
      const n = Number(event.key);
      tabs.activate(n === 9 ? tabs.tabs.length - 1 : n - 1);
      return;
    }
    // Ctrl+O/S/W are owned by the native menu; nothing to do here.
  }

  function onResize(): void {
    narrow = window.innerWidth < 900;
    workspace.overlayMode = narrow;
  }

  // ---- lifecycle ----

  onMount(() => {
    onResize();
    const unlisteners: Array<() => void> = [];

    void (async () => {
      // Files from a double-click take priority over the restored session.
      const startup = await getStartupFiles().catch(() => [] as string[]);

      if (settings.value.restoreSession && startup.length === 0) {
        await restoreSession().catch((e) => console.warn('session restore failed', e));
      } else if (settings.value.restoreSession) {
        await restoreSession().catch(() => undefined);
      }

      for (const path of startup) await openPath(path);

      const drafts = await draftsList().catch(() => [] as DraftInfo[]);
      pendingRecovery = drafts.filter((d) => tabs.indexOfPath(d.path) < 0);

      await tabs.syncWatchList(workspace.treeRoot ? [workspace.treeRoot] : []);

      unlisteners.push(
        await onOpenFile(async ({ paths }) => {
          for (const path of paths) await openPath(path);
        })
      );

      unlisteners.push(
        await onFsChanged(async ({ path, kind }) => {
          await tabs.onExternalChange(path, kind);
          if (workspace.treeRoot && path.startsWith(workspace.treeRoot)) {
            await workspace.refreshTree();
          }
          revision += 1;
        })
      );

      unlisteners.push(await onMenuAction(({ id }) => runAction(id)));

      unlisteners.push(
        await getCurrentWebview().onDragDropEvent(async (event) => {
          if (event.payload.type !== 'drop') return;
          for (const path of event.payload.paths) {
            if (/\.(md|markdown|mdown|mkd|txt)$/i.test(path)) await openPath(path);
          }
        })
      );

      unlisteners.push(
        await getCurrentWindow().onCloseRequested(async (event) => {
          const dirtyIndex = tabs.tabs.findIndex((tab) => tab.dirty);
          if (dirtyIndex >= 0) {
            event.preventDefault();
            closeRequest = { index: dirtyIndex, quitting: true };
            return;
          }
          event.preventDefault();
          await quitNow();
        })
      );
    })();

    return () => {
      for (const off of unlisteners) off();
    };
  });
</script>

<svelte:window onkeydown={onKeydown} onresize={onResize} onfocus={() => void tabs.recheckAll()} />

<div class="app-shell">
  {#if workspace.sidebarVisible}
    <Sidebar
      onOpenFile={(path) => void openPath(path)}
      onRevealHeading={(pos) => {
        const handle = activeTab ? tabs.handleOf(activeTab.id) : null;
        handle?.revealPos(pos);
      }}
    />
  {/if}

  <div class="app-main">
    <TabBar onCloseTab={requestClose} />

    {#each pendingRecovery as draft (draft.docId)}
      <Banner
        tone="info"
        message={`${t('recovery.title')}: ${baseName(draft.path)}`}
        actions={[
          { label: t('recovery.restore'), primary: true, onClick: () => void restoreDraft(draft) },
          { label: t('recovery.discard'), onClick: () => discardDraft(draft) }
        ]}
      />
    {/each}

    {#if activeTab && activeTab.external === 'modified'}
      <Banner
        message={t('conflict.changed')}
        actions={[
          {
            label: t('conflict.reload'),
            primary: true,
            onClick: () => void tabs.reloadFromDisk(tabs.activeIndex)
          },
          { label: t('conflict.keepMine'), onClick: () => tabs.keepMine(tabs.activeIndex) }
        ]}
      />
    {:else if activeTab && activeTab.external === 'removed'}
      <Banner
        message={t('conflict.deleted')}
        actions={[{ label: t('save.save'), primary: true, onClick: () => void saveAs() }]}
        onDismiss={() => tabs.keepMine(tabs.activeIndex)}
      />
    {/if}

    {#if tabs.lastError}
      <Banner message={tabs.lastError} onDismiss={() => (tabs.lastError = null)} />
    {/if}

    <div class="app-content">
      <EditorHost
        onLinkClick={(href) => void handleLink(href)}
        onFind={focusSearch}
        onSave={() => void save()}
        onActivity={bump}
      />

      {#if !tabs.hasTabs}
        <EmptyState
          recent={settings.value.recentFiles}
          onOpenFile={() => void chooseFile()}
          onOpenFolder={() => void chooseFolder()}
          onOpenRecent={(path) => void openPath(path)}
        />
      {/if}
    </div>

    {#if settings.value.showStatusStrip}
      <StatusStrip {revision} />
    {/if}
  </div>
</div>

{#if showSettings}
  <SettingsModal onClose={() => (showSettings = false)} />
{/if}

{#if closeRequest}
  {@const tab = tabs.tabs[closeRequest.index]}
  <Modal
    title={t('save.prompt', { name: tab?.fileName ?? '' })}
    onClose={() => (closeRequest = null)}
  >
    <p class="prompt">{t('save.prompt', { name: tab?.fileName ?? '' })}</p>

    {#snippet footer()}
      <button class="btn" onclick={() => (closeRequest = null)}>{t('save.cancel')}</button>
      <button class="btn" onclick={discardAndClose}>{t('save.dontSave')}</button>
      <button class="btn btn-primary" onclick={() => void confirmSaveAndClose()}>
        {t('save.save')}
      </button>
    {/snippet}
  </Modal>
{/if}

<style>
  .app-shell {
    position: relative;
  }

  .prompt {
    margin: 0;
    font-size: 13px;
    color: var(--fg-ui);
  }
</style>
