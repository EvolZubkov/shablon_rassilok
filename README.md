# Email Builder - Модульная структура

## 📁 Структура проекта

```
email-builder/
├── index.html                  # Главный HTML файл
├── modular-styles.css         # Единый файл стилей
├── js/
│   ├── definitions.js         # Константы и настройки
│   ├── state.js              # Управление состоянием
│   ├── blockDefaults.js      # Настройки блоков по умолчанию
│   ├── blockOperations.js    # Операции с блоками
│   ├── columnOperations.js   # Работа с колонками
│   ├── templatesAPI.js       # API для работы с шаблонами
│   ├── templatesUI.js        # UI библиотеки шаблонов
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
├── templates/                 # 🆕 Папка с сохранёнными шаблонами (JSON)
├── banners/                   # Изображения баннеров
├── icons/                     # Иконки для блоков
├── expert-badges/             # Значки экспертов
├── bullets/                   # Буллеты для списков
├── button-icons/              # Иконки для кнопок
├── fonts/                     # Шрифты RostelecomBasis
│   ├── RostelecomBasis-Light.woff
│   ├── RostelecomBasis-Regular.woff
│   ├── RostelecomBasis-Medium.woff
│   └── RostelecomBasis-Bold.woff
└── outlook_server.py          # Flask сервер для Outlook и шаблонов
```

## 🆕 Новые возможности

### 📚 Библиотека шаблонов
- **Сохранение шаблонов** - сохраняйте готовые письма для повторного использования
- **Быстрый доступ** - выдвижная панель слева (кнопка ☰)
- **Поиск** - мгновенный поиск по названиям шаблонов
- **Редактирование** - двойной клик для переименования
- **Удаление** - кнопка × с подтверждением
- **Очистка холста** - кнопка для сброса всех блоков

### 🎨 Улучшения интерфейса
- **Выбор шрифта для баннеров** - 4 начертания RostelecomBasis (Light, Regular, Medium, Bold)
- **Dropdown размеров шрифта** - с возможностью ввода своего значения
- **Пресеты ширины колонок** - быстрые кнопки (20/80, 30/70, 40/60, 50/50 и т.д.)
- **Плавный слайдер колонок** - с debounce для производительности
- **Улучшенное отображение баннеров** - 2 колонки, правильные пропорции 2:1

### 🔧 Новые настройки блоков
- **Эксперт:**
  - Загрузка своего значка
  - Настройка положения значка (4 пресета + точная настройка X/Y)
  - Дефолтная позиция значка: 85% / 85% (снизу справа)
  
- **Важно:**
  - Загрузка своей иконки
  - Поддержка переносов строк (Enter в textarea)
  
- **Текст:**
  - Панель форматирования с кнопкой **B** (жирный текст)
  - Поддержка markdown: `**текст**` → **текст**

### 🎯 Технические улучшения
- **Встраивание всех начертаний шрифта** - Light, Regular, Medium, Bold работают в Outlook
- **Корректная обработка base64** - оптимизированный поток для canvas-рендера
- **Умная логика замены блоков** - подтверждение при загрузке шаблона поверх существующих блоков

---

## 📋 Описание модулей

### 🆕 **templatesAPI.js** - API для работы с шаблонами
Взаимодействие с backend для управления шаблонами:
- `getList()` - получить список всех шаблонов
- `load(filename)` - загрузить шаблон
- `save(name, blocks)` - сохранить новый шаблон
- `delete(filename)` - удалить шаблон
- `rename(filename, newName)` - переименовать шаблон

**Формат хранения:**
```json
{
  "id": "tpl_1234567890",
  "name": "Приглашение на вебинар",
  "created": "2025-12-10T12:00:00",
  "blocks": [...]
}
```

### 🆕 **templatesUI.js** - UI библиотеки шаблонов
Пользовательский интерфейс библиотеки:
- `init()` - инициализация панели
- `open()` / `close()` - управление видимостью
- `loadTemplates()` - загрузка списка с сервера
- `selectTemplate()` - загрузка шаблона в конструктор
- `deleteTemplate()` - удаление с подтверждением
- `startRenaming()` - inline редактирование названия
- `filterTemplates()` - поиск в реальном времени
- `clearCanvas()` - очистка с проверкой несохранённых изменений

**Workflow:**
```
[☰] → Панель выезжает → Клик на шаблон → Блоки загружаются
```

