<script lang="ts">
  /**
   * The document, rendered, beside the document being written.
   *
   * ADR-005: a page rather than a second editor. It is produced by the same
   * renderer as the export, which makes it the strongest check the program
   * has on itself — what stands on the right is what the reader will send
   * someone, and a disagreement between the two is visible immediately rather
   * than after the file has been mailed.
   *
   * It lives in a shadow root. The export stylesheet is written against plain
   * elements — `h1`, `p`, `table` — and injected into the page it would style
   * the application itself. Custom properties cross a shadow boundary, so the
   * page still follows the reader's theme, including a theme of their own.
   */
  import { tabs } from '../stores/tabs.svelte';
  import { workspace } from '../stores/workspace.svelte';
  import { EXPORT_CSS } from '../export/exportCss';
  import { shadowCss, SHADOW_BODY_CLASS } from '../export/shadowCss';
  import { renderDocumentHtml } from '../export/renderHtml';
  import { mathRenderer, renderDiagrams } from '../export/standalone';
  import { resolveImageSrc } from '../editor/livePreview/widgets';
  import { t } from '../stores/i18n';

  /** How long after the last keystroke the page is rebuilt. */
  const SETTLE_MS = 250;

  let host = $state<HTMLElement | null>(null);
  let shadow: ShadowRoot | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let generation = 0;

  const SHADOW_CSS = shadowCss(EXPORT_CSS);

  const shown = $derived(tabs.tabs[tabs.activeIndexIn(tabs.focusedPane)] ?? null);
  /** Bumped by the editor on every edit, so this knows to rebuild. */
  const revision = $derived(workspace.previewRevision);

  function mount(node: HTMLElement): void {
    host = node;
    shadow = node.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>${SHADOW_CSS}</style><div class="${SHADOW_BODY_CLASS}"><div class="page"></div></div>`;
  }

  $effect(() => {
    void shown?.id;
    void revision;
    void host;

    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void rebuild(), SETTLE_MS);
    return () => {
      if (timer) clearTimeout(timer);
    };
  });

  async function rebuild(): Promise<void> {
    const page = shadow?.querySelector('.page');
    if (!page) return;

    const tab = shown;
    const handle = tab ? tabs.handleOf(tab.id) : null;
    if (!tab || !handle) {
      page.innerHTML = `<p class="empty">${t('preview.nothing')}</p>`;
      return;
    }

    // A rebuild that started before this one must not land after it.
    const mine = ++generation;
    const state = handle.view.state;
    const [math, diagrams] = await Promise.all([mathRenderer(), renderDiagrams(state)]);
    if (mine !== generation) return;

    page.innerHTML = renderDocumentHtml(state, {
      math,
      diagram: (_source, index) => diagrams[index] ?? null,
      image: (url) => resolveImageSrc(url, tab.dirPath)
    });
    syncScroll();
  }

  /**
   * Keep the page at the section the writer is in.
   *
   * By heading rather than by pixels: the two sides are different heights by
   * nature — eight lines of table source on the left are one grid on the
   * right — so a proportional scroll drifts further the longer the document.
   * The section the reader is in is already worked out for the outline panel,
   * and it is the same answer to the same question.
   */
  function syncScroll(): void {
    const at = workspace.activeOutline;
    if (!shadow || at < 0) return;

    const headings = shadow.querySelectorAll('h1, h2, h3, h4, h5, h6');
    const target = headings[at];
    if (target instanceof HTMLElement) {
      target.scrollIntoView({ block: 'start' });
    } else if (at === 0) {
      host?.scrollTo({ top: 0 });
    }
  }

  $effect(() => {
    void workspace.activeOutline;
    syncScroll();
  });
</script>

<!--
  A strip of its own, the height of the tab strip beside it: without one the
  page began a line and a half above the text it mirrors, and two halves of the
  same document starting at two different heights read as a mistake.
-->
<div class="preview-head">
  <span class="preview-name">{shown?.fileName ?? ''}</span>
  <span class="preview-tag">{t('preview.tag')}</span>
</div>

<div class="preview" use:mount aria-label={t('preview.title')} role="document"></div>

<style>
  .preview-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2);
    flex-shrink: 0;
    height: var(--tabbar-height);
    padding: 0 var(--sp-3);
    background: var(--bg-app);
    border-bottom: 1px solid var(--border);
    color: var(--fg-muted);
    font-size: 12.5px;
    user-select: none;
  }

  .preview-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Quieter than the file name: which half this is, not what is in it. */
  .preview-tag {
    flex-shrink: 0;
    color: var(--fg-faint);
    font-size: 11.5px;
    letter-spacing: 0.02em;
  }

  .preview {
    flex: 1;
    min-height: 0;
    overflow: auto;
    background: var(--bg);
  }
</style>
