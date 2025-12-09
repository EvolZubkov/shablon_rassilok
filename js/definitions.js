// definitions.js - Все константы и настройки проекта

// === ГРАФИЧЕСКИЕ РЕСУРСЫ ===

const BANNERS = [
    { id: 'b1', src: 'banners/Анкета ОС.png', label: 'Баннер 1' },
    { id: 'b2', src: 'banners/Запись занятия и материалы.png', label: 'Баннер 2' },
    { id: 'b3', src: 'banners/Календарь практикумов.png', label: 'Баннер 3' },
    { id: 'b4', src: 'banners/Календарь треков.png', label: 'Баннер 4' },
    { id: 'b5', src: 'banners/Пример шапки анкеты ОС.png', label: 'Баннер 5' },
    { id: 'b6', src: 'banners/Пример шапки анонса.png', label: 'Баннер 6' },
    { id: 'b7', src: 'banners/Пример шапки пост-рассылки.png', label: 'Баннер 7' },
    { id: 'b8', src: 'banners/Пример шапки приглашения на занятие.png', label: 'Баннер 8' },
    { id: 'b9', src: 'banners/Пример шапки. Среда.png', label: 'Баннер 9' },
    { id: 'b10', src: 'banners/Среда развития.png', label: 'Баннер 10' },
    { id: 'b11', src: 'banners/Шапка.png', label: 'Баннер 11' },
];

const IMPORTANT_ICONS = [
    { id: 'i1', src: 'icons/Геометка с картой.png', label: 'Геометрия' },
    { id: 'i2', src: 'icons/Звездочки нейрошлюза.png', label: 'Звездочки' },
    { id: 'i3', src: 'icons/Знак вопроса.png', label: 'Вопрос' },
    { id: 'i4', src: 'icons/Кнопка play.png', label: 'Play' },
    { id: 'i5', src: 'icons/Локация.png', label: 'Локация' },
    { id: 'i6', src: 'icons/Мегафон. Внимание.png', label: 'Мегафон' },
    { id: 'i7', src: 'icons/Мессенджер.png', label: 'Месседжер' },
    { id: 'i8', src: 'icons/Молния.png', label: 'Молния' },
    { id: 'i9', src: 'icons/Огонек.png', label: 'Огонек' },
    { id: 'i10', src: 'icons/Письмо.png', label: 'Письмо' },
    { id: 'i11', src: 'icons/Сердечко.png', label: 'Сердечко' },
    { id: 'i12', src: 'icons/Список дел.png', label: 'Список' },
    { id: 'i13', src: 'icons/Файл.png', label: 'Файл' },
];

const EXPERT_BADGE_ICONS = [
    { id: 'e1', src: 'expert-badges/Сообщение.png', label: 'Сообщение' },
    { id: 'e2', src: 'expert-badges/Важно или лучшие.png', label: 'Важно или лучшие' },
    { id: 'e3', src: 'expert-badges/Кодинг.png', label: 'Кодинг' },
    { id: 'e4', src: 'expert-badges/Подкаст или включи микрофон.png', label: 'Подкаст' },
    { id: 'e5', src: 'expert-badges/Ракета.png', label: 'Ракета' },
    { id: 'e6', src: 'expert-badges/orange.png', label: 'Оранжевый' },
    { id: 'e7', src: 'expert-badges/fiolet.png', label: 'Фиолетовый' },
    { id: 'e8', src: 'expert-badges/siren.png', label: 'Сиреневый' },
    { id: 'e9', src: 'expert-badges/yellow.png', label: 'Желтый' },
    { id: 'e10', src: 'expert-badges/grey.png', label: 'Серый' },
];

const BULLET_TYPES = [
    { id: 'circle', src: 'bullets/Буллет.png', label: 'Буллет' },
    { id: 'circle2', src: 'bullets/Буллет 2.png', label: 'Буллет' },
    { id: 'circle3', src: 'bullets/Буллет 3.png', label: 'Буллет' },
    { id: 'circle4', src: 'bullets/Буллет 4.png', label: 'Буллет' },
];

const BUTTON_ICONS = [
    { id: 'none', src: '', label: 'Без иконки' },
    { id: 'arrow', src: 'button-icons/Альпина.png', label: 'Альпина' },
    { id: 'download', src: 'button-icons/Знак.png', label: 'Лого' },
    { id: 'play', src: 'button-icons/Миф.png', label: 'Миф' },
];


// === НАСТРОЙКИ РЕНДЕРИНГА ===

const CANVAS_CONFIG = {
    LOGICAL_WIDTH: 600,
    SCALE_FACTOR: 2,
    get REAL_WIDTH() { return this.LOGICAL_WIDTH * this.SCALE_FACTOR; }
};

const BANNER_KEYS = [
    'image', 'text', 'fontSize', 'fontFamily',
    'positionX', 'positionY', 'lineHeight', 'letterSpacing'
];

