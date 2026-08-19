# Agent model recommendations — MDViewer

Модель Claude для каждого агента. Используется оркестратором (Анатолий) при делегировании. **Эта таблица — таблица-истина проекта MDViewer**; `.claude/agents/README.md` — тонкое зеркало. Frontmatter каждого агент-файла обязан совпадать с таблицей.

**Tier-словарь (закрытый):**

- `strong` = `opus` — глубокое рассуждение: стратегия, архитектура, развилки
- `mid` = `sonnet`, fallback `opus` — оркестрация, имплементация, вердикты
- `simple` = `haiku`, fallback `sonnet` — контент-поток, пинки, механика

## Агенты (14)

| Агент | Файл | Роль | model | tier | fallback |
| ----- | ---- | ---- | ----- | ---- | -------- |
| **Алиса** (BA) | `alisa.md` | Требования → EPIC | opus | strong | — |
| **МегаМозг** | `megamozg.md` | Strategic Brain, ADR, cross-cutting | opus | strong | — |
| **Думатель** | `thinker.md` | First-principles, глубокие развилки | opus | strong | — |
| **Архитектор** | `architect.md` | Rust/TS границы, IPC, файловый план | opus | strong | — |
| **Product** | `product.md` | User flows, AC, edge cases | sonnet | mid | opus |
| **Designer** | `designer.md` | UI по дизайн-токенам, темы | sonnet | mid | opus |
| **Анатолий** | `anatoly.md` | Оркестрация пайплайна | sonnet | mid | opus |
| **Coder** | `coder.md` | Имплементация (Rust + TS) | sonnet | mid | opus |
| **QA** | `qa.md` | Верификация + live-evidence вердикт | sonnet | mid | opus |
| **DevOps** | `devops.md` | CI/CD, bundling, дистрибуция | sonnet | mid | opus |
| **Техписатель** | `tech-writer.md` | Документация, user guide, changelog | sonnet | mid | opus |
| **Фантазёр** | `fantazer.md` | Visual visionary: темы, анимации | sonnet | mid | opus |
| **Наташа** | `natasha.md` | Маркетинг, GTM, дистрибуция роста | haiku | simple | sonnet |
| **Пинатель** | `pinatel.md` | Anti-stall forcing function | haiku | simple | sonnet |

## Правило read-cheap-then-work (founder rule)

Разведка/чтение кода перед реальной работой — throwaway `Explore` агент на **haiku** (~5× дешевле). Оркестратор передаёт собранный контекст рабочему агенту, тот работает на своей модели. Никогда не жечь opus-токены на сырое чтение файлов.

## Правила эскалации

1. Начинай с назначенной модели; агент стоит/выдаёт garbage → эскалируй на opus с пометкой.
2. Задача на ≥3 файла с cross-cutting логикой → всегда opus.
3. Mechanical task (rename/replace/template fill) → haiku даже для opus-tier агента.
4. Debugging cascade (error → error → error) → opus.
5. Безопасность / данные пользователя (потеря файлов!) → opus.
6. Per-wave `Preferred model` в `.cursor/epics/*.md` сильнее agent default.

## Как использовать в промпте

```
Анатолий → Coder (model: sonnet): волна MVP-2 (file tree sidebar)
```

## Экономика

Haiku ≈ 1x, Sonnet ≈ 5x, Opus ≈ 25–30x. Haiku на механику, Opus на 3% задач (debug/architecture) — 90% ценности.
