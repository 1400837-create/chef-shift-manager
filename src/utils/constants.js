export const STRATEGIC_CATEGORIES = [
  { key: 'meat', label: 'Мясо' },
  { key: 'wine', label: 'Вино' },
  { key: 'beverages', label: 'Напитки' },
  { key: 'base', label: 'Базовые продукты' },
]

export const TASK_CATEGORIES = [
  { key: 'prep', label: 'Подготовка продуктов' },
  { key: 'cooking', label: 'Приготовление' },
  { key: 'cleaning', label: 'Уборка' },
]

export const DAILY_CLEANING_ITEMS = [
  'Рабочие поверхности вымыты и продезинфицированы',
  'Плита / индукция очищена',
  'Разделочные доски вымыты и убраны',
  'Ножи вымыты, высушены и убраны на место',
  'Мусорные баки очищены, мешки заменены',
  'Полы на кухне вымыты',
  'Раковины и мойки очищены',
  'Холодильники протёрты снаружи, температура проверена',
]

export const WEEKLY_CLEANING_ITEMS = [
  'Духовой шкаф / пароконвектомат — глубокая чистка',
  'Вытяжка и жировые фильтры очищены',
  'Холодильники — разморозка и мытьё внутри',
  'Морозильные камеры — проверка наледи, мытьё',
  'Полки и стеллажи сухого склада протёрты',
  'Плитка на стенах и швы очищены',
  'Сливные трапы и канализация промыты',
  'Инвентарь (венчики, лопатки и т.д.) проверен на состояние',
  'Общий осмотр состояния кухни с Küchenleiterin',
]

export const INVENTORY_AUDIT_ZONES = [
  {
    key: 'fridges',
    label: 'Холодильники',
    items: [
      'Молочные продукты — количество и сроки',
      'Мясо и рыба — количество и сроки',
      'Овощи и зелень — свежесть',
      'Готовые продукты / заготовки — маркировка',
      'Соусы и полуфабрикаты — сроки годности',
      'Температура холодильников зафиксирована',
    ],
  },
  {
    key: 'freezers',
    label: 'Морозильные камеры',
    items: [
      'Мясо — количество и маркировка',
      'Рыба и морепродукты — количество и маркировка',
      'Полуфабрикаты — количество',
      'Наледь / состояние камеры проверено',
      'Температура морозильников зафиксирована',
    ],
  },
  {
    key: 'dry',
    label: 'Сухой склад',
    items: [
      'Крупы, мука, специи — количество и сроки',
      'Консервы — сроки годности',
      'Масла и уксусы — количество',
      'Упаковочные материалы — наличие',
      'Чистящие средства (хранение отдельно от продуктов)',
    ],
  },
]

export const RECEIPT_CATEGORIES = [
  { key: 'vegetables', label: 'Овощи' },
  { key: 'fruits', label: 'Фрукты' },
  { key: 'other', label: 'Прочие текущие закупки' },
]

export const LEFTOVER_ACTIONS = [
  { key: 'storage', label: 'Хранение' },
  { key: 'freezing', label: 'Заморозка' },
  { key: 'disposal', label: 'Утилизация по согласованию' },
]

// Legacy fixed slots — kept only to read menu days saved before courses
// became a free-form, addable list (see MenuPlanner.jsx / coursesForDay).
export const MENU_SLOTS_LEGACY = [
  { key: 'soup', label: 'Суп' },
  { key: 'main', label: 'Горячее' },
  { key: 'side', label: 'Гарнир' },
  { key: 'salad', label: 'Салат' },
]

// Default courses seeded for a freshly-opened day. Editable and extendable —
// tap "Добавить блюдо" for more when 5 isn't enough that day.
export const DEFAULT_MENU_COURSES = ['Суп', 'Горячее', 'Гарнир', 'Салат', 'Напиток']

export const KUCHENLEITERIN_EMAIL_KEY = 'kuchenleiterinEmail'

// Рубрика — a different axis from "zone" (zone = where it's physically
// stored; category = what kind of product it is), used for grouping/sorting
// the catalog and balances.
export const PRODUCT_CATEGORIES = [
  { key: 'meat', label: 'Мясо' },
  { key: 'poultry', label: 'Птица' },
  { key: 'vegetables', label: 'Овощи' },
  { key: 'fruits', label: 'Фрукты' },
  { key: 'dry', label: 'Бакалея' },
  { key: 'spices', label: 'Специи' },
  { key: 'other', label: 'Другое' },
]

