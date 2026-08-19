import { mount } from 'svelte';
import './styles/tokens.css';
import './styles/themes/dark.css';
import './styles/base.css';
import './styles/markdown.css';
import App from './App.svelte';
import { settings } from './lib/stores/settings.svelte';

async function bootstrap(): Promise<void> {
  // Settings first: theme and typography must be right before the first frame.
  await settings.load();

  mount(App, { target: document.getElementById('app')! });
}

bootstrap().catch((e) => {
  console.error('bootstrap failed', e);
});
