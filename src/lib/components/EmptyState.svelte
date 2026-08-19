<script lang="ts">
  import { t } from '../stores/i18n';

  interface Props {
    recent?: string[];
    onOpenFile?: () => void;
    onOpenFolder?: () => void;
    onOpenRecent?: (path: string) => void;
  }

  const { recent = [], onOpenFile, onOpenFolder, onOpenRecent }: Props = $props();

  function baseName(p: string): string {
    const parts = p.split(/[\\/]/);
    return parts[parts.length - 1] ?? p;
  }
</script>

<div class="empty stagger">
  <svg class="glyph" viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <rect x="9" y="5" width="30" height="38" rx="4" stroke="currentColor" stroke-width="2" />
    <path
      d="M16 17h11M16 24h16M16 31h8"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
    />
  </svg>

  <h1>{t('empty.title')}</h1>
  <p>{t('empty.hint')}</p>

  <div class="actions">
    <button class="btn btn-primary" onclick={() => onOpenFile?.()}>{t('empty.openFile')}</button>
    <button class="btn" onclick={() => onOpenFolder?.()}>{t('empty.openFolder')}</button>
  </div>

  {#if recent.length > 0}
    <div class="recent">
      <div class="recent-title">{t('empty.recent')}</div>
      {#each recent.slice(0, 5) as path (path)}
        <button class="recent-item" onclick={() => onOpenRecent?.(path)} title={path}>
          <span class="recent-name">{baseName(path)}</span>
          <span class="recent-path">{path}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .empty {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--sp-3);
    padding: var(--sp-6);
    user-select: none;
  }

  .glyph {
    width: 56px;
    height: 56px;
    color: var(--fg-faint);
    opacity: 0.7;
    margin-bottom: var(--sp-2);
  }

  h1 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    color: var(--fg-ui);
  }

  p {
    margin: 0;
    font-size: 13px;
    color: var(--fg-muted);
  }

  .actions {
    display: flex;
    gap: var(--sp-2);
    margin-top: var(--sp-3);
  }

  .recent {
    margin-top: var(--sp-6);
    width: min(420px, 100%);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .recent-title {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--fg-faint);
    padding: 0 var(--sp-2) var(--sp-1);
  }

  .recent-item {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1px;
    padding: var(--sp-2) var(--sp-2);
    border-radius: var(--radius-s);
    text-align: left;
    transition:
      background-color var(--t-fast) var(--ease),
      transform var(--t-press) var(--ease-out);
  }

  .recent-item:active {
    transform: scale(0.99);
  }

  @media (hover: hover) and (pointer: fine) {
    .recent-item:hover {
      background: var(--bg-hover);
    }
  }

  .recent-name {
    font-size: 13px;
    color: var(--fg-ui);
  }

  .recent-path {
    font-size: 11px;
    color: var(--fg-faint);
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    direction: rtl;
  }
</style>
