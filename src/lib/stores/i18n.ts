/**
 * Minimal i18n: ru/en dictionaries, no dependency. Language follows the
 * settings value ('system' resolves via navigator.language, fallback en).
 */
import type { LangSetting } from '../ipc/types';

type Dict = Record<string, string>;

const en: Dict = {
  'empty.title': 'No document open',
  'empty.hint': 'Open a Markdown file or drop one into this window',
  'empty.openFile': 'Open file',
  'empty.openFolder': 'Open folder',
  'empty.recent': 'Recent',
  'sidebar.files': 'Files',
  'sidebar.outline': 'Outline',
  'sidebar.emptyTree': 'No Markdown files in this folder',
  'sidebar.noOutline': 'No headings in this document',
  'tab.untitled': 'Untitled',
  'status.words': 'words',
  'status.chars': 'chars',
  'status.line': 'Ln',
  'status.col': 'Col',
  'status.readonly': 'read-only',
  'conflict.changed': 'This file was changed by another program',
  'conflict.reload': 'Reload from disk',
  'conflict.keepMine': 'Keep my version',
  'conflict.deleted': 'This file was deleted outside the app',
  'recovery.title': 'Unsaved changes were recovered',
  'recovery.restore': 'Restore',
  'recovery.discard': 'Discard',
  'save.prompt': 'Save changes to {name}?',
  'save.save': 'Save',
  'save.dontSave': "Don't save",
  'save.cancel': 'Cancel',
  'search.placeholder': 'Find',
  'search.replacePlaceholder': 'Replace',
  'search.noResults': 'No results',
  'search.replaceAll': 'Replace all',
  'search.matchCase': 'Match case',
  'search.wholeWord': 'Whole word',
  'search.regex': 'Regular expression',
  'settings.title': 'Settings',
  'settings.theme': 'Theme',
  'settings.themeLight': 'Light',
  'settings.themeDark': 'Dark',
  'settings.themeSystem': 'System',
  'settings.language': 'Language',
  'settings.fontSize': 'Font size',
  'settings.maxWidth': 'Text width',
  'settings.autosave': 'Draft autosave delay (ms)',
  'settings.restoreSession': 'Restore session on start',
  'settings.showStatus': 'Show status bar',
  'settings.close': 'Close',
  'error.readonlyEncoding': 'Unsupported encoding — opened read-only',
  'error.binary': 'This file is not text',
  'error.notFound': 'File not found',
  'error.permission': 'Permission denied',
  'error.tooLarge': 'File is too large to open'
};

const ru: Dict = {
  'empty.title': 'Документ не открыт',
  'empty.hint': 'Откройте файл Markdown или перетащите его сюда',
  'empty.openFile': 'Открыть файл',
  'empty.openFolder': 'Открыть папку',
  'empty.recent': 'Недавние',
  'sidebar.files': 'Файлы',
  'sidebar.outline': 'Оглавление',
  'sidebar.emptyTree': 'В этой папке нет файлов Markdown',
  'sidebar.noOutline': 'В документе нет заголовков',
  'tab.untitled': 'Без имени',
  'status.words': 'слов',
  'status.chars': 'символов',
  'status.line': 'Стр',
  'status.col': 'Кол',
  'status.readonly': 'только чтение',
  'conflict.changed': 'Файл изменён другой программой',
  'conflict.reload': 'Перезагрузить с диска',
  'conflict.keepMine': 'Оставить моё',
  'conflict.deleted': 'Файл удалён вне приложения',
  'recovery.title': 'Восстановлены несохранённые изменения',
  'recovery.restore': 'Восстановить',
  'recovery.discard': 'Удалить черновик',
  'save.prompt': 'Сохранить изменения в «{name}»?',
  'save.save': 'Сохранить',
  'save.dontSave': 'Не сохранять',
  'save.cancel': 'Отмена',
  'search.placeholder': 'Найти',
  'search.replacePlaceholder': 'Заменить',
  'search.noResults': 'Совпадений нет',
  'search.replaceAll': 'Заменить всё',
  'search.matchCase': 'Учитывать регистр',
  'search.wholeWord': 'Слово целиком',
  'search.regex': 'Регулярное выражение',
  'settings.title': 'Настройки',
  'settings.theme': 'Тема',
  'settings.themeLight': 'Светлая',
  'settings.themeDark': 'Тёмная',
  'settings.themeSystem': 'Системная',
  'settings.language': 'Язык',
  'settings.fontSize': 'Размер шрифта',
  'settings.maxWidth': 'Ширина текста',
  'settings.autosave': 'Задержка автосохранения черновика (мс)',
  'settings.restoreSession': 'Восстанавливать сессию при запуске',
  'settings.showStatus': 'Показывать строку состояния',
  'settings.close': 'Закрыть',
  'error.readonlyEncoding': 'Кодировка не поддерживается — открыто только для чтения',
  'error.binary': 'Это не текстовый файл',
  'error.notFound': 'Файл не найден',
  'error.permission': 'Нет доступа к файлу',
  'error.tooLarge': 'Файл слишком велик для открытия'
};

const dicts: Record<'ru' | 'en', Dict> = { ru, en };

let current: 'ru' | 'en' = 'en';

export function resolveLang(setting: LangSetting): 'ru' | 'en' {
  if (setting === 'ru' || setting === 'en') return setting;
  const nav = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : 'en';
  return nav.startsWith('ru') || nav.startsWith('uk') ? 'ru' : 'en';
}

export function setLang(setting: LangSetting): void {
  current = resolveLang(setting);
}

export function getLang(): 'ru' | 'en' {
  return current;
}

/** Translate a key, with optional {placeholder} substitution. */
export function t(key: string, vars?: Record<string, string>): string {
  const dict = dicts[current];
  let out = dict[key] ?? en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) out = out.replace(`{${k}}`, v);
  }
  return out;
}
