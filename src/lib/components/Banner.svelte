<script lang="ts">
  import type { Snippet } from 'svelte';
  import { bannerIn, bannerOut } from '../ui/motion';

  interface Action {
    label: string;
    primary?: boolean;
    onClick: () => void;
  }

  interface Props {
    tone?: 'warning' | 'info';
    message: string;
    actions?: Action[];
    onDismiss?: () => void;
    children?: Snippet;
  }

  const { tone = 'warning', message, actions = [], onDismiss }: Props = $props();
</script>

<div class="banner" class:info={tone === 'info'} role="status" in:bannerIn out:bannerOut>
  <span class="msg">{message}</span>

  <div class="actions">
    {#each actions as action (action.label)}
      <button class="act" class:primary={action.primary} onclick={action.onClick}>
        {action.label}
      </button>
    {/each}

    {#if onDismiss}
      <button class="dismiss" aria-label="Dismiss" onclick={onDismiss}>
        <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
          <path
            d="M3 3l6 6M9 3l-6 6"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          />
        </svg>
      </button>
    {/if}
  </div>
</div>

<style>
  .banner {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-2) var(--sp-3);
    background: var(--bg-panel);
    border-bottom: 1px solid var(--border);
    border-left: 3px solid var(--warning);
    font-size: 13px;
    color: var(--fg-ui);
  }

  .banner.info {
    border-left-color: var(--accent);
  }

  .msg {
    flex: 1;
    min-width: 0;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .act {
    padding: 3px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-s);
    background: var(--bg);
    font-size: 12px;
    color: var(--fg-ui);
    transition:
      background-color var(--t-fast) var(--ease),
      transform var(--t-press) var(--ease-out);
  }

  .act:active {
    transform: scale(var(--press-scale));
  }

  .act.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }

  .dismiss {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: var(--radius-s);
    color: var(--fg-faint);
    transition:
      background-color var(--t-fast) var(--ease),
      color var(--t-fast) var(--ease),
      transform var(--t-press) var(--ease-out);
  }

  .dismiss:active {
    transform: scale(0.9);
  }

  @media (hover: hover) and (pointer: fine) {
    .act:hover {
      background: var(--bg-hover);
    }

    .act.primary:hover {
      background: var(--accent-hover);
    }

    .dismiss:hover {
      background: var(--bg-hover);
      color: var(--fg-ui);
    }
  }
</style>