### 1. **definitions.js** - Константы и настройки
Содержит все графические ресурсы, настройки рендеринга и конфигурацию:
- `BANNERS` - массив доступных баннеров
- `IMPORTANT_ICONS` - иконки для блока "Важно"
- `EXPERT_BADGE_ICONS` - значки для экспертов
- `BULLET_TYPES` - типы буллетов для списков
- `BUTTON_ICONS` - иконки для кнопок
- `CANVAS_CONFIG` - настройки canvas (логическая ширина: 600px, scale: 2x)
- `BANNER_KEYS` - 🆕 ключи настроек для автоперерендера баннера
- `DEFAULT_SETTINGS` - настройки блоков по умолчанию
- `SELECT_OPTIONS` - опции для выпадающих списков
  - 🆕 `bannerFontFamily` - шрифты для баннера
  - 🆕 `textFontFamily` - шрифты для текста
- `API_CONFIG` - настройки API
- `EMAIL_STYLES` - стили для email

### 2. **state.js** - Управление состоянием
Центральное хранилище состояния приложения (паттерн State):
- Массив блоков (`AppState.blocks`)
- Выбранный блок (`AppState.selectedBlockId`)
- Состояние Drag & Drop
- Методы для работы с блоками:
  - `addBlock()` - добавление
  - `getBlockById()` - поиск
  - `clearSelection()` - снятие выделения

### 3. **blockDefaults.js** - Настройки по умолчанию
Функции для получения стандартных настроек блоков:
- `getDefaultSettings(type)` - возвращает настройки для типа блока
- `getBlockTypeName(type)` - возвращает название блока

**Поддерживаемые типы блоков:**
- `banner` - баннер с текстом
- `text` - текстовый блок
- `heading` - заголовок
- `button` - кнопка
- `list` - маркированный список
- `expert` - карточка эксперта
- `important` - важное сообщение
- `divider` - разделитель
- `image` - изображение
- `spacer` - отступ

### 4. **blockOperations.js** - Операции с блоками
Основные операции:
- `addBlock(type)` - добавление блока
- `deleteBlock(blockId)` - удаление блока
- `selectBlock(blockId)` - выбор блока
- `updateBlockSetting(blockId, key, value)` - 🆕 обновление с автоперерендером
  - Баннеры: автоматический рендер при изменении `BANNER_KEYS`
  - Эксперты: динамическая ширина для колонок
  - Кнопки: адаптивное масштабирование
- `removeBlockFromParent()` - удаление из родительского блока
- `findParentBlockWithColumns()` - поиск родителя с колонками

### 5. **columnOperations.js** - Работа с колонками
Операции с колонками:
- `splitBlockIntoColumns()` - разбить блок на 2 колонки (50/50)
- `mergeColumns()` - объединить колонки обратно
- `updateColumnWidth(blockId, leftWidth)` - 🆕 изменить ширину с перерендером

### 6. **dragDrop.js** - Drag and Drop
Полная реализация перетаскивания:
- `handleDragStart()` - начало перетаскивания
- `handleDragOver()` - движение над элементом
- `handleDrop()` - завершение перетаскивания
- 🆕 Поддержка зон: верх (30%), лево (35%), право (35%)
- 🆕 Работа с колонками: `handleColumnBlockDragStart()`
- 🆕 Drop зоны в пустых колонках

**Алгоритм:**
1. Определение зоны (верх/лево/право)
2. Вставка блока в нужную позицию
3. Удаление из старой позиции
4. Перерендер canvas

### 7. **canvasRenderer.js** - Рендеринг canvas
Отрисовка рабочей области:
- `renderCanvas()` - основной рендеринг
- `createBlockElement(block, index)` - создание элемента блока
- `renderColumnsPreview(block)` - превью колонок
- `createBlockHeader(block)` - 🆕 header с кнопками (split/merge/delete)
- `createBlockContent(block)` - контент блока

**Особенности:**
- Масштабирование canvas: 75% от логической ширины
- Поддержка колонок с динамической шириной
- Drag & Drop для обычных блоков и блоков в колонках

### 8. **blockPreview.js** - Превью блоков
Рендеринг превью для каждого типа блока в canvas:
- `renderBlockPreviewReal(block)` - основная функция-роутер
- Отдельные функции для каждого типа:
  - `renderBannerPreview()` - баннер (из renderedBanner)
  - `renderTextPreview()` - текст
  - `renderHeadingPreview()` - заголовок
  - `renderButtonPreview()` - кнопка (из renderedButton)
  - `renderListPreview()` - список
  - `renderExpertPreview()` - эксперт (из renderedExpert)
  - `renderImportantPreview()` - 🆕 с поддержкой переносов строк
  - `renderDividerPreview()` - разделитель
  - `renderImagePreview()` - изображение
  - `renderSpacerPreview()` - отступ

