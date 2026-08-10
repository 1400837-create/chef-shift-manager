import { formatQtyForDisplay } from './unitDisplay'

// Rough average retail weight (grams) per count-based unit (шт/уп/банка/
// пучок/бутылка/горшок) — display-only estimate, never stored and never
// used in any real calculation. Real weight varies by supplier; this only
// exists so a "≈ X кг" hint can still be shown next to a count, the same
// way г/мл already gets a friendly кг/л hint above 1000. Keyed by a lowercase
// prefix of the catalog name (catalog names are "Russian (German)" — the
// prefix stops before the parenthetical so it still matches regardless of
// the German translation's exact wording).
const APPROX_WEIGHTS_G = {
  'авокадо hass': 200,
  'ананас': 1500,
  'арбуз': 5000,
  'артишок': 150,
  'багет': 250,
  'бейгл': 90,
  'ваниль стручок': 3,
  'гефилте фиш готовый': 80,
  'дорадо': 350,
  'дыня канталупа': 1200,
  'дыня медовая': 1500,
  'киви': 80,
  'кнейдлах готовые': 40,
  'кокос': 500,
  'кукуруза початок': 300,
  'лаваш': 150,
  'манго': 300,
  'мускатный орех целый': 5,
  'пассата томатная': 690,
  'перепел тушка': 120,
  'перепелиные яйца': 12,
  'помело': 1200,
  'салат айсберг': 600,
  'салат латук': 300,
  'салат радичио': 250,
  'салат ромэн': 400,
  'сибас': 350,
  'томатная паста': 200,
  'форель копчёная': 300,
  'хала': 500,
  'хлеб белый': 500,
  'хлеб ржаной': 500,
  'хлеб цельнозерновой': 500,
  'хурма': 150,
  'чиабатта': 250,
  'яйца куриные l': 63,
  'яйца куриные m': 58,
  'яйца утиные': 90,

  'руккола': 75,
  'салат корн': 100,
  'салат микс': 150,
  'сельдерей стеблевой': 500,
  'шпинат бэби': 150,
  'ванильный сахар': 8,
  'дрожжи свежие': 42,
  'дрожжи сухие': 7,
  'каннеллони': 250,
  'лазанья листы': 500,
  'маца листы': 300,
  'пумперникель': 500,
  'разрыхлитель': 16,
  'смесь для кнейдлах': 200,
  'сода пищевая': 20,
  'тесто слоёное': 275,
  'тесто фило': 400,
  'тортилья пшеничная': 320,
  '[декор] гриссини': 125,
  '[декор] золотая пищевая пыль': 2,
  '[декор] микро-базилик': 20,
  '[декор] ростки гороха': 50,
  '[декор] ростки редиса': 50,
  '[декор] съедобные цветы': 10,

  'лук зелёный': 100,
  'щавель': 100,
  'свежая мята': 25,
  'свежая петрушка': 50,
  'свежий кориандр': 50,
  'свежий любисток': 50,
  'свежий орегано': 20,
  'свежий розмарин': 25,
  'свежий тимьян': 20,
  'свежий укроп': 40,
  'свежий шалфей': 20,
  'свежий шнитт-лук': 30,
  'свежий эстрагон': 20,

  'горошек консервированный': 400,
  'каперсы': 100,
  'кукуруза консервированная': 340,
  'сардины консервированные': 125,
  'фасоль консервированная белая': 400,
  'песто зелёное': 190,

  'зелень свежая': 50,
  'укроп/петрушка свежие': 50,
  'корень петрушки': 60,

  'свежий базилик': 30,
}

const COUNT_UNITS = new Set(['шт', 'шт.', 'уп.', 'банка', 'пучок', 'бутылка', 'горшок'])

function weightPerUnit(productName) {
  const key = (productName || '').trim().toLowerCase()
  let best = null
  for (const prefix of Object.keys(APPROX_WEIGHTS_G)) {
    if (key.startsWith(prefix) && (!best || prefix.length > best.length)) best = prefix
  }
  return best ? APPROX_WEIGHTS_G[best] : null
}

// Returns "≈ 1.2 кг" for a count-based product with a known average weight,
// or null if the unit isn't count-based or there's no estimate for it.
export function formatApproxWeight(qty, productName, unit) {
  const u = (unit || '').trim().toLowerCase()
  if (!COUNT_UNITS.has(u)) return null
  const perUnit = weightPerUnit(productName)
  if (perUnit == null) return null
  const n = Number(qty)
  if (!Number.isFinite(n) || n <= 0) return null
  return `≈ ${formatQtyForDisplay(String(Math.round(n * perUnit)), 'г')}`
}
