<script lang="ts">
  import type { Snippet } from 'svelte';
  import { modalIn, modalOut, scrimIn, scrimOut } from '../ui/motion';

  interface Props {
    title: string;
    onClose: () => void;
    children: Snippet;
    footer?: Snippet;
  }

  const { title, onClose, children, footer }: Props = $props();

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    }
  }

  /** Focus the dialog on mount so Escape and Tab behave immediately. */
  function autofocus(node: HTMLElement): void {
    node.focus();
  }
</script>

<svelte:window onkeydown={onKeydown} />

<!-- Click-outside is a pointer convenience; keyboard users close with Escape,
     handled by the window listener above. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="scrim" role="presentation" onclick={onClose} in:scrimIn out:scrimOut>
  <div
    class="modal"
    role="dialog"
    aria-modal="true"
    aria-label={title}
    tabindex="-1"
    use:autofocus
    onclick={(e) => e.stopPropagation()}
    in:modalIn
    out:modalOut
  >
    <header>
      <h2>{title}</h2>
      <button class="icon-btn" aria-label="Close" onclick={onClose}>
        <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true">
          <path
            d="M3.5 3.5l7 7M10.5 3.5l-7 7"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          />
        </svg>
      </button>
    </header>

    <div class="body">
      {@render children()}
    </div>

    {#if footer}
      <footer>{@render footer()}</footer>
    {/if}
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--sp-5);
    background: var(--scrim);
    backdrop-filter: blur(3px);
  }

  .modal {
    width: min(460px, 100%);
    max-height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: var(--radius-l);
    box-shadow: var(--shadow-panel);
    outline: none;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--sp-3) var(--sp-4);
    border-bottom: 1px solid var(--border);
  }

  h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--fg-ui);
  }

  .body {
    padding: var(--sp-4);
    overflow-y: auto;
  }

  footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--sp-2);
    padding: var(--sp-3) var(--sp-4);
    border-top: 1px solid var(--border);
  }
</style>
