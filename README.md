# Email Builder - Модульная структура

## 📁 Структура проекта

```
email-builder/
├── index.html                  # Главный HTML файл
├── css/
│   └── styles.css             # Стили приложения
├── js/
│   ├── definitions.js         # Константы и настройки
│   ├── state.js              # Управление состоянием
│   ├── blockDefaults.js      # Настройки блоков по умолчанию
│   ├── blockOperations.js    # Операции с блоками
│   ├── columnOperations.js   # Работа с колонками
│   ├── dragDrop.js           # Drag & Drop
│   ├── canvasRenderer.js     # Рендеринг canvas
│   ├── blockPreview.js       # Превью блоков
│   ├── imageRenderers.js     # Рендеринг изображений
│   ├── settingsUI.js         # UI компоненты настроек
│   ├── settingsPanels.js     # Панели настроек
│   ├── emailGenerator.js     # Генерация HTML письма
│   ├── outlookIntegration.js # Интеграция с Outlook
│   ├── modalPreview.js       # Модальное окно
│   └── main.js               # Инициализация
├── banners/                   # Изображения баннеров
├── icons/                     # Иконки для блоков
├── expert-badges/             # Значки экспертов
├── bullets/                   # Буллеты для списков
└── button-icons/              # Иконки для кнопок
```

## 📋 Описание модулей

### 1. **definitions.js** - Константы и настройки
Содержит все графические ресурсы, настройки рендеринга и конфигурацию:
- `BANNERS` - массив доступных баннеров
- `IMPORTANT_ICONS` - иконки для блока "Важно"
- `EXPERT_BADGE_ICONS` - значки для экспертов
- `BULLET_TYPES` - типы буллетов для списков
- `BUTTON_ICONS` - иконки для кнопок
- `CANVAS_CONFIG` - настройки canvas
- `DEFAULT_SETTINGS` - настройки блоков по умолчанию
- `SELECT_OPTIONS` - опции для выпадающих списков
- `API_CONFIG` - настройки API
- `EMAIL_STYLES` - стили для email

### 2. **state.js** - Управление состоянием
Центральное хранилище состояния приложения:
- Массив блоков
- Выбранный блок
- Состояние Drag & Drop
- Методы для работы с блоками

### 3. **blockDefaults.js** - Настройки по умолчанию
Функции для получения стандартных настроек блоков:
- `getDefaultSettings(type)` - возвращает настройки для типа блока
- `getBlockTypeName(type)` - возвращает название блока

### 4. **blockOperations.js** - Операции с блоками
Основные операции:
- `addBlock()` - добавление блока
- `deleteBlock()` - удаление блока
- `selectBlock()` - выбор блока
- `updateBlockSetting()` - обновление настройки
- `removeBlockFromParent()` - удаление из родителя

### 5. **columnOperations.js** - Работа с колонками
Операции с колонками:
- `splitBlockIntoColumns()` - разбить блок на колонки
- `mergeColumns()` - объединить колонки
- `updateColumnWidth()` - изменить ширину колонки

### 6. **dragDrop.js** - Drag and Drop
Полная реализация перетаскивания:
- `handleDragStart()` - начало перетаскивания
- `handleDragOver()` - движение над элементом
- `handleDrop()` - завершение перетаскивания
- Поддержка зон: верх, лево, право
- Работа с колонками

### 7. **canvasRenderer.js** - Рендеринг canvas
Отрисовка рабочей области:
- `renderCanvas()` - основной рендеринг
- `createBlockElement()` - создание элемента блока
- `renderColumnsPreview()` - превью колонок

### 8. **blockPreview.js** - Превью блоков
Рендеринг превью для каждого типа блока:
- `renderBlockPreviewReal()` - основная функция
- Отдельные функции для каждого типа блока

### 9. **imageRenderers.js** - Рендеринг изображений
Рендеринг баннеров и экспертов в высоком качестве:
- `renderBannerToDataUrl()` - рендеринг баннера в canvas
- `renderExpertToDataUrl()` - рендеринг эксперта в canvas
- `wrapText()` - перенос текста

### 10. **settingsUI.js** - UI компоненты настроек
Вспомогательные функции для создания элементов:
- `createSettingInput()` - текстовое поле
- `createSettingTextarea()` - текстовая область
- `createSettingRange()` - ползунок
- `createSettingSelect()` - выпадающий список
- `createIconGrid()` - сетка иконок
- `createFileUploadButton()` - кнопка загрузки файла

### 11. **settingsPanels.js** - Панели настроек (часть 1)
Генерация панелей настроек:
- `renderSettings()` - главная функция
- `renderBannerSettings()` - настройки баннера
- `renderTextSettings()` - настройки текста
- `renderHeadingSettings()` - настройки заголовка
- `renderButtonSettings()` - настройки кнопки

