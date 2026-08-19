<script lang="ts">
  import Modal from './Modal.svelte';
  import BrandMark from './BrandMark.svelte';
  import { t } from '../stores/i18n';
  import { openExternal } from '../ipc/commands';
  import {
    APP_AUTHOR,
    APP_LICENSE,
    APP_NAME,
    APP_OWNER_EMAIL,
    APP_OWNER_URL,
    APP_SUBTITLE,
    copyrightLine,
    loadVersion
  } from '../ui/product';

  interface Props {
    onClose: () => void;
  }

  const { onClose }: Props = $props();

  let version = $state('…');
  let copied = $state(false);
  let copyTimer: ReturnType<typeof setTimeout> | null = null;

  void loadVersion().then((v) => (version = v));

  function open(url: string): void {
    void openExternal(url).catch((e) => console.warn('could not open', url, e));
  }

  /**
   * Copying is the action people actually want from an address in a desktop
   * app — the mail client is one click further away than the clipboard.
   */
  async function copyEmail(): Promise<void> {
    try {
      await navigator.clipboard.writeText(APP_OWNER_EMAIL);
      copied = true;
      if (copyTimer) clearTimeout(copyTimer);
      copyTimer = setTimeout(() => (copied = false), 1600);
    } catch {
      open(`mailto:${APP_OWNER_EMAIL}`);
    }
  }
</script>

<Modal title={t('about.title')} {onClose}>
  <div class="about">
    <div class="identity">
      <span class="badge"><BrandMark size={30} /></span>
      <div class="names">
        <div class="product">{APP_NAME}</div>
        <div class="subtitle">{APP_SUBTITLE}</div>
      </div>
      <span class="version" title={t('about.versionHint')}>{version}</span>
    </div>

    <p class="tagline">{t('about.tagline')}</p>

    <div class="owner">
      <div class="owner-label">{t('about.owner')}</div>

      <button class="row" onclick={() => open(APP_OWNER_URL)}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="6.25" stroke="currentColor" stroke-width="1.3" fill="none" />
          <path
            d="M1.75 8h12.5M8 1.75c1.8 2 1.8 10.5 0 12.5M8 1.75c-1.8 2-1.8 10.5 0 12.5"
            stroke="currentColor"
            stroke-width="1.3"
            fill="none"
          />
        </svg>
        <span class="value">{APP_AUTHOR}</span>
        <span class="hint">{APP_OWNER_URL.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span>
      </button>

      <button class="row" onclick={() => void copyEmail()}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <rect
            x="1.75"
            y="3.25"
            width="12.5"
            height="9.5"
            rx="1.75"
            stroke="currentColor"
            stroke-width="1.3"
            fill="none"
          />
          <path
            d="M2.5 4.5 8 8.75l5.5-4.25"
            stroke="currentColor"
            stroke-width="1.3"
            fill="none"
            stroke-linecap="round"
          />
        </svg>
        <span class="value">{APP_OWNER_EMAIL}</span>
        <span class="hint">{copied ? t('about.copied') : t('about.copy')}</span>
      </button>
    </div>

    <div class="legal">
      <span>{copyrightLine()}</span>
      <span class="dot">·</span>
      <span>{t('about.license', { license: APP_LICENSE })}</span>
    </div>
  </div>
</Modal>

<style>
  .about {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
  }

  .identity {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
  }

  .badge {
    display: grid;
    place-items: center;
    width: 46px;
    height: 46px;
    border-radius: var(--radius-m);
    background: var(--accent-soft);
    color: var(--accent);
    flex-shrink: 0;
  }

  .names {
    flex: 1;
    min-width: 0;
  }

  .product {
    font-size: 16px;
    font-weight: 650;
    color: var(--fg-ui);
    line-height: 1.2;
  }

  .subtitle {
    margin-top: 1px;
    font-size: 12px;
    color: var(--fg-muted);
  }

  .version {
    padding: 2px 8px;
    border: 1px solid var(--border);
    border-radius: 999px;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--fg-muted);
    cursor: help;
    flex-shrink: 0;
  }

  .tagline {
    margin: 0;
    font-size: 13px;
    line-height: 1.55;
    color: var(--fg-muted);
  }

  .owner {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-top: var(--sp-3);
    border-top: 1px solid var(--border);
  }

  .owner-label {
    padding: 0 var(--sp-2) var(--sp-1);
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--fg-faint);
  }

  .row {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    width: 100%;
    padding: var(--sp-2);
    border-radius: var(--radius-s);
    text-align: left;
    color: var(--fg-ui);
    transition:
      background-color var(--t-fast) var(--ease),
      transform var(--t-press) var(--ease-out);
  }

  .row:active {
    transform: scale(0.99);
  }

  .row svg {
    width: 15px;
    height: 15px;
    flex-shrink: 0;
    color: var(--fg-faint);
  }

  .value {
    flex: 1;
    min-width: 0;
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* The affordance stays quiet until the row is hovered, then names itself. */
  .hint {
    font-size: 11px;
    color: var(--fg-faint);
    opacity: 0;
    transition: opacity var(--t-fast) var(--ease);
    flex-shrink: 0;
  }

  @media (hover: hover) and (pointer: fine) {
    .row:hover {
      background: var(--bg-hover);
    }

    .row:hover .hint {
      opacity: 1;
    }

    .row:hover svg {
      color: var(--accent);
    }
  }

  .row:focus-visible .hint {
    opacity: 1;
  }

  .legal {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-2);
    padding-top: var(--sp-3);
    border-top: 1px solid var(--border);
    font-size: 11.5px;
    color: var(--fg-faint);
  }

  .dot {
    opacity: 0.6;
  }
</style>
