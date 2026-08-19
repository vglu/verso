# HANDOFF — план исполнения для Opus (или любого Coder-агента)

> Проектирование выполнено на Fable 5 (2026-08-19, Думатель+Architect). Этот файл — точка входа исполнителя. Архитектурные вопросы в волнах MVP-0…MVP-5 закрыты; если реализация упирается в противоречие со спекой — стоп и ADR, не молчаливый обход.

## 0. Порядок чтения (обязателен, Закон 2)

1. `CLAUDE.md` — контракт и конституция
2. `.cursor/decisions/ADR-001-stack.md`, `ADR-002-ui-framework.md`
3. `docs/design/ARCHITECTURE.md` → `IPC-CONTRACT.md` → `EDITOR-CORE.md` → `DATA-SAFETY.md` → `DESIGN-SYSTEM.md`
4. `.cursor/epics/EPIC-MVP.md` — AC волн
5. Персона своей роли в `.cursor/agents/`

## 1. Правила исполнения

- Каждая волна = TASK-файл Анатолия (`.cursor/tasks/`) → пайплайн Product→Architect(сверка со спекой)→Designer→Coder→QA. Architect-этап в волнах = **сверка с этим пакетом**, не новое проектирование.
- APPROVAL-точки действуют, если фаундер не сказал «fullflow auto».
- Спека фиксирует ЧТО и границы; сигнатуры функций внутри модуля — свобода Coder в рамках `ARCHITECTURE.md` §2.
- После каждой волны: QA live-evidence + строка в ORCHESTRATOR.md + уведомление-webhook.

## 2. Волны — детальные чеклисты

### MVP-0 — Каркас (≈ 1 сессия)

1. `npm create tauri-app` → svelte-ts шаблон, имя `mdviewer`; выровнять структуру под ARCHITECTURE §2.
2. TS strict, ESLint (svelte plugin) + Prettier, `cargo clippy -D warnings` в CI-скрипте.
3. `tauri.conf.json`: окно 1200×800 min 640×480, `title: MDViewer`, CSP из ARCHITECTURE §6, `fileAssociations` (.md, .markdown → text/markdown), иконка-плейсхолдер.
4. Плагины Rust: single-instance (+обработчик argv→emit `open-file`), dialog, opener, window-state.
5. `styles/tokens.css` + `base.css` + `themes/dark.css` по DESIGN-SYSTEM §2 (полный список токенов), инлайн-скрипт темы до первого кадра.
6. Каркас `App.svelte`: layout-грид §5 (пустые компоненты-заглушки с осмысленным EmptyState).
7. Шрифты Inter + JetBrains Mono (woff2, latin+cyrillic) в бандл + preload.
8. CI: `.github/workflows/ci.yml` — матрица 3 ОС: lint, typecheck, cargo clippy/test, vitest, `tauri build` (артефакты в PR не публикуем).
9. `lib/ipc/types.ts` — все типы из IPC-CONTRACT §1 (пока без реализации команд).
- **AC волны:** `npm run tauri dev` открывает пустое красивое окно в обеих темах; CI зелёный на 3 ОС.

### MVP-1 — Рендеринг и чтение (≈ 2-3 сессии; сердце продукта)

1. `read_file` + `stat_file` в Rust (DATA-SAFETY §2 полностью, с тестами кодировок).
2. `createEditor.ts` + `markdownLang.ts` (GFM, lazy code langs) + `cmTheme.ts` (токены→теги подсветки).
3. `livePreview/`: activeLines → conceal → classes (все правила EDITOR-CORE §4 волны MVP-1).
4. Виджеты: checkbox (с toggle), image (asset-протокол), hr, link-поведение, bullet.
5. **TableWidget** (EDITOR-CORE §5) — отдельная задача внутри волны; fallback при отставании: стилизованный источник `.md-table-src`, TableWidget переносится в MVP-4 (решением фаундера на APPROVAL).
6. `markdown.css` — полная типографика DESIGN-SYSTEM §4.
7. Открытие файла: диалог (Ctrl+O), drag-n-drop на окно, argv (`get_startup_files` + событие `open-file`).
8. Перф-мера: sample-файл 5 МБ в `tests/fixtures` — скролл/ввод в бюджете (ARCHITECTURE §7).
- **AC:** EPIC-MVP-1 + «магия»: набор `**жирный**` конвертируется на глазах; курсор на строке раскрывает разметку; таблица рендерится (или согласованный fallback).