const DRAG_ZONES = {
    HEIGHT_THRESHOLD: 0.3,  // 30% для верхней зоны
    WIDTH_THRESHOLD: 0.35   // 35% для боковых зон
};

// === НАЗВАНИЯ БЛОКОВ ===

const BLOCK_TYPE_NAMES = {
    banner: 'Баннер',
    text: 'Текст',
    heading: 'Заголовок',
    button: 'Кнопка',
    list: 'Список',
    expert: 'Эксперт',
    important: 'Важно',
    divider: 'Разделитель',
    image: 'Картинка',
    spacer: 'Отступ'
};

// === НАСТРОЙКИ ПО УМОЛЧАНИЮ ===

const DEFAULT_SETTINGS = {
    banner: {
        image: () => BANNERS.length > 0 ? BANNERS[0].src : '',
        text: 'До встречи в эфире!',
        fontSize: 24,
        fontFamily: 'rt-regular',
        positionY: 50,
        positionX: 3,
        lineHeight: 1.2,
        letterSpacing: 0,
        renderedBanner: null
    },

    text: {
        content: 'Введите текст здесь. Можно использовать несколько строк.',
        fontSize: 14,
        lineHeight: 1.6,
        align: 'left',
        color: '#e5e7eb',
        fontFamily: 'rt-light',
        customFontFamily: ''
    },

    heading: {
        text: 'Заголовок раздела',
        size: 22,
        weight: 700,
        color: '#f9fafb',
        align: 'left',
        fontFamily: 'rt-light',
        customFontFamily: ''
    },

    button: {
        text: 'Подключиться',
        url: 'https://example.com',
        color: '#f97316',
        textColor: '#ffffff',
        icon: '',
        align: 'center',
        size: 1
    },

    list: {
        items: [
            'Первый пункт списка',
            'Второй пункт списка',
            'Третий пункт списка'
        ],
        bulletType: 'circle',
        bulletCustom: '',
        fontFamily: 'rt-light',
        customFontFamily: '',
        fontSize: 14,
        lineHeight: 1.0,
        bulletSize: 20,
        bulletGap: 10,
        itemSpacing: 8,
        listStyle: 'bullets'
    },

    expert: {
        photo: 'images/expert-placeholder.png',
        name: 'Имя эксперта',
        title: 'Должность',
        bio: 'Краткое описание эксперта',
        positionX: 0,
        positionY: 0,
        scale: 115,
        badgeIcon: '',
        badgePositionX: 85,  // ДОБАВИТЬ
        badgePositionY: 85,  // ДОБАВИТЬ
        bgColor: '#0f172a',
        textColor: '#e5e7eb',
        nameColor: '#f9fafb',
        titleColor: '#9ca3af',
        renderedExpert: null
    },

     important: {
        text: 'Важная информация для участников',
        icon: '',
        textColor: '#e5e7eb',
        borderColor: '#a855f7',
        renderedIcon: null,
        padding: 16,
        fontSize: 13,
        lineHeight: 1,
        fontFamily: 'rt-light',
        customFontFamily: '',
        borderRadius: 16
    },

    divider: {
        color: '#1f2937',
        height: 1
    },

    image: {
        src: '',
        alt: 'Изображение',
        width: '100%',
        align: 'center',
        renderedImage: null,
        renderedWidth: null,
        renderedHeight: null
    },

    spacer: {
        height: 32
    }
};

// === ОПЦИИ ДЛЯ SELECT ===

const SELECT_OPTIONS = {
    align: [
        { value: 'left', label: 'По левому краю' },
        { value: 'center', label: 'По центру' },
        { value: 'right', label: 'По правому краю' }
    ],

    fontWeight: [
        { value: 300, label: 'Light' },
        { value: 400, label: 'Regular' },
        { value: 600, label: 'Semi-Bold' },
        { value: 700, label: 'Bold' }
    ],

    textFontFamily: [
        // { value: 'default', label: 'По умолчанию' },
        { value: 'rt-regular', label: 'Rostelecom Regular' },
        { value: 'rt-medium', label: 'Rostelecom Medium' },
        { value: 'rt-bold', label: 'Rostelecom Bold' },
        { value: 'rt-light', label: 'Rostelecom Light' },
        // { value: 'custom', label: 'Свой шрифт (CSS-имя)' }
    ],
};



// === API НАСТРОЙКИ ===

const API_CONFIG = {
    OUTLOOK_SERVER_URL: 'http://localhost:5000/create-outlook-draft',
    DEFAULT_SUBJECT: 'Новое письмо из конструктора'
};

// === СТИЛИ ДЛЯ EMAIL ===

const EMAIL_STYLES = {
    BODY_BG: '#111111',
    TEXT_COLOR: '#f9fafb',
    TABLE_WIDTH: 600,
    FONT_FAMILY: "'RostelecomBasis-Regular', Arial, sans-serif"
};
