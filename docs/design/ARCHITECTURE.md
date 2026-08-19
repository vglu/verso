# Verso — Архитектура системы (MVP)

> Статус: принято 2026-08-19 (Думатель + Architect, Fable 5). Реализация — по волнам EPIC-MVP, порядок чтения для исполнителя — `docs/design/HANDOFF-OPUS.md`.

## 1. Общая картина

```
┌────────────────────────────── Tauri 2 App ──────────────────────────────┐
│                                                                          │
│  ┌──────── Rust (src-tauri) ────────┐   ┌───────── WebView (src) ──────┐ │
│  │                                   │   │                              │ │
│  │  commands/  ← typed IPC →         │   │  Svelte 5 «хром»             │ │
│  │    fs, dir, drafts,               │   │    TabBar, Sidebar(FileTree, │ │
│  │    session, settings, shell       │   │    Outline), Settings,       │ │
│  │  fsops/   atomic write, encoding  │   │    ConflictBanner, Empty     │ │
│  │  watcher/ notify + debounce       │   │                              │ │
│  │  singleinstance + fileassoc       │   │  CodeMirror 6 «документ»     │ │
│  │  menu (нативное меню приложения)  │   │    livePreview/ (консилер,   │ │
│  │                                   │   │    виджеты), search, keymap  │ │
│  └───────────────────────────────────┘   └──────────────────────────────┘ │
│         события: open-file, fs:changed, menu:action                       │
└──────────────────────────────────────────────────────────────────────────┘
```

**Три жёсткие границы:**

1. **Rust ↔ TS:** всё, что трогает ОС (файлы, диски, watch, поиск, диалоги, меню, ассоциации) — Rust. Всё, что рисует — TS. TS никогда не работает с путями как с ФС — только как с ключами.
2. **CM6 ↔ Svelte:** документ (текст, декорации, поиск, выделение, undo) целиком в CM6. Svelte не читает и не мутирует контент; общается с редактором через фасад `EditorHandle` (см. §5).
3. **Контент ↔ Вид:** текст файла — единственный источник истины. Live-preview — **view-only декорации**; ни один рендер-путь не мутирует документ (конституция round-trip).

## 2. Репозиторий (целевая структура)

```
Verso/
├─ src-tauri/
│  ├─ Cargo.toml
│  ├─ tauri.conf.json          # bundle, fileAssociations, CSP, окно
│  ├─ capabilities/main.json   # ACL: наши команды + dialog + opener
│  ├─ icons/
│  └─ src/
│     ├─ main.rs               # builder: плагины, меню, single-instance, setup
│     ├─ state.rs              # AppState { watcher: Mutex<WatcherHandle> }
│     ├─ error.rs              # AppError (thiserror) → serde-tagged в TS
│     ├─ paths.rs              # app dirs, doc_id (hash пути), нормализация
│     ├─ commands/
│     │  ├─ mod.rs
│     │  ├─ fs.rs              # read_file, save_file, stat_file
│     │  ├─ dir.rs             # list_dir, resolve_tree_root
│     │  ├─ drafts.rs          # draft_save/load/delete/list
│     │  ├─ session.rs         # session_load/save
│     │  ├─ settings.rs        # settings_load/save
│     │  └─ shell.rs           # reveal_in_os, open_external
│     ├─ fsops/
│     │  ├─ atomic.rs          # atomic_write (tmp+fsync+rename)
│     │  └─ encoding.rs        # detect/decode/encode, BOM, EOL
│     ├─ watcher.rs            # notify + debouncer → событие fs:changed
│     └─ menu.rs               # нативное меню → событие menu:action
├─ src/
│  ├─ main.ts                  # bootstrap: settings → session → App
│  ├─ App.svelte               # раскладка: TitleRow / Sidebar / TabBar / EditorHost / StatusStrip
│  ├─ lib/
│  │  ├─ ipc/
│  │  │  ├─ commands.ts        # типизированные обёртки invoke (единственное место со строками команд)
│  │  │  ├─ events.ts          # типизированные listen-обёртки
│  │  │  └─ types.ts           # DTO-типы = зеркало Rust-структур (см. IPC-CONTRACT.md)
│  │  ├─ stores/
│  │  │  ├─ tabs.svelte.ts     # TabsStore: открытие/закрытие/активная, dirty
│  │  │  ├─ settings.svelte.ts # SettingsStore + применение темы
│  │  │  ├─ workspace.svelte.ts# sidebar state, tree root, outline
│  │  │  └─ i18n.ts            # словарь ru/en, t()
│  │  ├─ editor/
│  │  │  ├─ createEditor.ts    # сборка EditorState/EditorView, фасад EditorHandle
│  │  │  ├─ markdownLang.ts    # lezer markdown + GFM + lazy code langs
│  │  │  ├─ livePreview/       # ядро магии — см. EDITOR-CORE.md
│  │  │  ├─ outline.ts         # заголовки из syntax tree → OutlineItem[]
│  │  │  ├─ search.ts          # обёртка @codemirror/search + кастомная панель
│  │  │  ├─ keymap.ts          # вся карта хоткеев
│  │  │  └─ cmTheme.ts         # CM-тема на CSS-токенах (без литеральных цветов)
│  │  └─ components/
│  │     ├─ TabBar.svelte
│  │     ├─ Sidebar.svelte     # контейнер: переключатель Files/Outline + resize
│  │     ├─ FileTree.svelte
│  │     ├─ Outline.svelte
│  │     ├─ EditorHost.svelte  # монтирует EditorView активной вкладки
│  │     ├─ SearchPanel.svelte
│  │     ├─ StatusStrip.svelte
│  │     ├─ SettingsModal.svelte
│  │     ├─ ConflictBanner.svelte
│  │     └─ EmptyState.svelte
│  └─ styles/
│     ├─ tokens.css            # ВСЕ токены (контракт тем) — см. DESIGN-SYSTEM.md
│     ├─ base.css              # reset, layout, хром
│     ├─ markdown.css          # стили .md-* классов документа (контракт тем)
│     └─ themes/
│        ├─ light.css          # дефолт (значения токенов уже в tokens.css)
│        └─ dark.css           # [data-theme="dark"] переопределяет токены
├─ tests/                      # vitest: unit TS
├─ docs/design/                # этот пакет документов
└─ package.json
```

