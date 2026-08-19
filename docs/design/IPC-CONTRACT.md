# MDViewer — IPC-контракт Rust ↔ TS (MVP)

> Единственный источник истины для команд и событий. Любое изменение контракта — сначала правка этого файла, потом код. TS-типы лежат в `src/lib/ipc/types.ts` и обязаны быть зеркалом Rust-структур (serde `rename_all = "camelCase"`).

## 0. Конвенции

- Все команды возвращают `Result<T, AppError>`; в TS ошибка прилетает объектом `AppError` (tagged по `kind`).
- Пути везде — **абсолютные, канонизированные Rust-ом** строки. TS не конструирует пути (исключение: join для отображения — запрещён, отображаемые имена приходят готовыми).
- `docId` = `sha256(canonical_path_lowercased_on_windows)` hex — ключ черновиков; выдаёт Rust.

## 1. Типы (TS-зеркало)

```ts
// ---- ошибки ----
type AppError =
  | { kind: 'NotFound'; path: string }
  | { kind: 'PermissionDenied'; path: string }
  | { kind: 'ExternalModified'; path: string; diskMtimeMs: number } // save-конфликт
  | { kind: 'UnsupportedEncoding'; path: string; detected: string } // открыт readonly
  | { kind: 'IsBinary'; path: string }
  | { kind: 'Io'; message: string };

// ---- файлы ----
interface FileMeta {
  path: string;          // канонический абсолютный
  docId: string;         // ключ черновиков
  fileName: string;      // "README.md"
  dirPath: string;       // родительский каталог (для дерева)
  mtimeMs: number;       // база для конфликт-детекции
  readonly: boolean;     // fs-права ИЛИ UnsupportedEncoding-fallback
  encoding: 'utf-8' | 'utf-8-bom' | 'utf-16-le' | 'utf-16-be';
  eol: 'lf' | 'crlf';    // доминирующий; сохраняется при записи
  trailingNewline: boolean;
  sizeBytes: number;
}

interface OpenedFile { meta: FileMeta; content: string } // content: '\n'-нормализован

interface SaveResult { mtimeMs: number }

// ---- дерево ----
interface TreeEntry {
  name: string;
  path: string;
  isDir: boolean;
  hasChildren: boolean;  // для ленивого разворота dirs
}

// ---- черновики (crash-recovery) ----
interface Draft { docId: string; path: string; baseMtimeMs: number; savedAtMs: number; content: string }
interface DraftInfo { docId: string; path: string; baseMtimeMs: number; savedAtMs: number } // без content

// ---- сессия ----
interface SessionTab { path: string; cursor: number; scrollTop: number }
interface SessionState {
  tabs: SessionTab[];
  activeIndex: number;
  sidebar: { visible: boolean; panel: 'files' | 'outline'; width: number };
  treeRoot: string | null;
}

// ---- настройки ----
interface Settings {
  theme: 'light' | 'dark' | 'system';
  uiLang: 'system' | 'ru' | 'en';
  autosaveDraftMs: number;      // 800 по умолчанию; 0 = выкл (не рекомендуем)
  restoreSession: boolean;      // true
  editorFontSize: number;       // 16
  editorMaxWidth: number;       // 760 (px)
  fontFamily: 'default' | string;
  showStatusStrip: boolean;     // true
  recentFiles: string[];        // max 10, обновляет Rust при read_file
}
```

## 2. Команды (Rust `#[tauri::command]`)

| Команда | Сигнатура (TS) | Поведение / примечания |
| --- | --- | --- |
| `read_file` | `(path: string) => OpenedFile` | Детект кодировки/BOM/EOL (DATA-SAFETY §2). Бинарник → `IsBinary`. Обновляет `recentFiles`. Добавляет каталог файла в asset-scope (картинки) |
| `save_file` | `(path, content: string, baseMtimeMs: number \| null, meta: {encoding, eol, trailingNewline}) => SaveResult` | Атомарная запись (DATA-SAFETY §3). `baseMtimeMs != null` и mtime на диске новее → `ExternalModified`, файл НЕ пишется. `null` = принудительная запись (после решения в баннере) |
| `save_file_as` | `(defaultDir: string \| null) => string \| null` | Диалог; вернёт выбранный путь или null (отмена). Запись — отдельным `save_file` |
| `stat_file` | `(path: string) => { mtimeMs, exists }` | Для ленивых проверок при фокусе окна |
| `list_dir` | `(path: string) => TreeEntry[]` | Только: каталоги + `*.md`/`*.markdown`. Скрытые (`.`-префикс) отфильтрованы. Сортировка: dirs-first, alpha, case-insensitive |
| `resolve_tree_root` | `(filePath: string) => string` | Родительский каталог файла — корень дерева |
| `watch_paths` | `(paths: string[]) => void` | Полная замена набора наблюдаемых путей (файлы вкладок + корень дерева). Идемпотентна |
| `draft_save` | `(docId, path, baseMtimeMs, content) => void` | В `{appdata}/drafts/{docId}.json`, атомарно |
| `draft_get` | `(docId) => Draft \| null` | |
| `draft_delete` | `(docId) => void` | После успешного save / явного отказа |
| `drafts_list` | `() => DraftInfo[]` | Для recovery-баннера при старте |
| `session_load` | `() => SessionState \| null` | |
| `session_save` | `(s: SessionState) => void` | Дебаунс на стороне TS (2 c), атомарно |
| `settings_load` | `() => Settings` | Отсутствует/бит → дефолты (и перезапись файла дефолтами) |
| `settings_save` | `(s: Settings) => void` | Атомарно |
| `reveal_in_os` | `(path) => void` | Explorer/Finder/менеджер |
| `open_external` | `(url) => void` | Только http/https/mailto, иначе `Io` |
| `get_startup_files` | `() => string[]` | .md-пути из argv первого запуска (Win/Linux); на macOS дублируется событием `open-file` |

Фаза 2 (контракт зарезервирован, не реализуется в MVP): `search_in_folder(root, query, opts) => stream SearchHit`, `export_html(path)`, `list_themes()`.

## 3. События (Rust → TS, `emit` на главное окно)

| Событие | Payload | Когда |
| --- | --- | --- |
| `open-file` | `{ paths: string[] }` | single-instance argv второго запуска; macOS `RunEvent::Opened`; всегда канонические пути |
| `fs:changed` | `{ path: string; kind: 'modified' \| 'removed' \| 'renamed' }` | от watcher, уже задебаунсено (300 мс) |
| `menu:action` | `{ id: MenuActionId }` | нативное меню; `MenuActionId = 'open' \| 'save' \| 'saveAs' \| 'closeTab' \| 'settings' \| 'toggleSidebar' \| 'find' \| 'about'` |

События TS → Rust не используются (всё через команды).

## 4. Контракт поведения (инварианты)

1. **`content` в обе стороны — всегда `\n`-нормализованный юникод.** Rust: decode → strip BOM → CRLF→LF; encode обратно по `meta` при save. CM6 живёт только с `\n`.
2. **Round-trip:** `save_file(content_без_правок)` обязан дать байт-в-байт исходный файл (та же кодировка, BOM, EOL, trailing newline). Покрыто cargo-тестом.
3. **`ExternalModified` не пишет ни байта.** Решение о force — только пользователь (ConflictBanner → повторный вызов с `baseMtimeMs: null`).
4. **Все команды идемпотентны при повторе** (кроме диалоговой `save_file_as`).
5. **Никаких других команд** TS не вызывает (включая plugin-команды fs/shell напрямую) — только этот контракт + dialog/opener через наши обёртки. Гвард: grep по `invoke(` вне `lib/ipc/` — пусто.
