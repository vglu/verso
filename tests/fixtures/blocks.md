| Компонент | Технология | Статус |
| --- | :---: | ---: |
| Оболочка | Tauri 2 | готово |
| Редактор | CodeMirror 6 | готово |
| Темы | **CSS-токены** | готово |
| Плагины | `JS-модули` | фаза 2 |

```typescript
export function livePreview(): Extension {
  const decorations = buildDecorations(view);
  return [blockPreview, inlinePreview];
}
```

> Правильное решение — не то, что вписывается в текущий codebase.
> Правильное решение — то, что корректно решает задачу.

---

```rust
pub fn atomic_write(path: &Path, bytes: &[u8]) -> AppResult<()> {
    let tmp = temp_sibling(path);
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, path)?;
    Ok(())
}
```

Обычный абзац после блоков — проверка вертикального ритма и того, что панель кода закрывается аккуратно.
