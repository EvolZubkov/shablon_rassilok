# Профили аудиторий — руководство по настройке

Профиль — это JSON-файл в папке `profiles/`, который определяет:
- какие блоки доступны конкретной аудитории
- с какими настройками по умолчанию создаются блоки
- какие контролы скрыты в панели настроек
- какие дополнительные возможности (capabilities) подключены

Активный профиль задаётся в `config.ini`:
```ini
[app]
profile = audience_b
```

Если файл профиля не найден — загружается `default.json`.

---

## Структура файла профиля

```json
{
  "name": "Человекочитаемое название",
  "blocks": {
    "ТИП_БЛОКА": {
      "enabled": true,
      "capabilities": ["background"],
      "defaults": { "ключ": "значение" },
      "hidden":   ["ключ_настройки"]
    }
  }
}
```

Каждый блок может содержать любую комбинацию четырёх полей.
Все поля опциональны — можно указать только те, что нужно изменить.

---

## Типы блоков

| Ключ | Название в приложении |
|---|---|
| `banner` | Баннер |
| `text` | Текст |
| `heading` | Заголовок |
| `button` | Кнопка |
| `list` | Список |
| `expert` | Эксперт |
| `important` | Важно |
| `divider` | Разделитель |
| `image` | Изображение |
| `spacer` | Отступ |

---

## Поле `enabled` — показать или скрыть блок

```json
"banner":  { "enabled": true  }   // блок доступен
"expert":  { "enabled": false }   // блок полностью скрыт, добавить нельзя
"divider": { "enabled": false }   // аналогично
```

По умолчанию (если поле не указано) — блок показывается.

---

## Поле `capabilities` — дополнительные секции настроек

Capabilities — это подключаемые модули, которые добавляют новые секции
в панель настроек блока и оборачивают HTML при генерации письма.

```json
"text":    { "enabled": true, "capabilities": ["background"] }
"heading": { "enabled": true, "capabilities": [] }
"banner":  { "enabled": true, "capabilities": [] }
```

### Доступные capabilities

#### `background` — Подложка
Добавляет цветной фон вокруг блока. Работает для всех блоков.
В панели настроек появляются три контрола:
- **Цвет подложки** — цвет фона
- **Скругление** — радиус углов подложки (0–32 px)
- **Отступ** — внутренний отступ между подложкой и содержимым (0–48 px)

Настройки подложки в `defaults`:
```json
"defaults": {
  "bgColor":   "#1e293b",   // цвет подложки
  "bgRadius":  8,           // скругление углов (px)
  "bgPadding": 16           // отступ внутри (px)
}
```

---

## Поле `defaults` — значения по умолчанию

При добавлении нового блока он получит именно эти значения.
Указываются только те ключи, которые нужно изменить — остальные берутся из базовых настроек.

### Баннер (`banner`)

```json
"banner": {
  "defaults": {
    "bannerHeight":     250,        // высота: 200 или 250
    "bannerRadius":     32,         // скругление углов баннера: 0–32
    "backgroundColor":  "#7700FF",  // цвет фона (hex)
    "leftBlockColor":   "#1D2533",  // цвет левого блока (hex)
    "rightImageMode":   "mask",     // формат правой картинки: "mask" | "rounded"
    "rightRoundedRadius": 32        // скругление правой картинки (только для rounded): 0–32
  }
}
```

| Ключ | Тип | По умолч. | Описание |
|---|---|---|---|
| `bannerHeight` | `200` / `250` | `250` | Высота баннера в пикселях |
| `bannerRadius` | `0` – `32` | `32` | Скругление внешних углов баннера |
| `backgroundColor` | `"#rrggbb"` | `"#7700FF"` | Цвет фона / правого блока |
| `leftBlockColor` | `"#rrggbb"` | `"#1D2533"` | Цвет левого блока (в режиме mask) |
| `rightImageMode` | `"mask"` / `"rounded"` | `"mask"` | Формат правой картинки |
| `rightRoundedRadius` | `0` – `32` | `32` | Скругление правой картинки (только rounded) |

