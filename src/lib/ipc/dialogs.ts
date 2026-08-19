/**
 * File dialogs. These run through the dialog plugin's own JS API rather than
 * a custom Rust command — the plugin already owns the native picker, and
 * wrapping it again would only add a hop. Contract note: docs/design/IPC-CONTRACT.md §2.
 */
import { open, save } from '@tauri-apps/plugin-dialog';

const MARKDOWN_FILTER = {
  name: 'Markdown',
  extensions: ['md', 'markdown', 'mdown', 'mkd', 'txt']
};

export async function pickFile(defaultDir?: string | null): Promise<string | null> {
  const picked = await open({
    multiple: false,
    directory: false,
    filters: [MARKDOWN_FILTER],
    ...(defaultDir ? { defaultPath: defaultDir } : {})
  });
  return typeof picked === 'string' ? picked : null;
}

/** A theme is one CSS file — the contract is in docs/themes.md. */
export async function pickThemeFile(defaultDir?: string | null): Promise<string | null> {
  const picked = await open({
    multiple: false,
    directory: false,
    filters: [{ name: 'CSS theme', extensions: ['css'] }],
    ...(defaultDir ? { defaultPath: defaultDir } : {})
  });
  return typeof picked === 'string' ? picked : null;
}

export async function pickFolder(defaultDir?: string | null): Promise<string | null> {
  const picked = await open({
    multiple: false,
    directory: true,
    ...(defaultDir ? { defaultPath: defaultDir } : {})
  });
  return typeof picked === 'string' ? picked : null;
}

export async function pickSaveTarget(
  suggestedName: string,
  defaultDir?: string | null
): Promise<string | null> {
  const picked = await save({
    filters: [MARKDOWN_FILTER],
    defaultPath: defaultDir ? `${defaultDir}/${suggestedName}` : suggestedName
  });
  return picked ?? null;
}
