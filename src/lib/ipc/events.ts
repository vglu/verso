/**
 * Typed wrappers around Tauri events (Rust → TS).
 * Contract: docs/design/IPC-CONTRACT.md §3.
 */
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { FsChangedPayload, MenuActionPayload, OpenFilePayload } from './types';

export const onOpenFile = (handler: (p: OpenFilePayload) => void): Promise<UnlistenFn> =>
  listen<OpenFilePayload>('open-file', (e) => handler(e.payload));

export const onFsChanged = (handler: (p: FsChangedPayload) => void): Promise<UnlistenFn> =>
  listen<FsChangedPayload>('fs:changed', (e) => handler(e.payload));

export const onMenuAction = (handler: (p: MenuActionPayload) => void): Promise<UnlistenFn> =>
  listen<MenuActionPayload>('menu:action', (e) => handler(e.payload));