### MVP-2 — Файлы и данные (≈ 2 сессии)

1. `fsops/atomic.rs` + `save_file` + тест-обязательства DATA-SAFETY §3 (включая симуляцию падения).
2. Drafts: команды + TS-дебаунс + recovery-баннер при старте (§4).
3. `watcher.rs` (+`watch_paths`) + все конфликт-сценарии §5 + ConflictBanner.svelte.
4. Dirty-индикация, Ctrl+S/Shift+S, диалог закрытия с несохранённым.
5. Single-instance end-to-end: второй двойной клик → вкладка в живом окне (проверка на реальной ОС — QA-сценарий).
6. Round-trip cargo-тест «открыл-сохранил без правок = байт-в-байт».
- **AC:** EPIC-MVP-2 полностью; убийство процесса с несохранённым текстом → после старта текст восстановлен.

### MVP-3 — Оболочка (≈ 2 сессии)

1. TabsStore + TabBar (DESIGN-SYSTEM §5; Ctrl+Tab/W/1..9; средняя кнопка).
2. `list_dir`/`resolve_tree_root` + FileTree (lazy dirs, watch-рефреш, активный файл).
3. `outline.ts` + Outline-панель (клик→скролл, активная секция).
4. Sidebar-контейнер: сегмент-переключатель, resize, Ctrl+\, overlay-режим < 900px.
5. Session save/restore (§6) + интеграция с recovery.
- **AC:** EPIC-MVP-3; рестарт приложения возвращает вкладки/панели/активный файл.

### MVP-4 — Поиск и полировка (≈ 2 сессии)

1. SearchPanel по EDITOR-CORE §8 (счётчик, замена, подсветки, F3-навигация).
2. SettingsModal (все поля Settings) + StatusStrip.
3. Фенс-чип (язык+copy), полировка анимаций §6, empty-states, скроллбары (тонкие, overlay).
4. KaTeX + Mermaid виджеты (lazy) — если бюджет волны позволяет, иначе явный перенос в 0.2.
5. Перф-паспорт: замер cold start (скрипт: timestamp в main.rs → console.timeStamp первого кадра), фиксация чисел в TASK.
6. Полный проход «Definition of Beautiful» (DESIGN-SYSTEM §8) по всем поверхностям.
- **AC:** EPIC-MVP-4; перф-бюджеты ARCHITECTURE §7 замерены и зелёные.

### MVP-5 — Релиз 0.1 (≈ 1 сессия)

1. Release-workflow по тегу `v*`: msi/nsis, dmg, AppImage, deb + сводка SHA256.
2. Иконка приложения (Фантазёр→Designer: глиф «M▾» / документ-с-пером — 3 варианта на выбор фаундеру) во всех размерах.
3. README-витрина: hero-скриншот обеих тем, GIF live-редактирования (Наташа — подача, Техписатель — точность).
4. `docs/themes.md` = экспорт контракта DESIGN-SYSTEM §2-3 + пример кастомной темы.
5. Ручной прогон QA-чеклиста на Windows (primary) + smoke на mac/linux сборках.
- **AC:** EPIC-MVP-5; тег v0.1.0 собирает артефакты; двойной клик по .md на чистой Win-машине открывает красивый документ < 1 сек.

## 3. Реестр рисков (мониторить в каждой волне)

| Риск | Сигнал | Митигация |
| --- | --- | --- |
| TableWidget сложнее плана | > 1 сессии без работающего прототипа | fallback `.md-table-src`, перенос в 0.2 (решение фаундера) |
| WebKitGTK-рендер на Linux | артефакты шрифтов/скролла в CI-сборке | ручная проверка на живом Linux до v0.1; известные quirks — в docs |
| Cold start > 1с | замер MVP-4 | профиль: убрать из стартового чанка всё лишнее (lazy: языки, mermaid, katex, settings-модал) |
| Конфликт conceal ↔ IME/навигация | баги ввода на кириллице/движении курсора | ловушки EDITOR-CORE §9; vitest-кейсы на навигацию |
| Antivirus ломает rename на Win | редкие фейлы save | ретраи уже в спеке (DATA-SAFETY §3.6); телеметрии нет — лог в консоль |

## 4. Definition of Done релиза 0.1

- Все AC волн MVP-0…5 закрыты вердиктами QA c live-evidence
- 0 известных сценариев потери данных; round-trip тест зелёный
- Перф-паспорт в норме на Windows
- Фаундер пользуется MDViewer вместо Typora ≥ 1 день без желания вернуться
