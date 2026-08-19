# MDViewer — Editor Core: live-preview движок на CodeMirror 6

> Самый важный документ пакета. Здесь описана «магия Typora»: как markdown-разметка превращается в оформленный текст на месте и раскрывается под курсором. Реализация — волна MVP-1 (+ виджеты в MVP-1/4).

## 1. Принцип

Документ CM6 = точный текст файла (`\n`-нормализованный). Рендеринг — **три вида декораций** поверх синтаксического дерева lezer:

1. **Line decorations** — классы строк (`.md-h1`, `.md-quote`, `.md-codeblock-line`...) → типографика через CSS.
2. **Replace decorations (conceal)** — скрытие синтаксических токенов (`**`, `#`, `[]()`...), когда строка не «активна».
3. **Widget decorations** — замена диапазона отрисованным элементом (картинка, чекбокс, hr, таблица, формула, диаграмма).

**Правило раскрытия (reveal):** строка «активна», если её касается любой selection range (курсор или выделение). На активных строках conceal/inline-виджеты отключаются — пользователь видит и правит сырую разметку ровно как в Typora. Блочные виджеты (таблица, mermaid) активируются, если selection внутри их диапазона.

Раскрытие — **построчное** (не по-узловое): предсказуемо, дёшево, совпадает с ощущением Obsidian. Узловое раскрытие («только жирный под курсором») — фаза 2, архитектура позволяет (см. §7).

## 2. Парсер

- `@codemirror/lang-markdown` c `@lezer/markdown`: базовый CommonMark + расширения `GFM` (Table, TaskList, Strikethrough, Autolink).
- Подсветка кода в фенсах: `codeLanguages: language-data` — **ленивая** загрузка языковых пакетов (динамические чанки Vite); первый рендер фенса без подсветки не блокируется.
- Math-расширение lezer (`$...$`, `$$...$$`) — маркировка узлов InlineMath/BlockMath (виджеты — MVP-4).
- Инкрементальность и viewport-парсинг lezer — из коробки; мы НЕ парсим документ сами нигде (outline тоже читает syntax tree).

## 3. Архитектура модуля `livePreview/`

```
livePreview/
├─ index.ts          # export livePreview(): Extension[] — сборка всего ниже
├─ activeLines.ts    # StateField<Set<number>> активных строк (из selection)
├─ conceal.ts        # ViewPlugin: обход syntaxTree в visibleRanges → DecorationSet
├─ classes.ts        # маппинг узлов lezer → line/mark классы (.md-*)
├─ widgets/
│  ├─ checkbox.ts    # TaskMarker → интерактивный чекбокс
│  ├─ image.ts       # Image → <img> (asset://), inline-block
│  ├─ hr.ts          # HorizontalRule → <hr>
│  ├─ link.ts        # conceal url-части, клик-поведение
│  ├─ fence.ts       # хедер-чип код-блока (язык + копировать)
│  ├─ table.ts       # TableWidget — рендер таблицы (см. §5)
│  ├─ math.ts        # KaTeX inline/block (MVP-4, lazy)
│  └─ mermaid.ts     # Mermaid block (MVP-4, lazy)
└─ types.ts          # WidgetSpec, ConcealRule
```

**Поток данных:** `update (doc | selection | viewport changed)` → `activeLines` пересчитал set → `conceal.ts` в `ViewPlugin.update` обходит `syntaxTree(state)` только в `view.visibleRanges` → строит `DecorationSet` (RangeSetBuilder). Никакого состояния вне поля зрения; на 5 МБ файле работа пропорциональна экрану, не документу.

## 4. Таблица правил рендеринга (полный список MVP)

Обозначения: 🅐 = на активной строке показывается исходник; conceal = `Decoration.replace({})`.

