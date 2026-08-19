<script lang="ts">
  import { tabs } from '../stores/tabs.svelte';
  import { settings } from '../stores/settings.svelte';
  import { t } from '../stores/i18n';
  import { DEFAULT_ZOOM, zoomLabel } from '../ui/zoom';
  import { languageLabel } from '../editor/language';

  interface Props {
    /** Bumped by the parent whenever the document or cursor changes. */
    revision: number;
  }

  const { revision }: Props = $props();

  const info = $derived.by(() => {
    void revision; // recompute on every edit / cursor move
    const tab = tabs.active;
    if (!tab) return null;
    const handle = tabs.handleOf(tab.id);
    if (!handle) return null;

    const cursor = handle.getCursor();
    const stats = handle.getStats();
    return {
      path: tab.path ?? tab.fileName,
      words: stats.words,
      chars: stats.chars,
      line: cursor.line,
      col: cursor.col,
      language: languageLabel(tab.fileName),
      encoding: tab.encoding.toUpperCase(),
      eol: tab.eol.toUpperCase(),
      mixedEol: tab.mixedEol,
      readonly: tab.readonly,
      reader: handle.isReaderMode(),
      // Past a certain size the editor stops looking for tables, formulas and
      // diagrams — they stay as their source. Saying so is the difference
      // between a known limit and a renderer that looks broken.
      plainBlocks: !handle.rendersBlocks()
    };
  });
</script>

{#if info}
  <div class="strip">
    <span class="path" title={info.path}>{info.path}</span>

    <span class="spacer"></span>

    {#if info.reader}
      <span class="badge accent">{t('status.reader')}</span>
    {/if}
    {#if info.readonly}
      <span class="badge">{t('status.readonly')}</span>
    {/if}
    {#if info.plainBlocks}
      <span class="badge" title={t('status.plainBlocksHint')}>{t('status.plainBlocks')}</span>
    {/if}
    <span>{info.words} {t('status.words')}</span>
    <span>{info.chars} {t('status.chars')}</span>
    <span>{t('status.line')} {info.line}, {t('status.col')} {info.col}</span>
    <!-- Only when it is not 100%: a reader who has not zoomed does not need
         to be told they have not zoomed, and one who has needs to know why
         everything is suddenly large. Click it to go back. -->
    {#if settings.value.zoom !== DEFAULT_ZOOM}
      <button class="zoom" onclick={() => settings.stepZoom(null)} title={t('status.zoomReset')}>
        {zoomLabel(settings.value.zoom)}
      </button>
    {/if}
    <span>{info.language}</span>
    <span>{info.encoding}</span>
    <span title={info.mixedEol ? t('status.mixedEolHint') : undefined}>
      {info.eol}{info.mixedEol ? ` ${t('status.mixed')}` : ''}
    </span>
  </div>
{/if}

<style>
  .zoom {
    color: var(--fg-muted);
    font: inherit;
    padding: 0 4px;
    border-radius: var(--radius-s);
    transition: background-color var(--t-fast) var(--ease);
  }

  @media (hover: hover) and (pointer: fine) {
    .zoom:hover {
      background: var(--bg-hover);
      color: var(--fg-ui);
    }
  }

  .strip {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    height: var(--statusstrip-height);
    flex-shrink: 0;
    padding: 0 var(--sp-3);
    background: var(--bg-app);
    border-top: 1px solid var(--border);
    color: var(--fg-faint);
    font-size: 11.5px;
    user-select: none;
    white-space: nowrap;
  }

  .path {
    overflow: hidden;
    text-overflow: ellipsis;
    direction: rtl;
    text-align: left;
    max-width: 45%;
  }

  .spacer {
    flex: 1;
  }

  .badge {
    padding: 1px 6px;
    border: 1px solid var(--border);
    border-radius: var(--radius-s);
    color: var(--warning);
  }

  .badge.accent {
    color: var(--accent);
    border-color: var(--accent-soft);
  }
</style>
