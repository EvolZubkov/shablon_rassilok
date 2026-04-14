// definitions.js - Все константы и настройки проекта

// === ГРАФИЧЕСКИЕ РЕСУРСЫ ===
// Статические данные ниже — FALLBACK на случай если config.json недоступен
// (нет сети, нет сетевого диска). ConfigLoader перезапишет их при загрузке.

let BANNERS = [];

let IMPORTANT_ICONS = [
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

let EXPERT_BADGE_ICONS = [
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

let BULLET_TYPES = [
    { id: 'circle',  src: 'bullets/Буллет.png',   label: 'Буллет' },
    { id: 'circle2', src: 'bullets/Буллет 2.png', label: 'Буллет 2' },
    { id: 'circle3', src: 'bullets/Буллет 3.png', label: 'Буллет 3' },
    { id: 'circle4', src: 'bullets/Буллет 4.png', label: 'Буллет 4' },
];

let BUTTON_ICONS = [
    { id: 'none',     src: '',                        label: 'Без иконки' },
    { id: 'download', src: 'button-icons/Знак.png',  label: 'Лого' },
];

let DIVIDER_IMAGES = [];


// === НАСТРОЙКИ РЕНДЕРИНГА ===

const CANVAS_CONFIG = {
    LOGICAL_WIDTH: 600,
    SCALE_FACTOR: 2,
    get REAL_WIDTH() { return this.LOGICAL_WIDTH * this.SCALE_FACTOR; }
};

const BANNER_KEYS = [
    'bannerHeight', 'rightImageMode',
    'backgroundColor', 'leftBlockColor',

    'gradientEnabled',
    'gradientUiExpanded',
    'gradientType',
    'gradientStops',
    'gradientAngle',
    'gradientCenterX',
    'gradientCenterY',
    'gradientBalance',
    'backgroundGradientEnabled',
    'backgroundGradientStops',
    'backgroundGradientAngle',
    'backgroundGradientCenterX',
    'backgroundGradientCenterY',
    'backgroundGradientBalance',
    'leftBlockGradientEnabled',
    'leftBlockGradientStops',
    'leftBlockGradientAngle',
    'leftBlockGradientCenterX',
    'leftBlockGradientCenterY',
    'leftBlockGradientBalance',

    'bgImage', 'bgImageX', 'bgImageY', 'bgImageRotate', 'bgImageScale',
    'leftBlockImage', 'leftBlockImageX', 'leftBlockImageY', 'leftBlockImageRotate', 'leftBlockImageScale',
    'rightImage', 'rightImageCustom', 'rightImageX', 'rightImageY', 'rightImageRotate', 'rightImageScale',
    'logo', 'logoCustom', 'logoX', 'logoY', 'logoScale',
    'textElements', 'nextTextId'
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
        // Высота баннера
        bannerHeight: 250,
        // Основные цвета
        backgroundColor: '#7700FF',
        gradientEnabled: false,
        gradientUiExpanded: true,
        gradientType: 'linear',
        gradientStops: [
            { id: 1, color: '#9466FF', opacity: 100, position: 0 },
            { id: 2, color: '#7505FF', opacity: 100, position: 100 }
        ],
        gradientAngle: 24,
        gradientCenterX: 42,
        gradientCenterY: 38,
        gradientBalance: 120,
        backgroundGradientEnabled: false,
        backgroundGradientStops: [
            { id: 1, color: '#9466FF', opacity: 100, position: 0 },
            { id: 2, color: '#7505FF', opacity: 100, position: 100 }
        ],
        backgroundGradientAngle: 24,
        backgroundGradientCenterX: 42,
        backgroundGradientCenterY: 38,
        backgroundGradientBalance: 120,
        leftBlockGradientEnabled: false,
        leftBlockGradientStops: [
            { id: 1, color: '#9466FF', opacity: 100, position: 0 },
            { id: 2, color: '#7505FF', opacity: 100, position: 100 }
        ],
        leftBlockGradientAngle: 24,
        leftBlockGradientCenterX: 42,
        leftBlockGradientCenterY: 38,
        leftBlockGradientBalance: 120,
        leftBlockColor: '#1D2533',
        rightImageMode: 'mask', // 'mask' | 'rounded'
        rightRoundedRadius: 32,

        bgImage: '',
        bgImageX: 0,
        bgImageY: 0,
        bgImageRotate: 0,
        bgImageScale: 100,
        leftBlockImage: '',
        leftBlockImageX: 0,
        leftBlockImageY: 0,
        leftBlockImageRotate: 0,
        leftBlockImageScale: 100,

        // Правая картинка
        rightImage: '',
        rightImageCustom: '',
        rightImageX: 0,           // смещение X (-100 до 100)
        rightImageY: 0,           // смещение Y (-100 до 100)
        rightImageRotate: 0,      // дополнительный поворот (-45 до 45)
        rightImageScale: 100,     // масштаб картинки (50 до 150)

        // Логотип
        logo: '',
        logoCustom: '',
        logoX: 24,
        logoY: 24,
        logoScale: 100,

        // Текстовые элементы
        textElements: [
            {
                id: 1,
                text: 'Заголовок баннера',
                x: 24,
                y: 180,
                fontSize: 28,
                fontFamily: 'rt-regular',
                color: '#ffffff',
                iconEnabled: false,
                icon: '',
                iconCustom: '',
                badgeEnabled: false,
                badgeColor: '#a855f7',
                badgeRadius: 25,
                badgePaddingX: 12,
                badgePaddingY: 4
            }
        ],
        nextTextId: 2,
        renderedBanner: null
    },

    text: {
        content: 'Введите текст здесь. Можно использовать несколько строк.',
        fontSize: 14,
        lineHeight: 1.15,
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
        color: '#ff4f12',
        icon: '',
        align: 'center'
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
        variant: 'full',
        align: 'center',   // 'left' | 'center' | 'right'
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
        renderedExpert: null
    },

    important: {
        text: 'Важная информация для участников',
        icon: '',
        textColor: '#e5e7eb',
        borderColor: '#a855f7',
        renderedIcon: null,
        padding: 16,
        fontSize: 14,
        lineHeight: 1.15,
        fontFamily: 'rt-light',
        customFontFamily: '',
        borderRadius: 16
    },

    divider: {
        image: '',            // src картинки-разделителя
        customImage: ''       // загруженная пользователем картинка
    },

    image: {
        src: '',
        alt: 'Изображение',
        width: '100%',
        align: 'center',
        borderRadiusMode: 'all',   // 'all' или 'each'
        borderRadiusAll: 0,        // для режима 'all'
        borderRadiusTL: 0,         // top-left
        borderRadiusTR: 0,         // top-right
        borderRadiusBR: 0,         // bottom-right
        borderRadiusBL: 0,         // bottom-left
        aspectRatio: 'original',
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
    OUTLOOK_SERVER_URL: '/create-outlook-draft',  // ← УБРАЛИ http://localhost:5000
    DEFAULT_SUBJECT: 'Новое письмо из конструктора'
};

// === СТИЛИ ДЛЯ EMAIL ===

const EMAIL_STYLES = {
    BODY_BG: '#111111',
    TEXT_COLOR: '#f9fafb',
    TABLE_WIDTH: 600,
    FONT_FAMILY: "'RostelecomBasis-Regular', Arial, sans-serif"
};