| Узел lezer | Неактивное состояние | Активное | Волна |
| --- | --- | --- | --- |
| `ATXHeading1..6` | line class `.md-h1..h6`; conceal `#…# ` + пробел | 🅐 маркер виден, класс остаётся (размер сохраняется — не прыгает) | MVP-1 |
| `SetextHeading1/2` | class + conceal подчёркивания `===`/`---` | 🅐 | MVP-1 |
| `Emphasis` / `StrongEmphasis` | mark `.md-italic`/`.md-bold`; conceal `*`/`**`/`_` | 🅐 | MVP-1 |
| `Strikethrough` | mark `.md-strike`; conceal `~~` | 🅐 | MVP-1 |
| `InlineCode` | mark `.md-code`; conceal backticks | 🅐 | MVP-1 |
| `Link` | показывается только label (mark `.md-link`); conceal `[`,`](url)`. Hover — tooltip с URL; Ctrl/Cmd+клик — открыть (внутр. `.md` → вкладка, http → браузер) | 🅐 | MVP-1 |
| `Autolink`/`URL` | mark `.md-link`, кликабельно | 🅐 | MVP-1 |
| `Image` | widget `<img>` (см. §6.2); синтаксис concealed | 🅐 исходник, виджет остаётся строкой ниже? — нет: виджет скрывается, только исходник (проще и чище) | MVP-1 |
| `ListItem` (bullet) | conceal `-`/`*`/`+` → widget «•» (`.md-bullet`); line class `.md-li` с отступом по уровню | 🅐 | MVP-1 |
| `ListItem` (ordered) | номер стилизуется (`.md-li-num`), не conceal | 🅐 | MVP-1 |
| `TaskMarker` | widget-чекбокс; клик мутирует doc: `[ ]`↔`[x]` (единственная легальная мутация из рендера — это правка пользователя) | 🅐 текст `[ ]` | MVP-1 |
| `Blockquote` | line class `.md-quote` (border-left); conceal `> ` | 🅐 | MVP-1 |
| `FencedCode` | line class `.md-codeblock-line` (фон-панель); первая/последняя строки: conceal ``` → header-чип (язык, кнопка copy) / нижняя кромка; подсветка внутри всегда | 🅐 фенс-строки видны | MVP-1 (чип — MVP-4) |
| `HorizontalRule` | widget `<hr class="md-hr">` | 🅐 `---` | MVP-1 |
| `Table` | **TableWidget** — см. §5 | 🅐 (selection внутри) исходник моноширинно `.md-table-src` | MVP-1 |
| `HTMLBlock`/`HTMLTag` | НЕ исполняется; mark `.md-html` (стиль кода) | 🅐 | MVP-1 |
| `InlineMath`/`BlockMath` | KaTeX-widget (lazy) | 🅐 | MVP-4 |
| ```` ```mermaid ```` | Mermaid-widget (lazy, рендер в фоне, спиннер-плейсхолдер) | 🅐 | MVP-4 |
| Front matter (`---` в начале) | сворачивается в чип «метаданные» (клик — раскрыть) | 🅐 | MVP-4 |

## 5. TableWidget — рендер таблиц (ключ к «магии Typora»)

Самое видимое отличие от «просто Obsidian». Дизайн:

- Узел `Table` (GFM) вне активного selection → **block replace decoration** на весь диапазон таблицы → widget строит настоящий `<table class="md-table">` из текста узлов (`TableHeader`, `TableRow`, `TableCell` — берём из lezer-дерева, **не** парсим regex-ом; alignment из delimiter-row).
- Ячейки рендерят inline-markdown (жирный/код/ссылки) — мини-проход по дочерним узлам lezer внутри ячейки.
- **Клик по ячейке** → вычисляем позицию клика → ставим курсор в соответствующий диапазон исходника → таблица раскрывается в исходник (моноширинный, выровненный `.md-table-src`). Esc/уход курсора → снова виджет.
- `estimatedHeight` у виджета — чтобы скролл не прыгал; `eq()` сравнивает срез текста таблицы — перерендер только при её изменении.
- Редактирование по-ячеечно прямо в виджете (contenteditable) — **фаза 2** (plugin-worthy); MVP-магия = «красиво всегда, кроме момента правки этой таблицы».

## 6. Виджеты — общие правила

