export const NUTRIENT_META = [
  { key: 'calories', label: 'Calorías', unit: 'kcal' },
  { key: 'protein', label: 'Proteína', unit: 'g' },
  { key: 'carbs', label: 'Carbohidratos', unit: 'g' },
  { key: 'fat', label: 'Grasas', unit: 'g' },
  { key: 'fiber', label: 'Fibra', unit: 'g' },
  { key: 'sodium', label: 'Sodio', unit: 'g' },
  { key: 'calcium', label: 'Calcio', unit: 'g' },
  { key: 'iron', label: 'Hierro', unit: 'g' },
  { key: 'potassium', label: 'Potasio', unit: 'g' },
  { key: 'vitaminC', label: 'Vitamina C', unit: 'g' },
]

export const DAY_TEMPLATES = [
  { key: 'monday', label: 'Lunes' },
  { key: 'tuesday', label: 'Martes' },
  { key: 'wednesday', label: 'Miércoles' },
  { key: 'thursday', label: 'Jueves' },
  { key: 'friday', label: 'Viernes' },
  { key: 'saturday', label: 'Sábado' },
  { key: 'sunday', label: 'Domingo' },
]

export const MEAL_TEMPLATES = [
  { key: 'breakfast', label: 'Desayuno' },
  { key: 'morning_snack', label: 'Merienda AM' },
  { key: 'lunch', label: 'Almuerzo' },
  { key: 'afternoon_snack', label: 'Merienda PM' },
  { key: 'dinner', label: 'Cena' },
]

function createEmptyNutrients() {
  return NUTRIENT_META.reduce((accumulator, nutrient) => {
    accumulator[nutrient.key] = 0
    return accumulator
  }, {})
}

function normalizeFoodItem(item) {
  return {
    code: item.code || crypto.randomUUID(),
    name: item.name || 'Alimento sin nombre',
    brand: item.brand || '',
    grams: Number(item.grams || 100),
    nutrientsPer100g: {
      ...createEmptyNutrients(),
      ...(item.nutrientsPer100g || {}),
    },
  }
}

function createMealFromTemplate(template, meal) {
  return {
    key: template.key,
    label: meal?.label || template.label,
    items: Array.isArray(meal?.items) ? meal.items.map(normalizeFoodItem) : [],
  }
}

export function createEmptyWeekPlan() {
  return {
    days: DAY_TEMPLATES.map((day) => ({
      key: day.key,
      label: day.label,
      meals: MEAL_TEMPLATES.map((meal) => createMealFromTemplate(meal)),
    })),
  }
}

export function normalizeWeekPlan(weekPlan) {
  const sourceDays = Array.isArray(weekPlan?.days) ? weekPlan.days : []

  return {
    days: DAY_TEMPLATES.map((dayTemplate) => {
      const existingDay = sourceDays.find((day) => day.key === dayTemplate.key || day.label === dayTemplate.label)
      const sourceMeals = Array.isArray(existingDay?.meals) ? existingDay.meals : []

      return {
        key: dayTemplate.key,
        label: existingDay?.label || dayTemplate.label,
        meals: MEAL_TEMPLATES.map((mealTemplate) => {
          const existingMeal = sourceMeals.find(
            (meal) => meal.key === mealTemplate.key || meal.label === mealTemplate.label,
          )
          return createMealFromTemplate(mealTemplate, existingMeal)
        }),
      }
    }),
  }
}

export function createEmptyTargets() {
  return NUTRIENT_META.reduce((accumulator, nutrient) => {
    accumulator[nutrient.key] = ''
    return accumulator
  }, {})
}

export function scaleNutrients(nutrientsPer100g = {}, grams = 0) {
  const scaled = {}
  const ratio = Number(grams || 0) / 100

  for (const nutrient of NUTRIENT_META) {
    scaled[nutrient.key] = Number(nutrientsPer100g[nutrient.key] || 0) * ratio
  }

  return scaled
}

export function sumNutrients(entries = []) {
  return entries.reduce((accumulator, entry) => {
    for (const nutrient of NUTRIENT_META) {
      accumulator[nutrient.key] += Number(entry[nutrient.key] || 0)
    }

    return accumulator
  }, createEmptyNutrients())
}

export function getMealTotals(meal) {
  return sumNutrients((meal?.items || []).map((item) => scaleNutrients(item.nutrientsPer100g, item.grams)))
}

export function getDayTotals(day) {
  return sumNutrients((day?.meals || []).map(getMealTotals))
}

export function getWeekAverageTotals(weekPlan) {
  const days = Array.isArray(weekPlan?.days) ? weekPlan.days : []
  if (!days.length) {
    return createEmptyNutrients()
  }

  const totals = sumNutrients(days.map(getDayTotals))
  return NUTRIENT_META.reduce((accumulator, nutrient) => {
    accumulator[nutrient.key] = totals[nutrient.key] / days.length
    return accumulator
  }, createEmptyNutrients())
}

export function formatNumber(value, digits = 1) {
  const numericValue = Number(value || 0)
  if (!Number.isFinite(numericValue)) {
    return '0'
  }

  return numericValue.toFixed(digits).replace(/\.0$/, '')
}

export function buildDietMessage(patientName, planner) {
  const targets = planner.targets || {}
  const lines = [
    `Hola ${patientName || ''}, te comparto tu plan semanal.`,
    '',
    `Objetivo diario: ${targets.calories || 'N/D'} kcal | Proteína ${targets.protein || 'N/D'} g | Carbohidratos ${targets.carbs || 'N/D'} g | Grasas ${targets.fat || 'N/D'} g`,
    '',
  ]

  for (const day of planner.weekPlan.days) {
    lines.push(`*${day.label}*`)

    for (const meal of day.meals) {
      const items = meal.items.map((item) => `${item.name} (${item.grams} g)`)
      lines.push(`${meal.label}: ${items.join(', ') || 'Sin alimentos asignados'}`)
    }

    lines.push('')
  }

  if (planner.notes) {
    lines.push('Notas:')
    lines.push(planner.notes)
  }

  return lines.join('\n').trim()
}