## 3. Ключевые рантайм-потоки

### 3.1 Холодный старт (бюджет < 1 сек до отрисованного документа)

```
exe start → tauri init (плагины) → окно создаётся СРАЗУ (показ с bg-цветом темы из кеша)
  → webview грузит index.html (все ассеты локальные, шрифты woff2 предзагружены)
  → main.ts: settings_load ∥ session_load ∥ argv-файл
  → если argv-файл есть: он приоритетнее session → read_file → открыть вкладку
  → EditorView mount → первый кадр документа
  → ФОНОМ: восстановление остальных вкладок сессии (lazy), запуск watcher, дерево
```

Правила бюджета: KaTeX/Mermaid/языки подсветки — только dynamic import по факту появления в документе; дерево и второстепенные вкладки — после первого кадра; никакой синхронной работы > 50 мс в стартовом пути.

### 3.2 Двойной клик по .md (приложение уже запущено)

```
ОС запускает 2-й экземпляр → tauri-plugin-single-instance callback(argv, cwd) в 1-м
  → parse argv → канонизировать путь → emit "open-file" → focus окна → exit 2-го
TS: on("open-file") → если путь уже открыт: активировать вкладку; иначе новая вкладка
macOS: RunEvent::Opened { urls } → тот же emit "open-file"
```

### 3.3 Правка → сохранение

```
keystroke → CM6 dispatch → dirty=true → debounce 800мс → draft_save (черновик в appdata)
Ctrl+S → save_file(path, content, base_mtime) [Rust: atomic + проверка mtime]
  → ok: dirty=false, draft_delete, новый base_mtime
  → err ExternalModified: ConflictBanner (см. DATA-SAFETY.md §5)
```

### 3.4 Внешнее изменение файла

```
watcher (notify, debounce 300мс) → fs:changed {path, kind}
  → вкладка чистая → тихо перечитать + сохранить позицию курсора/скролла
  → вкладка dirty → ConflictBanner: [Перезагрузить] [Оставить моё]
  → kind=removed → пометка «файл удалён» в табе, содержимое остаётся (не терять!)
```

## 4. Rust-слой: решения

- **Крейты (MVP):** `tauri` 2, `tauri-plugin-single-instance`, `tauri-plugin-dialog`, `tauri-plugin-opener`, `tauri-plugin-window-state`, `serde`/`serde_json`, `thiserror`, `notify` + `notify-debouncer-full`, `encoding_rs`, `sha2` (doc id), `dirs`. Фаза 2: `ignore` + `grep-searcher` (поиск по папке), `tauri-plugin-updater`.
- **Ошибки:** один enum `AppError` (`thiserror`), сериализуется tagged (`{ kind: "ExternalModified", ... }`) — TS матчит по `kind`, никаких строковых сравнений сообщений.
- **Все команды `async`** (tauri runtime), блокирующий IO — `spawn_blocking`. Ни одна команда не держит UI.
- **Watcher** — один глобальный, следит за множеством путей (открытые файлы + корень дерева), хранится в `AppState`, события дебаунсятся в Rust (не в TS).
- **Никакого `unwrap()`/`expect()`** в командных путях; `cargo clippy -- -D warnings`.

