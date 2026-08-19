# Claude Code agent roster — MDViewer

Claude Code читает `.claude/agents/`; полные персоны живут в `.cursor/agents/<name>.md` (single source — стабы указывают туда). Frontmatter каждого стаба реплицирует канон из `.cursor/agents/README.md` (таблица-истина).

## Model map

| Model (tier) | Agents |
|-------|--------|
| **opus** (`strong`) | alisa, megamozg, thinker, architect |
| **sonnet** (`mid`, fallback opus) | anatoly, product, designer, coder, qa, devops, tech-writer, fantazer |
| **haiku** (`simple`, fallback sonnet) | natasha, pinatel |

## The read-cheap-then-work rule (founder rule)

Разведка/чтение кода перед реальной работой — throwaway `Explore` агент на **haiku** (~5× дешевле). Оркестратор передаёт собранный контекст рабочему агенту, тот работает на своей модели. Никогда не жечь opus-токены на сырое чтение файлов.

## Эскалация

1. Старт на назначенной модели; застрял или задача ≥3 файлов с cross-cutting логикой → opus.
2. Mechanical task → haiku даже для opus-tier агента.
3. Debugging cascade → opus.
4. Безопасность данных пользователя → opus.
5. Per-wave `Preferred model` в `.cursor/epics/*.md` сильнее agent default.
