import type { FormatContext, FormatResult } from '../format/types';

/**
 * The application's side of the plugin sandbox.
 *
 * One worker holds every enabled plugin. It is created the first time a
 * plugin is loaded and destroyed when the last one is turned off, so a reader
 * with no plugins never pays for the machinery — no worker, no blob, nothing.
 */
export interface PluginManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  entry: string;
  extensions: string[];
}

export interface LoadedPlugin {
  manifest: PluginManifest;
  source: string;
  dir: string;
}

/**
 * How long a plugin gets before it is assumed to be stuck.
 *
 * Generous for a text transform on a document a person is reading, and short
 * enough that a runaway plugin is a message rather than a frozen window.
 */
const TIMEOUT_MS = 2000;

type Pending = { resolve: (value: FormatResult | null) => void; timer: number };

class PluginHost {
  private worker: Worker | null = null;
  private nextCall = 1;
  private pending = new Map<number, Pending>();
  private ready = new Map<string, boolean>();

  /** Plugins that failed to load or timed out, with the reason. */
  failures = new Map<string, string>();

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;

    const worker = new Worker(new URL('./pluginWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent) => {
      const data = event.data as {
        type: string;
        id?: string;
        callId?: number;
        result?: FormatResult | null;
        error?: string;
      };

      if (data.type === 'loaded' && data.id) this.ready.set(data.id, true);
      if (data.type === 'failed' && data.id) {
        this.ready.set(data.id, false);
        this.failures.set(data.id, data.error ?? 'failed to load');
      }
      if (data.type === 'result' && typeof data.callId === 'number') {
        const pending = this.pending.get(data.callId);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(data.callId);
        pending.resolve(data.result ?? null);
      }
    };
    worker.onerror = (event) => {
      // The worker itself died; everything waiting on it gets an answer
      // rather than hanging, and the next call starts a fresh one.
      console.warn('plugin worker error', event.message);
      this.reset(`the plugin worker stopped: ${event.message}`);
    };

    this.worker = worker;
    return worker;
  }

  /** Hand a plugin's source to the sandbox. */
  load(plugin: LoadedPlugin): void {
    this.failures.delete(plugin.manifest.id);
    this.ensureWorker().postMessage({
      type: 'load',
      id: plugin.manifest.id,
      source: plugin.source
    });
  }

  /** Forget every plugin and stop the worker. */
  reset(reason?: string): void {
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.resolve(null);
    }
    this.pending.clear();
    this.ready.clear();
    if (reason) this.failures.set('*', reason);
    this.worker?.terminate();
    this.worker = null;
  }

  /**
   * Ask a plugin to format. Resolves to null when it declines, fails, or runs
   * out of time — in every one of those cases the document is left alone.
   */
  format(id: string, text: string, context: FormatContext): Promise<FormatResult | null> {
    if (!this.worker) return Promise.resolve(null);

    const callId = this.nextCall++;
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(callId);
        this.failures.set(id, `took longer than ${TIMEOUT_MS}ms and was stopped`);
        // A plugin that will not come back is not asked again this session:
        // the worker holding it is destroyed, taking the loop with it.
        this.reset();
        resolve(null);
      }, TIMEOUT_MS);

      this.pending.set(callId, { resolve, timer });
      this.worker?.postMessage({ type: 'format', id, callId, text, context });
    });
  }
}

export const pluginHost = new PluginHost();
