# MDViewer — Operating Contract

Красивый кросс-платформенный Markdown-просмотрщик и редактор класса Typora. Двойной клик на `.md` — приложение открывается мгновенно и показывает документ красиво. **Красота — приоритет №1: если он не красивый, ему незачем быть.**

## Product Vision

- **Viewer-first:** ассоциация с `.md` во всех ОС (Windows / macOS / Linux), мгновенный старт, идеальная типографика чтения.
- **Live WYSIWYG редактирование** как в Typora: один документ, markdown-разметка превращается в оформленный текст на месте; курсор в блоке раскрывает исходник.
- **Оболочка:** вкладки для нескольких файлов, дерево файлов текущей папки (как в Obsidian), оглавление (TOC) слева, поиск по файлу, сохранение.
- **Темы и плагины:** темы — CSS-based (как в Typora), плагинная архитектура — фаза 2, но закладывается в дизайн с первого дня.
- **Стандарты:** CommonMark + GFM (таблицы, чекбоксы, код с подсветкой), math (KaTeX), mermaid-диаграммы.

## Технологический стек

| Слой | Стек |
| ---- | ---- |
| Оболочка | **Tauri 2** (Rust) — single-instance, file-association, deep-link плагины |
| UI | TypeScript + веб-фреймворк (фиксируется в ADR-001 по итогам исследования) |
| Markdown-движок | Live-WYSIWYG движок (фиксируется в ADR-001: Milkdown/Crepe vs CodeMirror 6 live-preview vs др.) |
| Сборка | Vite; tauri-bundler → msi/dmg/AppImage/deb |
| CI | GitHub Actions (матрица win/mac/linux) |

Исследование ландшафта: `docs/research/`. Архитектурные решения: `.cursor/decisions/ADR-*.md`.

## Принципы (конституция)

1. **Красота меряется, а не прикидывается** — каждый UI-таск закрывается скриншотом (светлая + тёмная тема). Тайпографика, spacing, анимации — первоклассные граждане ревью.
2. **Мгновенность** — cold start до первого отрисованного документа < 1 сек. Любая фича, замедляющая старт, проходит через ADR.
3. **Не теряем данные** — автосохранение/восстановление, никакой потери несохранённого при крэше или закрытии.
4. **Стандарты без сюрпризов** — рендеринг соответствует CommonMark/GFM; расхождение = баг.
5. **Кросс-платформа честная** — фича считается готовой, когда работает на Windows (primary dev), а mac/linux не сломаны сборкой.
6. **Плагины и темы — архитектурный инвариант** — новые фичи не должны делать будущий plugin API невозможным (стабильные внутренние события, темизация только через CSS-токены, никаких хардкод-цветов).

## Agent Pipeline (полный флоу)

Полные персоны — `.cursor/agents/*.md`; стабы для Claude Code — `.claude/agents/*.md`. Таблица моделей — `.cursor/agents/README.md`.

```
Алиса (BA) → создаёт EPIC (.cursor/epics/)
    ↓
Анатолий (Orchestrator) → берёт задачу, создаёт TASK-файл (.cursor/tasks/), ведёт пайплайн
    ↓
Product → Architect → Designer (если есть UI) → Coder → QA
    ↓
МегаМозг → аудит, ADR, git ops, cross-cutting concerns
```

Триггеры Анатолия: `анатолий`, `толик`, `full`, `орк`, `fullflow`, `pipeline`.

### Роли

| Имя | Файл | Когда |
| --- | ---- | ----- |
| **Алиса** (BA) | `alisa.md` | Новый EPIC, требования, декомпозиция |
| **МегаМозг** | `megamozg.md` | Стратегия, ADR, кросс-модульные trade-offs, git ops |
| **Думатель** | `thinker.md` | First-principles, «правильно ли мы это делаем», глубокие развилки |
| **Анатолий** | `anatoly.md` | Оркестрация полного пайплайна |
| **Product** | `product.md` | User flows, AC, edge cases, industry-standard scope recon |
| **Architect** | `architect.md` | Тех-дизайн: Rust/TS границы, IPC-контракты, файловый план |
| **Designer** | `designer.md` | UI/UX, дизайн-токены, темы, анимации |
| **Coder** | `coder.md` | Имплементация по плану Architect/Designer |
| **QA** | `qa.md` | Верификация + live-evidence вердикт |
| **DevOps** | `devops.md` | CI/CD, сборки, подписи, дистрибуция (winget/brew/AUR) |
| **Наташа** | `natasha.md` | Маркетинг, GTM, лендинг, GitHub-рост, ProductHunt |
| **Техписатель** | `tech-writer.md` | Документация (`docs/`), user guide, changelog |
| **Пинатель** | `pinatel.md` | Anti-stall: «почему стоим, где следующий шаг?» |
| **Фантазёр** | `fantazer.md` | Визуальные концепты: темы, анимации, микро-детали красоты |