### 12. **settingsPanels2.js** - Панели настроек (часть 2)
Продолжение панелей настроек:
- `renderListSettings()` - настройки списка
- `renderExpertSettings()` - настройки эксперта
- `renderImportantSettings()` - настройки блока "Важно"
- `renderDividerSettings()` - настройки разделителя
- `renderImageSettings()` - настройки изображения
- `renderSpacerSettings()` - настройки отступа
- `renderColumnsSettings()` - настройки колонок

### 13. **emailGenerator.js** - Генерация HTML
Создание финального HTML письма:
- `generateEmailHTML()` - главная функция
- `generateBlockHTML()` - HTML блока
- `generateColumnsHTML()` - HTML колонок
- Отдельные функции для каждого типа блока

### 14. **outlookIntegration.js** - Интеграция с Outlook
Создание письма в Outlook:
- `createOutlookDraft()` - создание черновика
- Обработка ошибок
- Индикатор загрузки

### 15. **modalPreview.js** - Модальное окно
Управление окном превью:
- `setupPreviewButton()` - инициализация
- `showPreview()` - показ превью

### 16. **main.js** - Инициализация
Главный файл запуска:
- `init()` - инициализация приложения
- Настройка кнопок
- Экспорт глобальных функций

## 🔧 Подключение в HTML

Добавьте скрипты в правильном порядке перед закрывающим тегом `</body>`:

```html
<!-- Константы и настройки -->
<script src="js/definitions.js"></script>

<!-- Управление состоянием -->
<script src="js/state.js"></script>

<!-- Базовая функциональность -->
<script src="js/blockDefaults.js"></script>
<script src="js/blockOperations.js"></script>
<script src="js/columnOperations.js"></script>

<!-- Drag and Drop -->
<script src="js/dragDrop.js"></script>

<!-- Рендеринг -->
<script src="js/canvasRenderer.js"></script>
<script src="js/blockPreview.js"></script>
<script src="js/imageRenderers.js"></script>

<!-- Настройки -->
<script src="js/settingsUI.js"></script>
<script src="js/settingsPanels.js"></script>
<script src="js/settingsPanels2.js"></script>

<!-- Генерация и экспорт -->
<script src="js/emailGenerator.js"></script>
<script src="js/outlookIntegration.js"></script>
<script src="js/modalPreview.js"></script>

<!-- Инициализация -->
<script src="js/main.js"></script>
```

## 🎯 Как редактировать

### Добавить новый баннер
Отредактируйте `definitions.js`:
```javascript
const BANNERS = [
    // ...существующие баннеры
    { id: 'b12', src: 'banners/новый-баннер.png', label: 'Новый баннер' }
];
```

### Изменить настройки по умолчанию
Отредактируйте `definitions.js` в секции `DEFAULT_SETTINGS`:
```javascript
button: {
    text: 'Новый текст по умолчанию',
    // ...остальные настройки
}
```

### Добавить новый тип блока
1. Добавьте настройки в `definitions.js` → `DEFAULT_SETTINGS`
2. Добавьте название в `BLOCK_TYPE_NAMES`
3. Добавьте превью в `blockPreview.js` → `renderBlockPreviewReal()`
4. Добавьте настройки в `settingsPanels.js` или `settingsPanels2.js`
5. Добавьте генерацию HTML в `emailGenerator.js`

### Изменить логику Drag & Drop
Редактируйте `dragDrop.js`. Все функции перетаскивания собраны в одном месте.

### Настроить API Outlook
Отредактируйте `definitions.js`:
```javascript
const API_CONFIG = {
    OUTLOOK_SERVER_URL: 'http://localhost:5000/create-outlook-draft',
    DEFAULT_SUBJECT: 'Ваша тема письма'
};
```

## 🐛 Отладка

Каждый модуль логирует свои действия в консоль:
```javascript
console.log('✓ Email Builder готов к работе');
console.log('Генерация HTML...');
console.error('Ошибка:', error);
```

Откройте DevTools (F12) для просмотра логов.

## 📦 Преимущества модульной структуры

1. **Легко найти код** - каждая функция в своем файле
2. **Просто править** - изменения в одном месте не влияют на другие
3. **Удобно тестировать** - можно тестировать модули отдельно
4. **Легко расширять** - добавляйте новые модули без изменения существующих
5. **Читаемый код** - понятная структура и небольшие файлы

## 🚀 Быстрый старт

1. Скопируйте все файлы в папку проекта
2. Убедитесь, что структура папок совпадает
3. Откройте `index.html` в браузере
4. Начните создавать письма!

## 📝 Лицензия

MIT License - используйте свободно!