1. Все виджеты — `WidgetType` с честными `eq()` (по исходному тексту диапазона) и `ignoreEvent()` (клики обрабатываем сами → ставим курсор в источник).
2. **Никогда не мутируют документ** (исключение: checkbox-toggle — явное действие пользователя, идёт через обычный `dispatch`).
3. Тяжёлые рендеры (mermaid, katex) — асинхронно: сначала плейсхолдер с `estimatedHeight`, затем `requestMeasure`.

### 6.2 Картинки

- `![alt](rel/path.png)` → src = `convertFileSrc(resolve(dirPath, relPath))`; каталог уже в asset-scope (команда `read_file` позаботилась). `https://` — напрямую (CSP разрешает img https).
- Ошибка загрузки → плейсхолдер `.md-img-broken` (иконка + alt + путь). `max-width: 100%`, лениво (`loading="lazy"`).

## 7. Расширяемость (крючок plugin API фазы 2)

- `livePreview()` собирается из массива `ConcealRule`/`WidgetSpec` — регистр правил. Плагин фазы 2 = ещё один набор правил + CM6-extensions через тот же регистр. Ядро не знает про конкретные виджеты — только про интерфейс.
- Node-based reveal (вместо line-based) — изолирован в `activeLines.ts`: замена одной функции `computeActiveRanges()`.

## 8. Прочее ядро редактора

- **Undo/redo:** стандартная `history()` CM6 — работает по тексту, декорации не участвуют (бесплатная корректность).
- **Поиск (MVP-4):** `@codemirror/search` c `search({ createPanel })` — своя Svelte-панель (стили DESIGN-SYSTEM), API: `SearchQuery`, `findNext/Previous`, `replaceNext/All`, счётчик `count`. Совпадения подсвечиваются и в concealed-тексте (декорации поиска поверх; conceal при совпадении в скрытом маркере — раскрываем строку совпадения при навигации на неё).
- **Форматирование хоткеями:** Ctrl+B/I — обернуть/снять `**`/`*` вокруг selection; Ctrl+K — `[sel](url|clipboard-if-url)`; продолжение списков по Enter, Tab/Shift+Tab — indent/outdent пункта (штатные команды lang-markdown).
- **Смешанный ввод:** `EditorView.lineWrapping` включён; spellcheck выключен (MVP), `autocapitalize/autocorrect` off.
- **Reader mode (P1):** тот же `EditorView` c `EditorState.readOnly.of(true)` + режим консилера `forceConcealAll` (активных строк нет) + скрытый caret. Один пайплайн рендеринга — нулевая дивергенция вида.
- **Outline:** `outline.ts` обходит syntax tree (только Heading-узлы, это дёшево) на `docChanged` с debounce 200 мс → `OutlineItem { level, text, from }[]` → стор workspace. Активный пункт = последний heading выше `view.visibleRanges[0].from`.

## 9. Известные ловушки (для Coder)

1. **Conceal + курсорная навигация:** Decoration.replace без `inclusive` может «съедать» позицию — использовать `Decoration.replace({ inclusiveStart: false, inclusiveEnd: false })`; проверить движение стрелками через скрытые маркеры (курсор должен «перепрыгивать» атомарно — `atomicRanges` фасет для replace-диапазонов).
2. **IME/композиция:** активная строка всегда раскрыта → композиция происходит на сыром тексте; не трогать декорации внутри `update.transactions.some(tr => tr.isUserEvent('input.type.compose'))` вне активной строки.
3. **Виджет + line-height:** блочные виджеты задают собственную высоту; всегда давать `estimatedHeight`, иначе прыгает скролл при быстрой прокрутке.
4. **`visibleRanges` в момент старта** пуст до первого measure — первый DecorationSet строить в `update` с `view.viewport`, не в конструкторе.
5. **Активная строка в таблице:** selection внутри Table-диапазона раскрывает ВЕСЬ блок таблицы (не строку) — иначе разъезжается.
6. **Checkbox toggle** должен работать и когда строка неактивна (клик по виджету) — dispatch с `userEvent: 'input'` чтобы history сгруппировала корректно.