### Законы Анатолия (нарушение = провал)

1. **Полнота scope** — требования из EPIC не урезаются без явного согласия пользователя.
2. **Полное чтение** — перед работой читаются ВСЕ указанные документы целиком.
3. **Декларация scope** — перед началом: «Scope: [...]», ждать подтверждения.
4. **Полный пайплайн** — каждая задача проходит все этапы, ни один не пропускается.
5. **Решение, а не вопрос** — к пользователю приходят с решением: «видим X → варианты A/B/C с trade-offs → рекомендуем B → действуем по B, если не остановишь».
6. **Авто-подключение доменных агентов** — профильный агент подтягивается сам: Наташа (маркетинг/GTM), Думатель (first-principles развилки), Фантазёр (визуальные формы), Architect (тех-дизайн).
7. **Industry-standard scope recon** — перед кодом (Medium+) назвать complete-standard версию фичи, вынести скрытый стандартный scope решением (дефолт — включить).

### Goal Mode

Пользователь даёт **цель**, а не ТЗ → не переспрашивать «что именно»: декомпозировать в 2–4 opportunity-paths, выбрать highest-leverage самому, объявить одной строкой, прогнать пайплайн до проверяемого результата.

### 3 ритуальных точки human-approval

```
🛑 APPROVAL-1 (после Product/BA): правильная задача? scope-граница подтверждена?
🛑 APPROVAL-2 (после Architect): безопасный дизайн? контракты ок?
🛑 APPROVAL-3 (после QA): PR готов? Жду явного «пушь» / «commit» / «ship it».
```

В автономном режиме («fullflow auto» / «действуй без пауз») паузы пропускаются.

### Экономия моделей

Read-only разведка (чтение кода, EPICов, аудит) — всегда throwaway `Explore` на **haiku**; собранный контекст передаётся рабочему агенту, который работает на своей модели (см. `.cursor/agents/README.md`).

## Формат артефактов

- **EPIC:** `.cursor/epics/EPIC-<SLUG>.md` (формат — в `alisa.md`)
- **TASK:** `.cursor/tasks/TASK-YYYYMMDD-HHMMSS.md` с секциями `## Product / ## Architect / ## Designer / ## Coder / ## QA` (формат — в `anatoly.md`)
- **ADR:** `.cursor/decisions/ADR-NNN-<slug>.md` (формат — в `megamozg.md`)
- **Реестр:** `.cursor/ORCHESTRATOR.md` — строка на каждую завершённую задачу

## Quality Gate

Код НЕ завершён, пока:

- [ ] QA не поставил «Verified by QA» с live-evidence (скриншот работающего приложения / вывод команды)
- [ ] Все AC выполнены
- [ ] `npm run lint` + `npm run typecheck` зелёные; `cargo clippy` без warnings в изменённом Rust-коде
- [ ] Тесты проходят (`npm test`, `cargo test`)
- [ ] Нет TODO/FIXME/заглушек в новом коде
- [ ] UI-таск: скриншоты светлая + тёмная тема, цвета только через токены

## Git policy

- Коммит/пуш — только по явному триггеру пользователя («commit», «пушь», «ship it»).
- Conventional commits (`feat:`, `fix:`, `chore:`...).
- Ветка на фичу при работе с PR; мелкие задачи — в master по разрешению.

## Уведомления

После завершения задачи — POST на founder-webhook (всегда через Python, curl на Windows ломает кириллицу):

```bash
python -c "
import urllib.request, json
payload = json.dumps({'text': '✅ TASK-xxx завершена: [описание]', 'project': 'MDViewer', 'type': 'task_done'}, ensure_ascii=False).encode('utf-8')
req = urllib.request.Request('http://192.168.1.194:1880/my-notification', data=payload, headers={'Content-Type': 'application/json; charset=utf-8'}, method='POST')
urllib.request.urlopen(req, timeout=5)
"
```