### Текст (`text`)

```json
"text": {
  "defaults": {
    "content":    "Введите текст здесь.",
    "fontSize":   14,
    "lineHeight": 1.15,
    "align":      "left",
    "color":      "#e5e7eb",
    "fontFamily": "rt-light"
  }
}
```

| Ключ | Тип | По умолч. | Описание |
|---|---|---|---|
| `content` | строка | `"Введите текст..."` | Начальный текст блока |
| `fontSize` | число | `14` | Размер шрифта (px) |
| `lineHeight` | число | `1.15` | Межстрочный интервал |
| `align` | `"left"` / `"center"` / `"right"` | `"left"` | Выравнивание |
| `color` | `"#rrggbb"` | `"#e5e7eb"` | Цвет текста |
| `fontFamily` | строка | `"rt-light"` | Шрифт (см. таблицу шрифтов ниже) |

### Заголовок (`heading`)

```json
"heading": {
  "defaults": {
    "text":       "Заголовок раздела",
    "size":       22,
    "weight":     700,
    "color":      "#f9fafb",
    "align":      "left",
    "fontFamily": "rt-light"
  }
}
```

| Ключ | Тип | По умолч. | Описание |
|---|---|---|---|
| `text` | строка | `"Заголовок раздела"` | Начальный текст |
| `size` | число | `22` | Размер шрифта (px) |
| `weight` | `300`/`400`/`600`/`700` | `700` | Толщина шрифта |
| `color` | `"#rrggbb"` | `"#f9fafb"` | Цвет текста |
| `align` | `"left"` / `"center"` / `"right"` | `"left"` | Выравнивание |
| `fontFamily` | строка | `"rt-light"` | Шрифт |

### Кнопка (`button`)

```json
"button": {
  "defaults": {
    "text":  "Подключиться",
    "url":   "https://example.com",
    "color": "#ff4f12",
    "align": "center"
  }
}
```

| Ключ | Тип | По умолч. | Описание |
|---|---|---|---|
| `text` | строка | `"Подключиться"` | Текст на кнопке |
| `url` | строка | `"https://example.com"` | Ссылка кнопки |
| `color` | `"#rrggbb"` | `"#ff4f12"` | Цвет кнопки |
| `align` | `"left"` / `"center"` / `"right"` | `"center"` | Выравнивание |

### Список (`list`)

```json
"list": {
  "defaults": {
    "listStyle":   "bullets",
    "bulletType":  "circle",
    "fontSize":    14,
    "lineHeight":  1.0,
    "bulletSize":  20,
    "bulletGap":   10,
    "itemSpacing": 8,
    "fontFamily":  "rt-light"
  }
}
```

| Ключ | Тип | По умолч. | Описание |
|---|---|---|---|
| `listStyle` | `"bullets"` / `"numbers"` | `"bullets"` | Тип списка |
| `bulletType` | строка | `"circle"` | Тип буллета |
| `fontSize` | число | `14` | Размер шрифта (px) |
| `lineHeight` | число | `1.0` | Межстрочный интервал |
| `bulletSize` | число | `20` | Размер иконки буллета (px) |
| `bulletGap` | число | `10` | Отступ между буллетом и текстом (px) |
| `itemSpacing` | число | `8` | Отступ между пунктами (px) |

### Важно (`important`)

```json
"important": {
  "defaults": {
    "text":         "Важная информация",
    "textColor":    "#e5e7eb",
    "borderColor":  "#a855f7",
    "padding":      16,
    "fontSize":     14,
    "lineHeight":   1.15,
    "borderRadius": 16,
    "fontFamily":   "rt-light"
  }
}
```

| Ключ | Тип | По умолч. | Описание |
|---|---|---|---|
| `textColor` | `"#rrggbb"` | `"#e5e7eb"` | Цвет текста |
| `borderColor` | `"#rrggbb"` | `"#a855f7"` | Цвет полосы слева |
| `padding` | число | `16` | Внутренний отступ (px) |
| `fontSize` | число | `14` | Размер шрифта (px) |
| `borderRadius` | число | `16` | Скругление углов блока (px) |