### 9. **imageRenderers.js** - Рендеринг изображений
Рендеринг баннеров, экспертов и кнопок в высоком качестве (canvas → dataURL):
- `renderBannerToDataUrl(block, callback)` - 🆕 рендеринг баннера с выбором шрифта
  - Поддержка 4 начертаний: Light, Regular, Medium, Bold
  - Автоматический перенос текста с `wrapText()`
  - Масштабирование: 2x для чёткости
  
- `renderExpertToDataUrl(block, callback)` - горизонтальный эксперт
  - Ромбовидная маска для фото (rotate 45deg)
  - 🆕 Динамическая позиция значка (badgePositionX/Y)
  
- `renderExpertVerticalToDataUrl(block, columnWidth, callback)` - вертикальный эксперт для колонок
  - Адаптивная ширина
  - 🆕 Поддержка пользовательских значков
  
- `renderButtonToDataUrl(block, callback)` - рендеринг кнопки
  - Градиентные фоны
  - Иконки слева от текста
  - Адаптивное масштабирование для колонок

- `wrapText(ctx, text, x, y, maxWidth, lineHeight, letterSpacing)` - перенос текста

### 10. **settingsUI.js** - UI компоненты настроек
Вспомогательные функции для создания элементов настроек:
- `createSettingInput(label, value, blockId, key, type)` - текстовое поле
- `createSettingTextarea(label, value, blockId, key, rows)` - текстовая область
- `createSettingRange(label, value, blockId, key, min, max, step, unit)` - ползунок
- 🆕 `createSettingFontSize(label, value, blockId, key, presets)` - dropdown размера шрифта
  - Пресеты: 10, 12, 14, 16, 18, 20, 24...
  - "Свой размер" → input для ручного ввода
- `createSettingSelect(label, value, blockId, key, options)` - выпадающий список
- `createIconGrid(icons, selected, blockId, key)` - сетка иконок
- `createFileUploadButton(label, blockId, settingKey)` - кнопка загрузки файла
  - Поддержка изображений (PNG, JPG, WEBP)
  - Конвертация в base64

### 11. **settingsPanels.js** - Панели настроек
Генерация панелей настроек для всех блоков:

#### `renderBannerSettings(container, block)`
- Выбор баннера (сетка 2 колонки, aspect-ratio 2:1)
- Загрузка своего баннера
- Текст на баннере (textarea)
- 🆕 Выбор шрифта (dropdown: Light/Regular/Medium/Bold)
- 🆕 Размер шрифта (dropdown с пресетами)
- Позиция по вертикали/горизонтали
- Межстрочный интервал
- Расстояние между буквами

#### `renderTextSettings(container, block)`
- Содержимое (textarea)
- 🆕 Панель форматирования:
  - Кнопка **B** для жирного текста
  - Выделите текст → нажмите B → `**текст**`
- Выбор шрифта
- 🆕 Размер шрифта (dropdown)
- Межстрочный интервал
- Выравнивание
- Панель "Ссылки" для вставки URL

#### `renderHeadingSettings(container, block)`
- Текст заголовка
- Выбор шрифта
- 🆕 Размер (dropdown)
- Толщина (300-900)
- Выравнивание

#### `renderButtonSettings(container, block)`
- Текст кнопки
- URL (href)
- Цвет фона
- Цвет текста
- Размер (small/medium/large)
- Выбор иконки (сетка)

#### `renderListSettings(container, block)`
- Элементы списка (textarea)
- 🆕 Размер текста (dropdown)
- Межстрочный интервал
- Выбор буллета (сетка)

#### `renderExpertSettings(container, block)`
- Превью фото с маской (ромб)
- Загрузка фото
- Настройки фото: позиция X/Y, масштаб
- Выбор значка (сетка)
- 🆕 Загрузка своего значка
- 🆕 Настройки положения значка:
  - 4 пресета: снизу справа, снизу слева, сверху справа, сверху слева
  - Точная настройка: Позиция X (%), Позиция Y (%)
- Кнопка "Убрать значок"
- Чекбокс "Вертикальный layout (для колонок)"
- Текстовые поля: Имя, Должность, Описание
- Цвета: фон, текст, имя, должность

