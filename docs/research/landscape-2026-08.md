# Исследование ландшафта — open-source Markdown-редакторы (август 2026)

Глубокое исследование перед стартом MDViewer. Вывод: **строить с нуля на Tauri 2 + CodeMirror 6 live-preview, не форкать.** Решение зафиксировано в `.cursor/decisions/ADR-001-stack.md`.

## 1. Существующие Typora-подобные приложения

| Приложение | Стек | Лицензия | Состояние (авг 2026) | Вердикт как база для форка |
| --- | --- | --- | --- | --- |
| [MarkText](https://github.com/marktext/marktext) | Electron + Vue 3 + кастомный движок Muya | MIT | **Возродился**: спал 2022–2025, автор вернулся май 2026, v0.19.x → v0.20.0-rc.1 (июль 2026) | Ближайший OSS-аналог Typora, но: Electron (150+ МБ), bus-factor ~2, Muya — бесхозный кастомный движок, исторический источник data-corruption багов. **Не форкаем** |
| [Zettlr](https://github.com/Zettlr/Zettlr) | Electron + TS + CodeMirror 6 | GPL v3 | Очень активен (v4.4, май 2026) | GPL + академическая заточка (цитаты, Zettelkasten). Не форкаем, но отличный референс CM6-подхода |
| [SoloMD](https://github.com/zhitongblog/solomd) | **Tauri 2 + Vue 3 + CodeMirror 6** | MIT | Активен (авг 2026), ~857 звёзд | Доказательство что наш стек работает: ~15 МБ, Typora-style live preview, вкладки, темы, экспорт. Один автор + AI-обвес → референс-реализация, не база |
| Apostrophe / ghostwriter | GTK4 / Qt | GPL | Активны | Linux-only / не WYSIWYG — мимо |
| Notable | Electron | Проприетарный с 2020 | Мёртв как OSS | Нет |
| Obsidian (референс) | Electron + CM6 | Проприетарный | Эталон CM6 live-preview и **плагинной архитектуры** | Копируем архитектурные идеи |

## 2. WYSIWYG-движки

| Движок | База | Состояние | Вердикт |
| --- | --- | --- | --- |
| **CodeMirror 6 + live-preview декорации** (путь Obsidian/Zettlr/SoloMD) | CM6 + lezer-markdown (GFM) | CM6 в отличном здоровье | ✅ **Выбор.** Источник истины — текст файла, декорации view-only → **байт-точный round-trip**, странный markdown деградирует изящно. Стартовые точки: [codemirror-live-markdown](https://github.com/blueberrycongee/codemirror-live-markdown), [atomic-editor](https://github.com/kenforthewin/atomic-editor) |
| [Milkdown](https://github.com/Milkdown/milkdown) + Crepe | ProseMirror + remark | Активен, 11.8k звёзд, «inspired by Typora» | Альтернатива для максимального визуального WYSIWYG (рендер таблиц, slash-меню). Цена: parse→re-serialize — вечная ферма round-trip багов. Запасной вариант |
| Tiptap v3 | ProseMirror | Очень активен; markdown round-trip официально с 2025/26 | Headless, огромная экосистема, но коммерческая гравитация (Pro-экстеншены) и markdown-точность моложе |
| Vditor | кастомный | Затухает (последний релиз ~ноябрь 2025, один автор) | Риск |
| ToastUI Editor | ProseMirror | **Мёртв** (февраль 2023) | Нет |
| HyperMD | CodeMirror 5 | **Мёртв** (~2020) | Нет |

**Ключевой trade-off:** ProseMirror-WYSIWYG (красивее правка таблиц) парсит markdown в модель и пере-сериализует при сохранении → ломает нестандартный markdown. CM6-подход держит исходник как истину и только декорирует — поэтому его выбрали Obsidian, Zettlr и SoloMD.

## 3. Оболочка: Tauri 2 vs Electron (2026)

| Критерий | Tauri 2 | Electron |
| --- | --- | --- |
| Инсталлер | 3–15 МБ | 85–150+ МБ |
| RAM idle | ~30–60 МБ | ~200–300 МБ |
| Старт | Почти нативный | Медленнее |
| Рендеринг | Системные webview (WebKitGTK на Linux — слабое место) | Идентичный Chromium везде |
| Ассоциация .md | ✅ [`bundle.fileAssociations`](https://v2.tauri.app/reference/config/) стабильно | ✅ зрело |
| Single-instance + проброс пути | ✅ [`tauri-plugin-single-instance`](https://v2.tauri.app/plugin/single-instance/) — колбэк получает argv второго запуска | ✅ battle-tested |
| Автообновление | `tauri-plugin-updater` — стабильно | `electron-updater` |
| PDF-экспорт | ⚠️ слабое место: нет `printToPDF` — печать webview или внешний конвертер | ✅ `webContents.printToPDF` |

Консенсус 2026: «по умолчанию Tauri 2, если не нужен идентичный Chromium или встроенный PDF». Классические блокеры Tauri v1 (ассоциации, single-instance) устранены.

## 4. Table stakes и как их делают

- **Поиск по файлу:** CM6 → `@codemirror/search` бесплатно.
- **Поиск по папке:** в Rust на крейтах ripgrep (`ignore` + `grep-searcher`) — мгновенно на любых объёмах.
- **Watch файловой системы:** `notify` crate + debounce.
- **TOC/outline:** тривиально из lezer-дерева заголовков.
- **Темы:** модель Typora — «тема = один CSS-файл поверх стабильных классов». Публикуем контракт классов/токенов → темы контрибутит сообщество.
- **Плагины (модель Obsidian):** плагин = `manifest.json` + JS-модуль, получает API приложения **и общие CM6-пакеты** (декорации плагинов компонуются с ядром). MarkText плагинов не имеет — наш шанс на конкурентное отличие.
- **Экспорт:** HTML = наш рендерер + инлайн CSS темы; PDF — через системную печать (фаза 2, решить рано).

## Рекомендация (принята → ADR-001)

**Tauri 2 + Rust (`ignore`/`grep`/`notify` crates) + TypeScript + CodeMirror 6 (lezer-markdown GFM, live-preview декорации) + KaTeX + Mermaid + подсветка кода; темы по Typora-контракту; plugin API по модели Obsidian (JS-модули с CM6-расширениями).**

Почему не форк: MarkText = Electron + бесхозный Muya; SoloMD = один автор, референс а не база; Zettlr = GPL + чужая ниша.