## 5. TS-слой: решения

- **Фасад `EditorHandle`** — единственный API редактора для хрома: `{ getContent(), isDirty(), focus(), applySearch(q), revealHeading(pos), getOutline(), setMode(live|readonly), destroy() }`. Svelte-компоненты не импортируют CM6-модули напрямую (кроме `lib/editor/*`).
- **Вкладки:** каждая вкладка владеет своим `EditorView`; неактивные скрыты `display:none` (состояние, undo, скролл живут). Оптимизация «выгружать в EditorState после N вкладок» — фаза 2, интерфейс это уже позволяет.
- **Сторы — руны Svelte 5** (`$state` в `.svelte.ts`), никакого внешнего state-менеджера.
- **i18n:** мини-словарь `{ ru, en }` + `t(key)`; язык = system locale, fallback en. Без библиотек.
- **Все строки команд IPC** живут только в `lib/ipc/commands.ts` — по коду только типизированные функции.

## 6. Безопасность

- **CSP** (tauri.conf): `default-src 'self'; img-src 'self' asset: http://asset.localhost data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src ipc: http://ipc.localhost`. Никакой сети наружу: шрифты/KaTeX/Mermaid — в бандле.
- **Картинки документа** — через asset protocol; scope расширяется динамически: открыли файл/папку → Rust добавляет каталог в разрешённый scope (только чтение). Абсолютные `http(s)`-картинки — грузим (img-src добавить https:) — **решение: да, разрешить https-картинки** (стандарт markdown-мира), но никакого другого сетевого доступа.
- **HTML внутри markdown** — в live-режиме НЕ исполняется: рендерится как обычный текст (стилизованный как код). Санитизированный HTML-рендер — только в экспорте (фаза 2, DOMPurify). Это снимает XSS-класс целиком для MVP.
- **Ссылки** — `open_external` только через `tauri-plugin-opener` (системный браузер), схемы `http/https/mailto`; `file:`-ссылки открываются как вкладка, если это .md, иначе reveal_in_os.

## 7. Производительность — бюджеты (меряются в QA)

| Метрика | Бюджет |
| --- | --- |
| Cold start → первый кадр документа | < 1000 мс (цель 600) |
| Повторный запуск (single-instance форвард) | < 300 мс до вкладки |
| Ввод символа → кадр | < 16 мс p95 |
| Открытие файла 5 МБ | < 500 мс до интерактивности |
| Скролл 5 МБ файла | 60 fps (декорации только viewport) |
| Инсталлер | ≤ 20 МБ |
| RAM (1 файл открыт) | < 150 МБ включая webview |

## 8. Тестирование

- **Vitest (TS):** чистая логика — консилер (док+курсор → спека декораций), outline-извлечение, EOL/BOM-утилиты, сторы вкладок. CM6-виджеты — через `EditorState.create` без DOM где возможно.
- **cargo test (Rust):** atomic write (в т.ч. симуляция прерывания), encoding detect/roundtrip (UTF-8/BOM/UTF-16/CRLF), drafts, session serde, watcher debounce.
- **E2E** — фаза 2 (tauri WebDriver тяжёлый); в MVP заменён протоколом ручной live-валидации QA (чеклист в `qa.md` + сценарии в каждой волне HANDOFF).

## 9. Что осознанно отложено (фаза 2) — но дизайн не блокирует

| Фича | Крючок в дизайне уже есть |
| --- | --- |
| Plugin API | вся функциональность редактора = CM6-extensions; фасад EditorHandle; манифест по модели Obsidian |
| Поиск по папке | Rust-модуль search на `ignore`+`grep-searcher`, IPC-контракт зарезервирован |
| Экспорт HTML/PDF | пайплайн markdown-it+DOMPurify отделён от live-рендера; печать webview |
| Сторонние темы | контракт токенов+классов публикуется с MVP (`docs/themes.md` = DESIGN-SYSTEM §2-3) |
| Кастомный titlebar | MVP — нативный (меньше рисков со snap/drag); переоценка после 0.1 отдельным ADR |
| Updater | требует ключей подписи; после 0.1 |
| Многооконность | одна window в MVP; tabs-store не завязан на окно |
