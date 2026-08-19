import { pluginsLoad } from '../ipc/commands';
import { pluginHost, type LoadedPlugin } from './host';
import type { FormatContext, FormatResult } from '../format/types';

/**
 * Which plugins are installed, which are on, and what they can format.
 *
 * Installing a plugin is putting a folder somewhere; enabling it is a
 * separate, deliberate act. Nothing here runs a line of anyone's code until
 * the second one has happened — see ADR-004.
 */
class PluginRegistry {
  installed = $state<LoadedPlugin[]>([]);
  enabled = $state<string[]>([]);
  /** Plugins that would not load, by id, with the reason to show. */
  failures = $state<Record<string, string>>({});
  loaded = $state(false);

  /** Read the folder and start whichever plugins the reader has turned on. */
  async load(enabledIds: string[]): Promise<void> {
    this.enabled = [...enabledIds];
    try {
      this.installed = await pluginsLoad();
    } catch (error) {
      console.warn('plugins could not be read', error);
      this.installed = [];
    }
    this.loaded = true;
    this.startEnabled();
  }

  /** Turn one on or off, and reflect that in the sandbox immediately. */
  setEnabled(id: string, on: boolean): string[] {
    this.enabled = on ? [...new Set([...this.enabled, id])] : this.enabled.filter((x) => x !== id);
    // Rebuilt rather than patched: turning a plugin off must actually remove
    // its code from the worker, not merely stop calling it.
    pluginHost.reset();
    this.startEnabled();
    return [...this.enabled];
  }

  private startEnabled(): void {
    const failures: Record<string, string> = {};
    for (const plugin of this.installed) {
      if (!this.enabled.includes(plugin.manifest.id)) continue;
      pluginHost.load(plugin);
    }
    this.failures = failures;
  }

  /** The enabled plugins that offer themselves for this extension. */
  formattersFor(ext: string): LoadedPlugin[] {
    const lower = ext.toLowerCase().replace(/^\./, '');
    return this.installed.filter(
      (p) =>
        this.enabled.includes(p.manifest.id) &&
        (p.manifest.extensions.length === 0 || p.manifest.extensions.includes(lower))
    );
  }

  /** Run one, and record why if it had nothing to give. */
  async format(
    plugin: LoadedPlugin,
    text: string,
    context: FormatContext
  ): Promise<FormatResult | null> {
    const result = await pluginHost.format(plugin.manifest.id, text, context);
    const failure = pluginHost.failures.get(plugin.manifest.id);
    if (failure) this.failures = { ...this.failures, [plugin.manifest.id]: failure };
    if (!result || result.text === text) return null;
    return result;
  }
}

export const plugins = new PluginRegistry();