#### `renderImportantSettings(container, block)`
- 🆕 Текст (textarea с поддержкой переносов строк)
- 🆕 Размер текста (dropdown)
- Межстрочный интервал
- Выбор иконки (сетка)
- 🆕 Загрузка своей иконки
- Цвета: текст, граница

#### `renderDividerSettings(container, block)`
- Цвет
- Толщина (1-10px)

#### `renderImageSettings(container, block)`
- Превью изображения
- Загрузка изображения
- Альтернативный текст
- Ширина (%, px или auto)
- Выравнивание

#### `renderSpacerSettings(container, block)`
- Высота отступа (10-100px)

#### 🆕 `renderColumnsSettings(container, block)`
- Информация о ширине колонок (Левая: X%, Правая: Y%)
- 🆕 Пресеты ширины (кнопки):
  - 20/80, 30/70, 40/60, 50/50, 60/40, 70/30, 80/20
  - Подсветка активного пресета
- Слайдер для точной настройки (20-80%)
  - Debounce 50мс для плавности
  - Финальный рендер при отпускании

### 12. **emailGenerator.js** - Генерация HTML
Создание финального HTML письма:
- `generateEmailHTML()` - главная функция с таблицей 600px
- `generateBlockHTML(block)` - роутер для блоков
- `generateColumnsHTML(parentBlock)` - генерация колонок
- 🆕 `resolveTextFontFamily(s)` - маппинг шрифтов на CSS имена
- 🆕 `formatTextWithLinks(raw)` - обработка:
  - `**текст**` → `<strong>текст</strong>` (жирный)
  - `[текст](url)` → гиперссылка
  - Авто-определение email и URL
  - Переносы строк `\n` → `<br>`

**Функции генерации блоков:**
- `generateBannerHTML(s)` - баннер (из renderedBanner)
- `generateTextHTML(s)` - текст с форматированием
- `generateHeadingHTML(s)` - заголовок
- `generateButtonHTML(s)` - кнопка (из renderedButton или таблица)
- `generateListHTML(s)` - список с буллетами
- `generateExpertHTML(s)` - эксперт (из renderedExpert)
- 🆕 `generateImportantHTML(s)` - важное с переносами строк
- `generateDividerHTML(s)` - разделитель (hr)
- `generateImageHTML(s)` - изображение
- `generateSpacerHTML(s)` - отступ

### 13. **outlookIntegration.js** - Интеграция с Outlook
Создание письма в Desktop Outlook через Flask backend:
- `createOutlookDraft()` - создание черновика
- Генерация HTML
- POST запрос на `http://localhost:5000/create-outlook-draft`
- Индикатор загрузки
- Обработка ошибок с пользовательскими сообщениями

**Workflow:**
1. Генерация HTML письма
2. Отправка на Flask сервер
3. Python обрабатывает изображения:
   - Конвертация локальных файлов в base64
   - 🆕 Встраивание всех начертаний шрифта в base64
   - Конвертация `data:image` в CID вложения
4. Создание черновика через COM API
5. Открытие Outlook на ПК пользователя

### 14. **modalPreview.js** - Модальное окно
Управление окном превью:
- `setupPreviewButton()` - инициализация кнопки "Превью"
- `openPreviewModal()` - показ модального окна
  - HTML превью письма
  - Textarea с исходным HTML кодом
- Закрытие по клику на overlay или кнопке ×

### 15. **main.js** - Инициализация
Главный файл запуска приложения:
- `init()` - инициализация при DOMContentLoaded
  - `setupBlockButtons()` - кнопки добавления блоков
  - `setupDownloadButton()` - кнопка Outlook
  - `setupCanvas()` - canvas с drag & drop
  - 🆕 `TemplatesUI.init()` - инициализация библиотеки шаблонов
- Экспорт глобальных функций в `window` для HTML onclick

---

## 🔧 Backend (Flask Server)

### **outlook_server.py**
Flask сервер для интеграции с Outlook и управления шаблонами:

#### Outlook endpoints:
- `POST /create-outlook-draft` - создание черновика в Outlook
  - Обработка изображений (base64 → CID вложения)
  - 🆕 Встраивание всех шрифтов (Light, Regular, Medium, Bold)
  - Вызов COM API: `win32.Dispatch("Outlook.Application")`
  - Открытие окна Outlook

#### 🆕 Templates API endpoints:
- `GET /api/templates/list` - получить список шаблонов
- `GET /api/templates/load?filename=...` - загрузить шаблон
- `POST /api/templates/save` - сохранить новый шаблон
- `DELETE /api/templates/delete?filename=...` - удалить шаблон
- `PUT /api/templates/rename` - переименовать шаблон

