<script lang="ts">
  import { onMount } from 'svelte';
  import { gotoLine, openSearchPanel } from '@codemirror/search';
  import { foldAll, unfoldAll } from '@codemirror/language';
  import type { EditorView } from '@codemirror/view';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { getCurrentWebview } from '@tauri-apps/api/webview';

  import TabBar from './lib/components/TabBar.svelte';
  import Toolbar from './lib/components/Toolbar.svelte';
  import Breadcrumbs from './lib/components/Breadcrumbs.svelte';
  import Sidebar from './lib/components/Sidebar.svelte';
  import OutlinePanel from './lib/components/OutlinePanel.svelte';
  import EditorHost from './lib/components/EditorHost.svelte';
  import StatusStrip from './lib/components/StatusStrip.svelte';
  import EmptyState from './lib/components/EmptyState.svelte';
  import HeadingPalette from './lib/components/HeadingPalette.svelte';
  import Banner from './lib/components/Banner.svelte';
  import Modal from './lib/components/Modal.svelte';
  import SettingsModal from './lib/components/SettingsModal.svelte';
  import AboutModal from './lib/components/AboutModal.svelte';

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
  import { pushJump } from './lib/editor/history';
  import { exportToHtml, printDocument, type ExportRequest } from './lib/export';

  let revision = $state(0);
  let showSettings = $state(false);
  let showAbout = $state(false);
  let showPalette = $state(false);
  let pendingRecovery = $state<DraftInfo[]>([]);
  let closeRequest = $state<{
    index: number;
    quitting: boolean;
    /** Part of a "close others" sweep: ask about the next one afterwards. */
    sweeping?: boolean;
  } | null>(null);
  let narrow = $state(false);
  /**
   * Restoring a session is asynchronous. Until it settles we render nothing
   * in the document area — showing "no document open" first and filling it
   * with tabs a moment later reads as the app changing its mind.
   */
  let booted = $state(false);
  /** Set once we are on the way out, so the close handler stops intervening. */
  let quitting = false;

  const activeTab = $derived(tabs.active);

  // The folder on screen is watched for as long as it is on screen, whatever
  // happens to the tabs in the meantime. The user's theme file joins it, so
  // that editing a theme repaints the application as you save it — which is
  // the difference between writing a theme and guessing at one.
  $effect(() => {
    const extras = [workspace.treeRoot, settings.value.themeFile].filter((p): p is string =>
      Boolean(p)
    );
    tabs.setWatchExtras(extras);
  });

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
    workspace.sidebarVisible = true;
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

  /**
   * Close a set of tabs, asking about each one that has unsaved changes.
   *
   * Tracked by id rather than index: closing one tab renumbers the rest, and
   * an index taken before the first close points at a different document by
   * the time the reader answers the second question.
   */
  let sweepIds = $state<string[]>([]);

  function closeTabs(ids: string[]): void {
    const indexes = ids
      .map((id) => tabs.tabs.findIndex((tab) => tab.id === id))
      .filter((index) => index >= 0);

    const dirty = tabs.closeMany(indexes);
    sweepIds = dirty.map((index) => tabs.tabs[index]?.id).filter((id): id is string => Boolean(id));

    bump();
    askAboutNextSweep();
  }

  function askAboutNextSweep(): void {
    while (sweepIds.length > 0) {
      const id = sweepIds[0]!;
      sweepIds = sweepIds.slice(1);
      const index = tabs.tabs.findIndex((tab) => tab.id === id);
      if (index >= 0) {
        closeRequest = { index, quitting: false, sweeping: true };
        return;
      }
    }
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
    // When quitting, the tab does not need removing — the window is going away.
    if (!request.quitting) tabs.close(request.index);
    finishClose(request);
  }

  function discardAndClose(): void {
    const request = closeRequest;
    if (!request) return;
    tabs.close(request.index, { discardDraft: true });
    finishClose(request);
  }

  function finishClose(request: { index: number; quitting: boolean; sweeping?: boolean }): void {
    closeRequest = null;
    bump();

    if (request.sweeping) {
      askAboutNextSweep();
      return;
    }
    if (!request.quitting) return;

    // Quitting asks about every unsaved document, not just the first one.
    const nextDirty = tabs.tabs.findIndex((tab) => tab.dirty);
    if (nextDirty >= 0) {
      closeRequest = { index: nextDirty, quitting: true };
      return;
    }
    void quitNow();
  }

  /**
   * Persist everything, then close for real.
   *
   * The close handler always cancels the OS request so drafts and the session
   * are written first, which means this function is the only way out — if it
   * failed silently the window would refuse to close, so every step is
   * guarded and there is a fallback path.
   */
  async function quitNow(): Promise<void> {
    quitting = true;
    try {
      await tabs.flushDrafts();
      await settings.flush();
      await flushSession();
    } catch (error) {
      console.error('failed to persist state before closing', error);
    }

    const window = getCurrentWindow();
    try {
      await window.destroy();
    } catch (error) {
      console.error('destroy failed, falling back to close', error);
      await window.close().catch(() => undefined);
    }
  }

  // ---- export ----

  /**
   * What the active document needs to become a page of its own.
   *
   * Null when there is nothing open, or when the tab is a path the file has
   * not been read from yet — exporting an empty buffer would be worse than
   * refusing.
   */
  function exportRequest(): ExportRequest | null {
    const tab = activeTab;
    const handle = tab ? tabs.handleOf(tab.id) : null;
    if (!tab || !handle || !tab.loaded) return null;

    return {
      state: handle.view.state,
      name: tab.fileName.replace(/\.[^.]+$/, ''),
      dir: tab.dirPath,
      pageWidth: settings.value.editorMaxWidth
    };
  }

  async function exportDocument(): Promise<void> {
    const request = exportRequest();
    if (!request) return;
    try {
      await exportToHtml(request);
    } catch (error) {
      tabs.lastError = String(error);
    }
  }

  async function printActive(): Promise<void> {
    const request = exportRequest();
    if (!request) return;
    try {
      await printDocument(request);
    } catch (error) {
      tabs.lastError = String(error);
    }
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

  /** Jump to a heading and remember where the reader came from. */
  function revealHeading(pos: number): void {
    const handle = activeTab ? tabs.handleOf(activeTab.id) : null;
    if (!handle) return;
    pushJump(handle.view);
    handle.revealPos(pos);
  }

  /** Give the keyboard back to the document after an overlay closes. */
  function focusEditor(): void {
    if (activeTab) tabs.handleOf(activeTab.id)?.focus();
  }

  /** Run something against the active document's editor, if there is one. */
  function withEditor(action: (view: EditorView) => void): void {
    const handle = activeTab ? tabs.handleOf(activeTab.id) : null;
    if (handle) action(handle.view);
  }

  function focusSearch(): void {
    const handle = activeTab ? tabs.handleOf(activeTab.id) : null;
    if (!handle) return;
    // Remember where the reader was before they went looking. Escape leaves
    // them wherever the search took them — which is right, they chose to go —
    // and this is what makes Back bring them home.
    pushJump(handle.view);
    openSearchPanel(handle.view);
  }

  /**
   * Live preview and plain source are two ways of looking at one file, not
   * two documents. Whatever the rendering makes awkward, source mode makes
   * ordinary — so it is one key away, and remembered.
   */
  function toggleSourceMode(): void {
    settings.update({ editorMode: settings.value.editorMode === 'source' ? 'live' : 'source' });
    bump();
  }

  function toggleReader(): void {
    if (!activeTab) return;
    const handle = tabs.handleOf(activeTab.id);
    if (!handle) return;
    const next = !handle.isReaderMode();
    handle.setReaderMode(next);
    handle.view.contentDOM.classList.toggle('md-reader', next);
  }

  /**
   * A new document, opened where the reader is looking.
   *
   * Nothing is written until they save it — an empty file created on Ctrl+N
   * would litter the folder every time someone changed their mind — but the
   * save dialog opens in the folder the tree is showing, which is almost
   * always where they meant to put it.
   */
  function newFile(dirPath?: string): void {
    tabs.openUntitled(dirPath ?? tabs.active?.dirPath ?? workspace.treeRoot ?? '');
    bump();
  }

  // ---- recovery ----

  async function restoreDraft(info: DraftInfo): Promise<void> {
    pendingRecovery = pendingRecovery.filter((d) => d.docId !== info.docId);

    // A draft with no path was a document that had never been saved. It is
    // the one with nowhere else to survive, so it comes back as itself —
    // same id, so it keeps its own draft rather than orphaning it.
    if (!info.path) {
      const draft = await draftGet(info.docId).catch(() => null);
      if (!draft) return;
      const id = tabs.openUntitled('', info.docId, draft.content);
      const tab = tabs.tabs.find((t) => t.id === id);
      if (tab) tab.dirty = true;
      bump();
      return;
    }

    await openPath(info.path);
    const index = tabs.indexOfPath(info.path);
    const tab = tabs.tabs[index];
    const draft = await draftGet(info.docId).catch(() => null);
    if (!tab || !draft) return;
    tab.content = draft.content;
    tab.dirty = true;
    tabs.handleOf(tab.id)?.setContent(draft.content);
    bump();
  }

  function discardDraft(info: DraftInfo): void {
    pendingRecovery = pendingRecovery.filter((d) => d.docId !== info.docId);
    void draftDelete(info.docId).catch(() => undefined);
  }

  // ---- menu / keyboard ----

  function runAction(id: MenuActionId): void {
    switch (id) {
      case 'newFile':
        newFile();
        break;
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
      case 'toggleOutline':
        workspace.toggleOutline();
        bump();
        break;
      case 'find':
        focusSearch();
        break;
      case 'goToHeading':
        showPalette = true;
        break;
      case 'exportHtml':
        void exportDocument();
        break;
      case 'print':
        void printActive();
        break;
      case 'foldAll':
        withEditor((view) => foldAll(view));
        break;
      case 'unfoldAll':
        withEditor((view) => unfoldAll(view));
        break;
      case 'goToLine':
        withEditor((view) => {
          pushJump(view);
          gotoLine(view);
        });
        break;
      case 'about':
        showAbout = true;
        break;
    }
  }

  /** Anywhere the user is typing something that is not the document. */
  function typingElsewhere(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    return (
      tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true
    );
  }

  function onKeydown(event: KeyboardEvent): void {
    // Someone nearer the event already dealt with it — the editor's own
    // keymap, a modal, the search panel. Acting again would fire twice.
    if (event.defaultPrevented) return;
    // Ctrl+A in the filter field must select the field's text, not switch tabs.
    if (typingElsewhere(event.target)) return;

    const mod = event.ctrlKey || event.metaKey;
    if (!mod) return;

    if (event.key === 'Tab') {
      event.preventDefault();
      tabs.activateNext(event.shiftKey ? -1 : 1);
      return;
    }
    if (event.key === '\\') {
      event.preventDefault();
      // Files on the left, outline on the right — one key each, no mode switch.
      if (event.shiftKey) workspace.toggleOutline();
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

  /**
   * The webview's own context menu has no business here.
   *
   * Right-clicking a tab offered Back, Refresh, Print and "Send tab to your
   * devices" — a browser showing through a desktop application. It is
   * suppressed everywhere we have something of our own to put in its place,
   * and kept inside the document's text, where the system menu is genuinely
   * the right one: cut, copy and paste cannot be reimplemented from a webview
   * without asking for clipboard permissions we do not want.
   */
  function onContextMenu(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.cm-content') || target?.closest('input, textarea')) return;
    event.preventDefault();
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
      // The document someone double-clicked is what they are waiting for, so
      // it opens first and the session fills in behind it. Restoring first
      // meant reading every file of the last session — a dozen of them —
      // before the one they actually asked for reached the screen.
      const startup = await getStartupFiles().catch(() => [] as string[]);

      for (const path of startup) await openPath(path);
      booted = startup.length > 0;

      if (settings.value.restoreSession) {
        // Do not let the restore steal the tab they opened.
        const restored = await restoreSession({ activate: startup.length === 0 }).catch((e) => {
          console.warn('session restore failed', e);
          return null;
        });

        // Unless there is nothing to steal. A document that cannot be opened —
        // an encoding we do not read, a file that has moved — must not leave a
        // window of tabs above an empty page.
        if (restored && tabs.activeIndex < 0 && restored.activeIndex >= 0) {
          tabs.activate(restored.activeIndex);
        }
      }

      booted = true;

      const drafts = await draftsList().catch(() => [] as DraftInfo[]);
      pendingRecovery = drafts.filter((d) => tabs.indexOfPath(d.path) < 0);

      await tabs.syncWatchList();

      unlisteners.push(
        await onOpenFile(async ({ paths }) => {
          for (const path of paths) await openPath(path);
        })
      );

      unlisteners.push(
        await onFsChanged(async ({ path, kind }) => {
          // The theme file is watched too: save it in your editor and the
          // application repaints.
          if (settings.value.themeFile && path === settings.value.themeFile) {
            await settings.applyUserTheme();
            return;
          }
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
          if (quitting) return; // already shutting down — let the close through

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

<svelte:window
  onkeydown={onKeydown}
  onresize={onResize}
  oncontextmenu={onContextMenu}
  onfocus={() => void tabs.recheckAll()}
/>

<div class="app-shell">
  {#if workspace.sidebarVisible}
    <Sidebar
      onOpenFile={(path) => void openPath(path)}
      onNewFile={(dirPath) => newFile(dirPath)}
      onAbout={() => (showAbout = true)}
    />
  {/if}

  <div class="app-main">
    <TabBar onCloseTab={requestClose} onCloseTabs={closeTabs} />

    {#if settings.value.showToolbar && tabs.hasTabs}
      <Toolbar {revision} />
    {/if}

    {#if tabs.hasTabs}
      <Breadcrumbs onRevealHeading={revealHeading} />
    {/if}

    {#each pendingRecovery as draft (draft.docId)}
      <Banner
        tone="info"
        message={`${t('recovery.title')}: ${draft.path ? baseName(draft.path) : t('recovery.untitled')}`}
        actions={[
          { label: t('recovery.restore'), primary: true, onClick: () => void restoreDraft(draft) },
          { label: t('recovery.discard'), onClick: () => discardDraft(draft) }
        ]}
      />
    {/each}

    {#if activeTab?.recovered}
      <Banner
        tone="info"
        message={t('recovery.inTab', {
          time: new Date(activeTab.recovered.savedAtMs).toLocaleString()
        })}
        actions={[
          {
            label: t('recovery.keep'),
            primary: true,
            onClick: () => tabs.acceptRecovered(tabs.activeIndex)
          },
          {
            label: t('recovery.useDisk'),
            onClick: () => tabs.discardRecovered(tabs.activeIndex)
          }
        ]}
      />
    {/if}

    {#if activeTab && activeTab.external === 'modified'}
      <Banner
        message={t('conflict.changed')}
        actions={[
          {
            label: t('conflict.reload'),
            primary: true,
            onClick: () => void tabs.reloadFromDisk(tabs.activeIndex)
          },
          { label: t('conflict.keepMine'), onClick: () => void tabs.keepMine(tabs.activeIndex) }
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
        onToggleSource={toggleSourceMode}
        onGoToHeading={() => (showPalette = true)}
        onActivity={bump}
      />

      {#if booted && !tabs.hasTabs}
        <EmptyState
          recent={settings.value.recentFiles}
          onNewFile={() => newFile()}
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

  {#if workspace.outlineVisible && tabs.hasTabs}
    <OutlinePanel onRevealHeading={revealHeading} />
  {/if}
</div>

{#if showSettings}
  <SettingsModal onClose={() => (showSettings = false)} />
{/if}

{#if showAbout}
  <AboutModal onClose={() => (showAbout = false)} />
{/if}

{#if showPalette}
  <HeadingPalette
    onGo={(pos) => revealHeading(pos)}
    onClose={() => {
      showPalette = false;
      focusEditor();
    }}
  />
{/if}

{#if closeRequest}
  {@const tab = tabs.tabs[closeRequest.index]}
  <Modal
    title={t('save.prompt', { name: tab?.fileName ?? '' })}
    onClose={() => (closeRequest = null)}
  >
    <!-- The title asks the question; the body states what is at stake. -->
    <p class="prompt">{t('save.body')}</p>

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
