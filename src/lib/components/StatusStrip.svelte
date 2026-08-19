<script lang="ts">
  import { tabs } from '../stores/tabs.svelte';
  import { t } from '../stores/i18n';

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
      encoding: tab.encoding.toUpperCase(),
      eol: tab.eol.toUpperCase(),
      readonly: tab.readonly
    };
  });
</script>

{#if info}
  <div class="strip">
    <span class="path" title={info.path}>{info.path}</span>

    <span class="spacer"></span>

    {#if info.readonly}
      <span class="badge">{t('status.readonly')}</span>
    {/if}
    <span>{info.words} {t('status.words')}</span>
    <span>{info.chars} {t('status.chars')}</span>
    <span>{t('status.line')} {info.line}, {t('status.col')} {info.col}</span>
    <span>{info.encoding}</span>
    <span>{info.eol}</span>
  </div>
{/if}

<style>
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
</style>