**Функции обработки:**
- `convert_font_to_base64(font_path)` - конвертация шрифта
- 🆕 `embed_all_fonts_in_html(html, base_path)` - встраивание всех шрифтов
- `process_local_images_in_html(html, base_path)` - обработка локальных картинок
- `embed_data_images_as_cid(mail, html)` - конвертация data: URL в CID вложения

---

## 🎯 Как использовать

### Создание письма
1. Добавьте блоки из левой панели
2. Настройте каждый блок справа
3. Используйте Drag & Drop для перестановки
4. Разбивайте на колонки кнопкой "разбить"
5. Нажмите "Создать письмо в Outlook"

### Работа с шаблонами
```
Создание шаблона:
1. Создайте письмо
2. Нажмите "Сохранить шаблон"
3. Введите название
4. Шаблон сохранён в /templates/

Использование шаблона:
1. Нажмите [☰] в левом верхнем углу
2. Панель выедет слева
3. Клик на шаблон → блоки загружаются
4. Редактируйте и отправляйте

Управление:
- Одиночный клик → загрузить
- Двойной клик на название → переименовать
- [×] → удалить (с подтверждением)
- Поиск → фильтрация в реальном времени
```

### Форматирование текста
```
Жирный текст:
1. Выделите текст в textarea
2. Нажмите кнопку B
3. Текст обернётся в **текст**
4. В письме будет bold

Переносы строк (блок "Важно"):
1. Просто нажимайте Enter в textarea
2. В письме будут реальные переносы
```

---

## 🎨 Стилизация

### modular-styles.css
Единый файл стилей со всеми компонентами:
- Layout (flexbox, grid)
- Библиотека блоков
- Canvas область
- 🆕 Библиотека шаблонов:
  - `.templates-panel` - выдвижная панель (320px)
  - `.templates-overlay` - затемнение фона
  - `.template-item` - элемент списка
  - `.template-delete` - кнопка удаления
  - `.btn-burger` - burger меню
- Панель настроек
- Модальные окна
- Drag & Drop индикаторы
- Шрифты (@font-face для RostelecomBasis)

---

## 📦 Подключение в HTML

```html
<!DOCTYPE html>
<html lang="ru">
<head>
  <link rel="stylesheet" href="modular-styles.css">
</head>
<body>
  <!-- HTML разметка -->
  
  <!-- Панель шаблонов -->
  <div id="templates-panel" class="templates-panel">...</div>
  <div id="templates-overlay" class="templates-overlay"></div>
  
  <!-- Скрипты в правильном порядке -->
  
  <!-- 1. Константы и настройки -->
  <script src="js/definitions.js"></script>
  
  <!-- 2. Управление состоянием -->
  <script src="js/state.js"></script>
  
  <!-- 3. Базовая функциональность -->
  <script src="js/blockDefaults.js"></script>
  <script src="js/blockOperations.js"></script>
  <script src="js/columnOperations.js"></script>
  <script src="js/templatesAPI.js"></script>
  <script src="js/templatesUI.js"></script>
  
  <!-- 4. Drag and Drop -->
  <script src="js/dragDrop.js"></script>
  
  <!-- 5. Рендеринг -->
  <script src="js/canvasRenderer.js"></script>
  <script src="js/blockPreview.js"></script>
  <script src="js/imageRenderers.js"></script>
  
  <!-- 6. Настройки -->
  <script src="js/settingsUI.js"></script>
  <script src="js/settingsPanels.js"></script>
  
  <!-- 7. Генерация и экспорт -->
  <script src="js/emailGenerator.js"></script>
  <script src="js/outlookIntegration.js"></script>
  <script src="js/modalPreview.js"></script>
  
  <!-- 8. Инициализация приложения -->
  <script src="js/main.js"></script>
</body>
</html>
```

---

## 🔌 Запуск сервера

```bash
# Установка зависимостей
pip install flask pywin32

# Запуск Flask сервера
python outlook_server.py

# Сервер запустится на http://localhost:5000
```

**Endpoints:**
- `POST /create-outlook-draft` - создание письма в Outlook
- `GET /api/templates/list` - список шаблонов
- `GET /api/templates/load?filename=...` - загрузка шаблона
- `POST /api/templates/save` - сохранение шаблона
- `DELETE /api/templates/delete?filename=...` - удаление
- `PUT /api/templates/rename` - переименование

---

## 🎯 Расширение функциональности

