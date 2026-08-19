<script lang="ts">
  import { tabs } from '../stores/tabs.svelte';
  import { settings } from '../stores/settings.svelte';
  import { t } from '../stores/i18n';
  import { toggleWrap, insertLink } from '../editor/keymap';
  import {
    formatStateAt,
    insertCodeBlock,
    insertDiagram,
    insertImage,
    insertMath,
    insertRule,
    insertTable,
    setHeading,
    toggleList,
    toggleQuote,
    type FormatState
  } from '../editor/format';

  interface Props {
    /** Bumped by the parent on every edit and cursor move. */
    revision: number;
  }

  const { revision }: Props = $props();

  const state = $derived.by((): FormatState | null => {
    void revision;
    const tab = tabs.active;
    if (!tab) return null;
    const handle = tabs.handleOf(tab.id);
    return handle ? formatStateAt(handle.view.state) : null;
  });

  // Reader mode and a read-only file are different reasons for the same
  // answer: nothing on this bar may change the document.
  const readonly = $derived.by(() => {
    void revision;
    const tab = tabs.active;
    if (!tab) return true;
    if (tab.readonly) return true;
    return tabs.handleOf(tab.id)?.view.state.readOnly ?? false;
  });

  function run(action: (view: import('@codemirror/view').EditorView) => boolean): void {
    const tab = tabs.active;
    if (!tab) return;
    const handle = tabs.handleOf(tab.id);
    if (!handle || handle.view.state.readOnly) return;
    action(handle.view);
    handle.focus();
  }
</script>

{#snippet button(
  label: string,
  shortcut: string,
  active: boolean,
  onRun: () => void,
  icon: import('svelte').Snippet
)}
  <button
    class="tool"
    class:on={active}
    disabled={readonly}
    title={shortcut ? `${label}  ${shortcut}` : label}
    aria-label={label}
    aria-pressed={active}
    onclick={onRun}
  >
    {@render icon()}
  </button>
{/snippet}

