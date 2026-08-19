/// <reference lib="webworker" />
/**
 * Where plugin code runs — and the only place it runs.
 *
 * There is no DOM here, no Tauri IPC (`window.__TAURI__` does not cross into a
 * worker), and no way out to the network (the app's connect-src is `ipc:`
 * alone). A plugin gets the text of a document and hands text back. That is
 * the entire surface, by construction rather than by promise. See ADR-004.
 *
 * The host kills this worker if a call takes too long, so nothing here needs
 * to defend against a plugin that loops forever.
 */

interface FormatContext {
  fileName: string;
  ext: string;
  selection: { from: number; to: number } | null;
  indent: number;
}

interface PluginModule {
  format?: (text: string, context: FormatContext) => unknown;
}

const loaded = new Map<string, PluginModule>();

type Incoming =
  | { type: 'load'; id: string; source: string }
  | { type: 'format'; id: string; callId: number; text: string; context: FormatContext };

self.onmessage = async (event: MessageEvent<Incoming>) => {
  const message = event.data;

  if (message.type === 'load') {
    try {
      // A blob module rather than eval: the CSP allows `blob:` for scripts
      // precisely so that this one line can exist, and nothing wider had to
      // be opened for it.
      const url = URL.createObjectURL(new Blob([message.source], { type: 'text/javascript' }));
      try {
        const module = (await import(/* @vite-ignore */ url)) as PluginModule;
        if (typeof module.format !== 'function') {
          throw new Error('the plugin exports no format function');
        }
        loaded.set(message.id, module);
        self.postMessage({ type: 'loaded', id: message.id });
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      self.postMessage({ type: 'failed', id: message.id, error: String(error) });
    }
    return;
  }

  if (message.type === 'format') {
    const module = loaded.get(message.id);
    if (!module?.format) {
      self.postMessage({ type: 'result', callId: message.callId, result: null });
      return;
    }
    try {
      const raw = await module.format(message.text, message.context);
      self.postMessage({ type: 'result', callId: message.callId, result: normalise(raw) });
    } catch (error) {
      // A plugin that throws has declined, loudly. The document is untouched.
      self.postMessage({
        type: 'result',
        callId: message.callId,
        result: null,
        error: String(error)
      });
    }
  }
};

/**
 * Accept either shape a plugin might return — a string, or `{ text, note }` —
 * and refuse anything else. Whatever comes back is about to replace somebody's
 * document, so it is checked rather than trusted.
 */
function normalise(raw: unknown): { text: string; note?: string } | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string') return { text: raw };
  if (typeof raw === 'object' && typeof (raw as { text?: unknown }).text === 'string') {
    const value = raw as { text: string; note?: unknown };
    return typeof value.note === 'string'
      ? { text: value.text, note: value.note }
      : { text: value.text };
  }
  return null;
}
