<script lang="ts">
  import Modal from './Modal.svelte';
  import { settings } from '../stores/settings.svelte';
  import { t } from '../stores/i18n';
  import type { LangSetting, ThemeSetting } from '../ipc/types';

  interface Props {
    onClose: () => void;
  }

  const { onClose }: Props = $props();

  const themes: { value: ThemeSetting; labelKey: string }[] = [
    { value: 'light', labelKey: 'settings.themeLight' },
    { value: 'dark', labelKey: 'settings.themeDark' },
    { value: 'system', labelKey: 'settings.themeSystem' }
  ];

  const langs: { value: LangSetting; label: string }[] = [
    { value: 'system', label: 'System' },
    { value: 'en', label: 'English' },
    { value: 'ru', label: 'Русский' }
  ];
</script>

<Modal title={t('settings.title')} {onClose}>
  <div class="rows">
    <div class="row">
      <span class="label">{t('settings.theme')}</span>
      <div class="segment">
        {#each themes as option (option.value)}
          <button
            class="seg"
            class:on={settings.value.theme === option.value}
            onclick={() => settings.update({ theme: option.value })}
          >
            {t(option.labelKey)}
          </button>
        {/each}
      </div>
    </div>

    <div class="row">
      <span class="label">{t('settings.language')}</span>
      <select
        value={settings.value.uiLang}
        onchange={(e) => settings.update({ uiLang: e.currentTarget.value as LangSetting })}
      >
        {#each langs as option (option.value)}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
    </div>

    <div class="row">
      <span class="label">{t('settings.fontSize')}</span>
      <div class="stepper">
        <input
          type="range"
          min="12"
          max="24"
          step="1"
          value={settings.value.editorFontSize}
          oninput={(e) => settings.update({ editorFontSize: Number(e.currentTarget.value) })}
        />
        <span class="value">{settings.value.editorFontSize}px</span>
      </div>
    </div>

    <div class="row">
      <span class="label">{t('settings.maxWidth')}</span>
      <div class="stepper">
        <input
          type="range"
          min="560"
          max="1100"
          step="20"
          value={settings.value.editorMaxWidth}
          oninput={(e) => settings.update({ editorMaxWidth: Number(e.currentTarget.value) })}
        />
        <span class="value">{settings.value.editorMaxWidth}px</span>
      </div>
    </div>

    <div class="row">
      <span class="label">{t('settings.autosave')}</span>
      <input
        class="num"
        type="number"
        min="0"
        max="10000"
        step="100"
        value={settings.value.autosaveDraftMs}
        onchange={(e) => settings.update({ autosaveDraftMs: Number(e.currentTarget.value) })}
      />
    </div>

    <label class="row check">
      <span class="label">{t('settings.restoreSession')}</span>
      <input
        type="checkbox"
        checked={settings.value.restoreSession}
        onchange={(e) => settings.update({ restoreSession: e.currentTarget.checked })}
      />
    </label>

    <label class="row check">
      <span class="label">{t('settings.showStatus')}</span>
      <input
        type="checkbox"
        checked={settings.value.showStatusStrip}
        onchange={(e) => settings.update({ showStatusStrip: e.currentTarget.checked })}
      />
    </label>
  </div>
</Modal>

<style>
  .rows {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-4);
  }

  .row.check {
    cursor: pointer;
  }

  .label {
    font-size: 13px;
    color: var(--fg-ui);
  }

  .segment {
    display: flex;
    gap: 2px;
    padding: 2px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-m);
  }

  .seg {
    padding: 3px 10px;
    border-radius: var(--radius-s);
    font-size: 12px;
    color: var(--fg-muted);
    transition:
      background-color var(--t-fast) var(--ease),
      color var(--t-fast) var(--ease);
  }

  .seg:hover {
    background: var(--bg-hover);
  }

  .seg.on {
    background: var(--accent-soft);
    color: var(--accent);
  }

  select,
  .num {
    padding: 4px 8px;
    min-width: 120px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-s);
    color: var(--fg-ui);
    font-family: var(--font-ui);
    font-size: 13px;
  }

  .stepper {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .value {
    min-width: 48px;
    text-align: right;
    font-size: 12px;
    color: var(--fg-muted);
  }

  input[type='range'] {
    width: 150px;
    accent-color: var(--accent);
  }

  input[type='checkbox'] {
    width: 16px;
    height: 16px;
    accent-color: var(--accent);
  }
</style>