<div class="toolbar" role="toolbar" aria-label={t('toolbar.label')}>
  <!-- Headings first: the structural decision comes before the wording. -->
  {#snippet h1Icon()}<span class="glyph">H1</span>{/snippet}
  {#snippet h2Icon()}<span class="glyph">H2</span>{/snippet}
  {#snippet h3Icon()}<span class="glyph">H3</span>{/snippet}
  {@render button(t('toolbar.h1'), 'Ctrl+Alt+1', state?.heading === 1, () => run((v) => setHeading(v, 1)), h1Icon)}
  {@render button(t('toolbar.h2'), 'Ctrl+Alt+2', state?.heading === 2, () => run((v) => setHeading(v, 2)), h2Icon)}
  {@render button(t('toolbar.h3'), 'Ctrl+Alt+3', state?.heading === 3, () => run((v) => setHeading(v, 3)), h3Icon)}

  <span class="divider"></span>

  {#snippet boldIcon()}
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4.5 2.5h4.2a2.75 2.75 0 0 1 0 5.5H4.5zM4.5 8h4.9a2.75 2.75 0 0 1 0 5.5H4.5z" />
    </svg>
  {/snippet}
  {#snippet italicIcon()}
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M10.5 2.75H6.75M9.25 13.25H5.5M9.75 2.75 6.25 13.25" />
    </svg>
  {/snippet}
  {#snippet strikeIcon()}
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2.5 8h11M11.5 4.75C11 3.4 9.7 2.6 8 2.6c-2 0-3.3 1-3.3 2.4 0 1 .7 1.7 2 2.2M4.5 11.2c.6 1.4 1.9 2.2 3.6 2.2 2.1 0 3.4-1 3.4-2.5 0-.8-.4-1.4-1.2-1.9" />
    </svg>
  {/snippet}
  {#snippet codeIcon()}
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M5.75 4.75 2.5 8l3.25 3.25M10.25 4.75 13.5 8l-3.25 3.25" />
    </svg>
  {/snippet}
  {@render button(t('toolbar.bold'), 'Ctrl+B', state?.bold ?? false, () => run((v) => toggleWrap(v, '**')), boldIcon)}
  {@render button(t('toolbar.italic'), 'Ctrl+I', state?.italic ?? false, () => run((v) => toggleWrap(v, '*')), italicIcon)}
  {@render button(t('toolbar.strike'), '', false, () => run((v) => toggleWrap(v, '~~')), strikeIcon)}
  {@render button(t('toolbar.code'), '', state?.code ?? false, () => run((v) => toggleWrap(v, '`')), codeIcon)}

  <span class="divider"></span>

  {#snippet bulletIcon()}
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6 4.25h7.5M6 8h7.5M6 11.75h7.5" />
      <circle cx="3" cy="4.25" r="1.05" fill="currentColor" stroke="none" />
      <circle cx="3" cy="8" r="1.05" fill="currentColor" stroke="none" />
      <circle cx="3" cy="11.75" r="1.05" fill="currentColor" stroke="none" />
    </svg>
  {/snippet}
  {#snippet orderedIcon()}
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6.25 4.25h7.25M6.25 8h7.25M6.25 11.75h7.25M2.1 3.1h.9v2.5M2 11h1.9l-1.9 2.2h1.9" />
    </svg>
  {/snippet}
  {#snippet taskIcon()}
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2" y="2.6" width="4.4" height="4.4" rx="1.1" />
      <rect x="2" y="9" width="4.4" height="4.4" rx="1.1" />
      <path d="M8.6 4.8h5.2M8.6 11.2h5.2M3 4.8l.9.9 1.6-1.7" />
    </svg>
  {/snippet}
  {#snippet quoteIcon()}
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 3.5v9M6.5 5.5h7M6.5 8h7M6.5 10.5h4.5" />
    </svg>
  {/snippet}
  {@render button(t('toolbar.bullet'), '', state?.bullet ?? false, () => run((v) => toggleList(v, 'bullet')), bulletIcon)}
  {@render button(t('toolbar.ordered'), '', state?.ordered ?? false, () => run((v) => toggleList(v, 'ordered')), orderedIcon)}
  {@render button(t('toolbar.task'), '', state?.task ?? false, () => run((v) => toggleList(v, 'task')), taskIcon)}
  {@render button(t('toolbar.quote'), '', state?.quote ?? false, () => run(toggleQuote), quoteIcon)}

  <span class="divider"></span>

  {#snippet linkIcon()}
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6.6 9.4a2.6 2.6 0 0 0 3.7 0l2.2-2.2a2.6 2.6 0 0 0-3.7-3.7l-.9.9M9.4 6.6a2.6 2.6 0 0 0-3.7 0L3.5 8.8a2.6 2.6 0 0 0 3.7 3.7l.9-.9" />
    </svg>
  {/snippet}
  {#snippet imageIcon()}
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2.2" y="3" width="11.6" height="10" rx="1.8" />
      <circle cx="5.9" cy="6.4" r="1.1" />
      <path d="m2.6 11.4 3-2.9 2.6 2.4 2-1.7 3.2 3" />
    </svg>
  {/snippet}
  {#snippet tableIcon()}
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2.2" y="3.2" width="11.6" height="9.6" rx="1.5" />
      <path d="M2.2 6.6h11.6M6.4 6.6v6.2M10.2 6.6v6.2" />
    </svg>
  {/snippet}
  {#snippet blockIcon()}
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2" y="3" width="12" height="10" rx="1.8" />
      <path d="M6.2 6.6 4.6 8l1.6 1.4M9.8 6.6 11.4 8l-1.6 1.4" />
    </svg>
  {/snippet}
  {#snippet ruleIcon()}
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2.2 8h11.6M4.4 4.6h7.2M4.4 11.4h7.2" opacity="0.55" />
    </svg>
  {/snippet}
  {#snippet mathIcon()}
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 3.2h8l-5 4.6 5 5H3M12.8 3.2v9.6" />
    </svg>
  {/snippet}
  {#snippet diagramIcon()}
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <rect x="5.4" y="1.9" width="5.2" height="3.4" rx="1" />
      <rect x="1.7" y="10.7" width="5" height="3.4" rx="1" />
      <rect x="9.3" y="10.7" width="5" height="3.4" rx="1" />
      <path d="M8 5.3v2.6M4.2 10.7V7.9h7.6v2.8" />
    </svg>
  {/snippet}
  {@render button(t('toolbar.link'), 'Ctrl+K', false, () => run(insertLink), linkIcon)}
  {@render button(t('toolbar.image'), '', false, () => run(insertImage), imageIcon)}
  {@render button(t('toolbar.table'), '', false, () => run((v) => insertTable(v)), tableIcon)}
  {@render button(t('toolbar.codeBlock'), '', false, () => run((v) => insertCodeBlock(v)), blockIcon)}
  {@render button(t('toolbar.rule'), '', false, () => run(insertRule), ruleIcon)}
  {@render button(t('toolbar.math'), '', false, () => run(insertMath), mathIcon)}
  {@render button(t('toolbar.diagram'), '', false, () => run(insertDiagram), diagramIcon)}

  <span class="spacer"></span>

  <!-- The way out of live preview, kept visible rather than buried in a menu:
       whenever the rendering is in the way, this is the answer. -->
  <div class="mode" role="group" aria-label={t('toolbar.mode')}>
    <button
      class="mode-btn"
      class:on={settings.value.editorMode === 'live'}
      title={`${t('toolbar.modeLive')}  Ctrl+/`}
      onclick={() => settings.update({ editorMode: 'live' })}
    >
      {t('toolbar.modeLive')}
    </button>
    <button
      class="mode-btn"
      class:on={settings.value.editorMode === 'source'}
      title={`${t('toolbar.modeSource')}  Ctrl+/`}
      onclick={() => settings.update({ editorMode: 'source' })}
    >
      {t('toolbar.modeSource')}
    </button>
  </div>
</div>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    gap: 1px;
    flex-shrink: 0;
    height: 34px;
    padding: 0 var(--sp-2);
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    overflow-x: auto;
    scrollbar-width: none;
    user-select: none;
  }

  .toolbar::-webkit-scrollbar {
    display: none;
  }

  .tool {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    flex-shrink: 0;
    border-radius: var(--radius-s);
    color: var(--fg-muted);
    transition:
      background-color var(--t-fast) var(--ease),
      color var(--t-fast) var(--ease),
      transform var(--t-press) var(--ease-out);
  }

  .tool:active:not(:disabled) {
    transform: scale(0.9);
  }

  .tool:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .tool.on {
    background: var(--accent-soft);
    color: var(--accent);
  }

  .tool :global(svg) {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .glyph {
    font-size: 11px;
    font-weight: 650;
    letter-spacing: -0.02em;
  }

  .divider {
    width: 1px;
    height: 16px;
    margin: 0 var(--sp-2);
    background: var(--border);
    flex-shrink: 0;
  }

  .spacer {
    flex: 1;
    min-width: var(--sp-3);
  }

  .mode {
    display: flex;
    gap: 1px;
    padding: 2px;
    border: 1px solid var(--border);
    border-radius: var(--radius-m);
    flex-shrink: 0;
  }

  .mode-btn {
    padding: 2px 9px;
    border-radius: var(--radius-s);
    font-size: 11px;
    font-weight: 500;
    color: var(--fg-muted);
    white-space: nowrap;
    transition:
      background-color var(--t-fast) var(--ease),
      color var(--t-fast) var(--ease),
      transform var(--t-press) var(--ease-out);
  }

  .mode-btn:active {
    transform: scale(var(--press-scale));
  }

  .mode-btn.on {
    background: var(--accent-soft);
    color: var(--accent);
  }

  @media (hover: hover) and (pointer: fine) {
    .tool:hover:not(:disabled) {
      background: var(--bg-hover);
      color: var(--fg-ui);
    }

    .tool.on:hover {
      color: var(--accent);
    }
  }
</style>