### Отступ (`spacer`)

```json
"spacer": {
  "defaults": {
    "height": 32
  }
}
```

| Ключ | Тип | По умолч. | Описание |
|---|---|---|---|
| `height` | число | `32` | Высота отступа (px) |

### Изображение (`image`)

```json
"image": {
  "defaults": {
    "align":           "center",
    "width":           "100%",
    "borderRadiusAll": 0
  }
}
```

| Ключ | Тип | По умолч. | Описание |
|---|---|---|---|
| `align` | `"left"` / `"center"` / `"right"` | `"center"` | Выравнивание |
| `width` | `"100%"` / число | `"100%"` | Ширина изображения |
| `borderRadiusAll` | число | `0` | Скругление углов (px) |

---

## Поле `hidden` — скрыть контролы в панели настроек

Пользователь не видит эти настройки и не может их изменить.
Значение задаётся через `defaults` и остаётся фиксированным.

```json
"banner": {
  "defaults": { "rightImageMode": "rounded", "bannerHeight": 200 },
  "hidden":   ["rightImageMode", "bannerHeight"]
}
```

### Что можно скрыть у баннера

| Ключ в `hidden` | Что скрывает |
|---|---|
| `rightImageMode` | Тогл «Формат правой картинки» (Маска / Прямоугольник) |
| `bannerHeight` | Переключатель высоты баннера (200px / 250px) |

> Поддержка `hidden` для других блоков добавляется по аналогии в соответствующем `renderXxxSettings()`.

---

## Таблица шрифтов

| Значение `fontFamily` | Отображение |
|---|---|
| `"rt-regular"` | Rostelecom Regular |
| `"rt-medium"` | Rostelecom Medium |
| `"rt-bold"` | Rostelecom Bold |
| `"rt-light"` | Rostelecom Light |

---

## Полный пример: два профиля

### `profiles/default.json` — полный доступ

```json
{
  "name": "По умолчанию",
  "blocks": {
    "banner":    { "enabled": true,  "capabilities": ["background"] },
    "text":      { "enabled": true,  "capabilities": ["background"] },
    "heading":   { "enabled": true,  "capabilities": [] },
    "button":    { "enabled": true,  "capabilities": [] },
    "list":      { "enabled": true,  "capabilities": [] },
    "expert":    { "enabled": true,  "capabilities": [] },
    "important": { "enabled": true,  "capabilities": [] },
    "divider":   { "enabled": true,  "capabilities": [] },
    "image":     { "enabled": true,  "capabilities": [] },
    "spacer":    { "enabled": true,  "capabilities": [] }
  }
}
```

### `profiles/audience_b.json` — ограниченная аудитория

```json
{
  "name": "Аудитория B",
  "blocks": {
    "banner": {
      "enabled": true,
      "capabilities": [],
      "defaults": {
        "bannerRadius":     0,
        "rightImageMode":   "rounded",
        "rightRoundedRadius": 0,
        "bannerHeight":     200
      },
      "hidden": ["rightImageMode", "bannerHeight"]
    },
    "text":      { "enabled": true,  "capabilities": [] },
    "heading":   { "enabled": true,  "capabilities": [] },
    "button":    {
      "enabled": true,
      "capabilities": [],
      "defaults": { "color": "#0070cc" }
    },
    "list":      { "enabled": true,  "capabilities": [] },
    "expert":    { "enabled": false },
    "important": { "enabled": true,  "capabilities": [] },
    "divider":   { "enabled": false },
    "image":     { "enabled": true,  "capabilities": [] },
    "spacer":    { "enabled": true,  "capabilities": [] }
  }
}
```

---

## Переключение профиля

Отредактируй `config.ini` и перезапусти приложение:

```ini
[app]
profile = audience_b
```

Приложение читает профиль один раз при старте.
Чтобы применить изменения в JSON — достаточно перезапустить приложение,
пересборка не нужна.
