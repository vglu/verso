/**
 * Minimal i18n: ru/en dictionaries, no dependency. Language follows the
 * settings value ('system' resolves via navigator.language, fallback en).
 */
import type { LangSetting } from '../ipc/types';

type Dict = Record<string, string>;

const en: Dict = {
  'empty.title': 'No document open',
  'empty.hint': 'Open a Markdown file or drop one into this window',
  'empty.newFile': 'New file',
  'empty.openFile': 'Open file',
  'empty.openFolder': 'Open folder',
  'sidebar.newFile': 'New file in this folder',
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
  'status.reader': 'reading',
  'status.mixed': '(mixed)',
  'status.mixedEolHint':
    'This file mixes line endings. Lines you do not edit keep the endings they had.',
  'conflict.changed': 'This file was changed by another program',
  'conflict.reload': 'Reload from disk',
  'conflict.keepMine': 'Keep my version',
  'conflict.deleted': 'This file was deleted outside the app',
  'recovery.title': 'Unsaved changes were recovered',
  'recovery.untitled': 'a document that was never saved',
  'recovery.restore': 'Restore',
  'recovery.discard': 'Discard',
  'recovery.inTab': 'Showing unsaved changes recovered from {time}, not the file on disk',
  'recovery.keep': 'Keep them',
  'recovery.useDisk': 'Use the file',
  'save.prompt': 'Save changes to {name}?',
  'save.body': "If you don't save, your changes will be lost.",
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
  'error.tooLarge': 'File is too large to open',
  'about.title': 'About MDViewer',
  'about.tagline':
    'Opens a Markdown file instantly and renders it like a finished document. Your text stays exactly as you wrote it — same encoding, same line endings, byte for byte.',
  'about.owner': 'Software owner',
  'about.copy': 'Copy',
  'about.copied': 'Copied',
  'about.license': '{license} license',
  'about.versionHint': 'Installed version',
  'about.open': 'About',
  'toolbar.label': 'Formatting',
  'toolbar.h1': 'Heading 1',
  'toolbar.h2': 'Heading 2',
  'toolbar.h3': 'Heading 3',
  'toolbar.bold': 'Bold',
  'toolbar.italic': 'Italic',
  'toolbar.strike': 'Strikethrough',
  'toolbar.code': 'Inline code',
  'toolbar.bullet': 'Bulleted list',
  'toolbar.ordered': 'Numbered list',
  'toolbar.task': 'Task list',
  'toolbar.quote': 'Quote',
  'toolbar.link': 'Link',
  'toolbar.image': 'Image',
  'toolbar.table': 'Table',
  'toolbar.codeBlock': 'Code block',
  'toolbar.rule': 'Horizontal rule',
  'toolbar.math': 'Formula',
  'toolbar.diagram': 'Diagram',
  'toolbar.mode': 'View mode',
  'toolbar.modeLive': 'Preview',
  'toolbar.modeSource': 'Source',
  'settings.showToolbar': 'Show formatting toolbar',
  'settings.editorMode': 'Editing view'
};

const ru: Dict = {
  'empty.title': 'Документ не открыт',
  'empty.hint': 'Откройте файл Markdown или перетащите его сюда',
  'empty.newFile': 'Новый файл',
  'empty.openFile': 'Открыть файл',
  'empty.openFolder': 'Открыть папку',
  'sidebar.newFile': 'Новый файл в этой папке',
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
  'status.reader': 'чтение',
  'status.mixed': '(смешанные)',
  'status.mixedEolHint':
    'В файле смешаны окончания строк. Строки, которые вы не правите, сохранят свои прежние окончания.',
  'conflict.changed': 'Файл изменён другой программой',
  'conflict.reload': 'Перезагрузить с диска',
  'conflict.keepMine': 'Оставить моё',
  'conflict.deleted': 'Файл удалён вне приложения',
  'recovery.title': 'Восстановлены несохранённые изменения',
  'recovery.untitled': 'документ, который ни разу не сохраняли',
  'recovery.restore': 'Восстановить',
  'recovery.discard': 'Удалить черновик',
  'recovery.inTab': 'Показаны несохранённые изменения от {time}, а не файл с диска',
  'recovery.keep': 'Оставить их',
  'recovery.useDisk': 'Взять файл',
  'save.prompt': 'Сохранить изменения в «{name}»?',
  'save.body': 'Если не сохранить, изменения будут потеряны.',
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
  'error.tooLarge': 'Файл слишком велик для открытия',
  'about.title': 'О программе',
  'about.tagline':
    'Открывает файл Markdown мгновенно и показывает его как готовый документ. Ваш текст остаётся ровно таким, каким вы его написали, — та же кодировка, те же окончания строк, байт в байт.',
  'about.owner': 'Владелец программы',
  'about.copy': 'Копировать',
  'about.copied': 'Скопировано',
  'about.license': 'Лицензия {license}',
  'about.versionHint': 'Установленная версия',
  'about.open': 'О программе',
  'toolbar.label': 'Форматирование',
  'toolbar.h1': 'Заголовок 1',
  'toolbar.h2': 'Заголовок 2',
  'toolbar.h3': 'Заголовок 3',
  'toolbar.bold': 'Жирный',
  'toolbar.italic': 'Курсив',
  'toolbar.strike': 'Зачёркнутый',
  'toolbar.code': 'Код в строке',
  'toolbar.bullet': 'Маркированный список',
  'toolbar.ordered': 'Нумерованный список',
  'toolbar.task': 'Список задач',
  'toolbar.quote': 'Цитата',
  'toolbar.link': 'Ссылка',
  'toolbar.image': 'Картинка',
  'toolbar.table': 'Таблица',
  'toolbar.codeBlock': 'Блок кода',
  'toolbar.rule': 'Разделитель',
  'toolbar.math': 'Формула',
  'toolbar.diagram': 'Диаграмма',
  'toolbar.mode': 'Режим просмотра',
  'toolbar.modeLive': 'Вид',
  'toolbar.modeSource': 'Исходник',
  'settings.showToolbar': 'Показывать панель форматирования',
  'settings.editorMode': 'Режим редактирования'
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