### Добавить новый баннер
```javascript
// definitions.js
const BANNERS = [
    // ...существующие
    { id: 'b12', src: 'banners/новый-баннер.png', label: 'Новый баннер' }
];
```

### Изменить дефолтные настройки
```javascript
// definitions.js → DEFAULT_SETTINGS
button: {
    text: 'Новый текст по умолчанию',
    color: '#7700ff',
    // ...
}
```

### Добавить новое начертание шрифта
```javascript
// definitions.js → SELECT_OPTIONS.textFontFamily
{ value: 'rt-black', label: 'Rostelecom Black' }

// modular-styles.css
@font-face {
  font-family: 'RostelecomBasis-Black';
  src: url('fonts/RostelecomBasis-Black.woff') format('woff');
}

// emailGenerator.js → resolveTextFontFamily
case 'rt-black':
    return "'RostelecomBasis-Black', Arial, sans-serif";

// outlook_server.py → embed_all_fonts_in_html
fonts = {
    'Black': 'RostelecomBasis-Black.woff',
    // ...
}
```

### Добавить новый тип блока
1. **definitions.js** → `DEFAULT_SETTINGS` - настройки по умолчанию
2. **definitions.js** → `BLOCK_TYPE_NAMES` - название
3. **blockPreview.js** → добавить case в `renderBlockPreviewReal()`
4. **settingsPanels.js** → создать `renderMyBlockSettings()`
5. **emailGenerator.js** → создать `generateMyBlockHTML()`
6. **index.html** → добавить кнопку в `.blocks-library`

---

## 🐛 Отладка

### Логи в консоли
```javascript
console.log('🚀 Инициализация Email Builder...');
console.log('✓ TemplatesUI initialized');
console.log('📥 Загрузка шаблона:', name);
console.log('[BLOCK OPS] Expert column width:', width);
```

### Проверка состояния
```javascript
// В консоли DevTools
AppState.blocks        // Все блоки
AppState.selectedBlockId // Выбранный блок
TemplatesUI.templates  // Список шаблонов
TemplatesUI.isOpen     // Открыта ли панель
```

### Типичные ошибки
- **Шрифты не работают** → проверьте `embed_all_fonts_in_html()` в Python
- **Панель шаблонов не открывается** → проверьте `TemplatesUI.init()` в main.js
- **Drag & Drop не работает** → проверьте `draggable="true"` и обработчики
- **Outlook не открывается** → проверьте запущен ли Flask сервер

---

## 📊 Производительность

### Оптимизации
- **Debounce для слайдеров** - обновление canvas каждые 50мс
- **Canvas масштабирование** - 2x для чёткости, 75% для отображения
- **Lazy рендеринг** - перерисовка только при изменении
- **Умный перерендер** - только нужных блоков (баннер, эксперт, кнопка)

### Размер данных
```
Баннер 600x300:
- Исходник JPG: ~100 KB
- Canvas render PNG: ~150 KB
- Base64: ~200 KB (+33% overhead)
- Outlook вложение: ~150 KB
```

---

## 🚀 Преимущества архитектуры

1. **Модульность** - каждая функция в своём файле
2. **Расширяемость** - легко добавлять новые блоки
3. **Поддерживаемость** - понятная структура кода
4. **Производительность** - оптимизированный рендеринг
5. **Переиспользование** - библиотека шаблонов
6. **Гибкость** - множество настроек для каждого блока

---

## 📝 Лицензия

MIT License - используйте свободно!

---

## 🎉 Changelog

### v2.0 (Декабрь 2025)
- 🆕 Библиотека шаблонов (сохранение/загрузка/управление)
- 🆕 Выбор шрифта для баннеров (4 начертания)
- 🆕 Dropdown размеров шрифта с пресетами
- 🆕 Пресеты ширины колонок (20/80, 30/70, ...)
- 🆕 Загрузка своих значков для эксперта
- 🆕 Настройка положения значка (X/Y пресеты)
- 🆕 Загрузка своей иконки для блока "Важно"
- 🆕 Форматирование текста (жирный **текст**)
- 🆕 Переносы строк в блоке "Важно"
- ✨ Улучшено отображение баннеров (2 колонки, 2:1)
- ✨ Плавный слайдер колонок с debounce
- 🐛 Исправлена работа шрифтов в Outlook (встраивание всех начертаний)

### v1.0 (Ноябрь 2025)
- ⚡ Первая версия
- Базовые блоки (баннер, текст, кнопка, список, эксперт, важно)
- Drag & Drop
- Колонки
- Интеграция с Outlook