// Starter product nomenclature — loaded on demand (button in Склад →
// Каталог), not auto-injected, so it never clobbers a catalog the user
// already curated. zone matches INVENTORY_AUDIT_ZONES keys, category
// matches PRODUCT_CATEGORIES keys above.
export const DEFAULT_NOMENCLATURE = [
  // Мясо
  { name: 'Говядина', unit: 'кг', zone: 'freezers', category: 'meat' },
  { name: 'Свинина', unit: 'кг', zone: 'freezers', category: 'meat' },
  { name: 'Баранина', unit: 'кг', zone: 'freezers', category: 'meat' },
  { name: 'Телятина', unit: 'кг', zone: 'freezers', category: 'meat' },
  { name: 'Фарш говяжий', unit: 'кг', zone: 'freezers', category: 'meat' },
  { name: 'Фарш свиной', unit: 'кг', zone: 'freezers', category: 'meat' },
  { name: 'Фарш смешанный', unit: 'кг', zone: 'freezers', category: 'meat' },
  // Курица и части
  { name: 'Курица (тушка)', unit: 'кг', zone: 'freezers', category: 'poultry' },
  { name: 'Куриное филе (грудка)', unit: 'кг', zone: 'freezers', category: 'poultry' },
  { name: 'Куриное бедро', unit: 'кг', zone: 'freezers', category: 'poultry' },
  { name: 'Куриная голень', unit: 'кг', zone: 'freezers', category: 'poultry' },
  { name: 'Куриное крыло', unit: 'кг', zone: 'freezers', category: 'poultry' },
  { name: 'Куриная печень', unit: 'кг', zone: 'freezers', category: 'poultry' },
  { name: 'Куриные желудки', unit: 'кг', zone: 'freezers', category: 'poultry' },
  { name: 'Куриные сердечки', unit: 'кг', zone: 'freezers', category: 'poultry' },
  // Индейка и части
  { name: 'Индейка (тушка)', unit: 'кг', zone: 'freezers', category: 'poultry' },
  { name: 'Филе индейки (грудка)', unit: 'кг', zone: 'freezers', category: 'poultry' },
  { name: 'Бедро индейки', unit: 'кг', zone: 'freezers', category: 'poultry' },
  { name: 'Голень индейки', unit: 'кг', zone: 'freezers', category: 'poultry' },
  { name: 'Крыло индейки', unit: 'кг', zone: 'freezers', category: 'poultry' },
  // Овощи
  { name: 'Картофель', unit: 'кг', zone: 'fridges', category: 'vegetables' },
  { name: 'Морковь', unit: 'кг', zone: 'fridges', category: 'vegetables' },
  { name: 'Лук репчатый', unit: 'кг', zone: 'fridges', category: 'vegetables' },
  { name: 'Чеснок', unit: 'кг', zone: 'fridges', category: 'vegetables' },
  { name: 'Капуста белокочанная', unit: 'кг', zone: 'fridges', category: 'vegetables' },
  { name: 'Капуста цветная', unit: 'кг', zone: 'fridges', category: 'vegetables' },
  { name: 'Свёкла', unit: 'кг', zone: 'fridges', category: 'vegetables' },
  { name: 'Огурцы', unit: 'кг', zone: 'fridges', category: 'vegetables' },
  { name: 'Помидоры', unit: 'кг', zone: 'fridges', category: 'vegetables' },
  { name: 'Перец болгарский', unit: 'кг', zone: 'fridges', category: 'vegetables' },
  { name: 'Кабачки', unit: 'кг', zone: 'fridges', category: 'vegetables' },
  { name: 'Баклажаны', unit: 'кг', zone: 'fridges', category: 'vegetables' },
  { name: 'Тыква', unit: 'кг', zone: 'fridges', category: 'vegetables' },
  { name: 'Редис', unit: 'кг', zone: 'fridges', category: 'vegetables' },
  { name: 'Укроп', unit: 'кг', zone: 'fridges', category: 'vegetables' },
  { name: 'Петрушка', unit: 'кг', zone: 'fridges', category: 'vegetables' },
  { name: 'Салат листовой', unit: 'кг', zone: 'fridges', category: 'vegetables' },
  // Фрукты
  { name: 'Яблоки', unit: 'кг', zone: 'fridges', category: 'fruits' },
  { name: 'Бананы', unit: 'кг', zone: 'fridges', category: 'fruits' },
  { name: 'Апельсины', unit: 'кг', zone: 'fridges', category: 'fruits' },
  { name: 'Лимоны', unit: 'кг', zone: 'fridges', category: 'fruits' },
  { name: 'Груши', unit: 'кг', zone: 'fridges', category: 'fruits' },
  { name: 'Виноград', unit: 'кг', zone: 'fridges', category: 'fruits' },
  // Бакалея
  { name: 'Мука пшеничная', unit: 'кг', zone: 'dry', category: 'dry' },
  { name: 'Рис', unit: 'кг', zone: 'dry', category: 'dry' },
  { name: 'Гречка', unit: 'кг', zone: 'dry', category: 'dry' },
  { name: 'Макароны', unit: 'кг', zone: 'dry', category: 'dry' },
  { name: 'Сахар', unit: 'кг', zone: 'dry', category: 'dry' },
  { name: 'Соль', unit: 'кг', zone: 'dry', category: 'dry' },
  { name: 'Масло растительное', unit: 'л', zone: 'dry', category: 'dry' },
  { name: 'Овсянка', unit: 'кг', zone: 'dry', category: 'dry' },
  { name: 'Манка', unit: 'кг', zone: 'dry', category: 'dry' },
  { name: 'Чечевица', unit: 'кг', zone: 'dry', category: 'dry' },
  { name: 'Горох', unit: 'кг', zone: 'dry', category: 'dry' },
  { name: 'Крахмал', unit: 'кг', zone: 'dry', category: 'dry' },
  { name: 'Томаты консервированные', unit: 'кг', zone: 'dry', category: 'dry' },
  // Специи
  { name: 'Перец чёрный молотый', unit: 'г', zone: 'dry', category: 'spices' },
  { name: 'Перец душистый', unit: 'г', zone: 'dry', category: 'spices' },
  { name: 'Паприка', unit: 'г', zone: 'dry', category: 'spices' },
  { name: 'Куркума', unit: 'г', zone: 'dry', category: 'spices' },
  { name: 'Кориандр молотый', unit: 'г', zone: 'dry', category: 'spices' },
  { name: 'Зира', unit: 'г', zone: 'dry', category: 'spices' },
  { name: 'Лавровый лист', unit: 'г', zone: 'dry', category: 'spices' },
  { name: 'Корица', unit: 'г', zone: 'dry', category: 'spices' },
  { name: 'Чеснок сушёный', unit: 'г', zone: 'dry', category: 'spices' },
  { name: 'Орегано', unit: 'г', zone: 'dry', category: 'spices' },
  { name: 'Базилик сушёный', unit: 'г', zone: 'dry', category: 'spices' },
  { name: 'Прованские травы', unit: 'г', zone: 'dry', category: 'spices' },
]
