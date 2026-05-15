import { useEffect, useMemo, useState } from 'react'
import {
  DAY_TEMPLATES,
  MEAL_TEMPLATES,
  NUTRIENT_META,
  buildDietMessage,
  createEmptyTargets,
  createEmptyWeekPlan,
  formatNumber,
  getDayTotals,
  getMealTotals,
  getWeekAverageTotals,
  normalizeWeekPlan,
} from '../lib/nutrition'

const MACRO_FACTORS = {
  protein: 4,
  carbs: 4,
  fat: 9,
}

const MACRO_KEYS = Object.keys(MACRO_FACTORS)

function getLatestByDate(items = [], field = 'created_at') {
  return [...items].sort((left, right) => new Date(right[field] || 0) - new Date(left[field] || 0))[0] || null
}

function numericStringObject(source = {}) {
  const targets = createEmptyTargets()

  for (const nutrient of NUTRIENT_META) {
    if (source[nutrient.key] !== undefined && source[nutrient.key] !== null) {
      targets[nutrient.key] = String(source[nutrient.key])
    }
  }

  return targets
}

function createPlannerState(patient) {
  const latestDiet = getLatestByDate(patient?.diets, 'created_at')
  const latestConsultation = getLatestByDate(patient?.consultations, 'created_at')
  const targets = numericStringObject(
    latestDiet?.meals?.targets || latestConsultation?.objectives?.targets || latestConsultation?.targets || {},
  )
  const weeklyPlanSource = latestDiet?.meals?.week_plan || latestConsultation?.weekly_plan || createEmptyWeekPlan()
  const metrics = latestConsultation?.metrics || {}
  const storedMacroPercentages =
    latestDiet?.meals?.targets?.macro_percentages ||
    latestConsultation?.objectives?.targets?.macro_percentages ||
    deriveMacroPercentages(targets)

  return {
    title: latestDiet?.title || `Plan semanal ${patient?.full_name || ''}`.trim(),
    summary: latestDiet?.summary || latestConsultation?.summary || '',
    starts_on: latestDiet?.starts_on || '',
    ends_on: latestDiet?.ends_on || '',
    notes: latestDiet?.notes || latestConsultation?.notes || '',
    primaryGoal: latestConsultation?.objectives?.primary_goal || '',
    targets,
    macroPercentages: {
      protein: storedMacroPercentages.protein ? String(storedMacroPercentages.protein) : '',
      carbs: storedMacroPercentages.carbs ? String(storedMacroPercentages.carbs) : '',
      fat: storedMacroPercentages.fat ? String(storedMacroPercentages.fat) : '',
    },
    metrics: {
      weight: metrics.weight ? String(metrics.weight) : '',
      body_fat_percentage: metrics.body_fat_percentage ? String(metrics.body_fat_percentage) : '',
      waist_cm: metrics.waist_cm ? String(metrics.waist_cm) : '',
      observations: metrics.observations || '',
    },
    weekPlan: normalizeWeekPlan(weeklyPlanSource),
  }
}

function parseNumberOrNull(value) {
  if (value === '' || value === null || value === undefined) {
    return null
  }

  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : null
}

function formatEditableNumber(value, digits = 1) {
  if (value === '' || value === null || value === undefined) {
    return ''
  }

  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) {
    return ''
  }

  return numericValue.toFixed(digits).replace(/\.0$/, '')
}

function deriveMacroPercentages(targets) {
  const calories = Number(targets?.calories || 0)
  const percentages = {
    protein: '',
    carbs: '',
    fat: '',
  }

  if (calories <= 0) {
    return percentages
  }

  for (const macroKey of MACRO_KEYS) {
    const grams = Number(targets?.[macroKey] || 0)
    const percentage = ((grams * MACRO_FACTORS[macroKey]) / calories) * 100
    percentages[macroKey] = grams > 0 ? formatEditableNumber(percentage, 1) : ''
  }

  return percentages
}

function clampPercentage(value) {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.max(0, Math.min(100, value))
}

function toRoundedTenth(value) {
  return Math.round(value * 10) / 10
}

function buildBalancedPercentages(currentPercentages, changedKey, requestedValue) {
  const nextChangedValue = clampPercentage(toRoundedTenth(requestedValue))
  const otherKeys = MACRO_KEYS.filter((macroKey) => macroKey !== changedKey)
  const otherValues = otherKeys.map((macroKey) => clampPercentage(Number(currentPercentages?.[macroKey] || 0)))
  const remaining = Math.max(0, 100 - nextChangedValue)
  const currentOthersTotal = otherValues.reduce((total, value) => total + value, 0)

  let redistributedOthers

  if (currentOthersTotal > 0) {
    redistributedOthers = otherValues.map((value) => (value / currentOthersTotal) * remaining)
  } else {
    redistributedOthers = otherKeys.map(() => remaining / otherKeys.length)
  }

  const rounded = {}
  rounded[changedKey] = nextChangedValue

  let assigned = nextChangedValue
  otherKeys.forEach((macroKey, index) => {
    if (index === otherKeys.length - 1) {
      rounded[macroKey] = toRoundedTenth(100 - assigned)
    } else {
      rounded[macroKey] = toRoundedTenth(redistributedOthers[index])
      assigned += rounded[macroKey]
    }
  })

  return {
    protein: formatEditableNumber(rounded.protein, 1),
    carbs: formatEditableNumber(rounded.carbs, 1),
    fat: formatEditableNumber(rounded.fat, 1),
  }
}

const MEAL_SUGGESTION_QUERIES = {
  breakfast: 'huevo',
  morning_snack: 'fruta',
  lunch: 'pollo',
  afternoon_snack: 'yogurt',
  dinner: 'atun',
}

export default function PlannerPage({
  selectedPatient,
  onSaveDiet,
  onSaveConsultation,
  onSearchFoods,
  onSendLatestDiet,
}) {
  const [planner, setPlanner] = useState(() => createPlannerState(null))
  const [activeDayKey, setActiveDayKey] = useState(DAY_TEMPLATES[0].key)
  const [activeMealKey, setActiveMealKey] = useState(MEAL_TEMPLATES[0].key)
  const [foodQuery, setFoodQuery] = useState('')
  const [foodResults, setFoodResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)

  useEffect(() => {
    setPlanner(createPlannerState(selectedPatient))
  }, [selectedPatient?.id])

  useEffect(() => {
    if (!selectedPatient) {
      return
    }

    loadSuggestedFoods(activeMealKey)
  }, [selectedPatient?.id])

  const activeDay = useMemo(
    () => planner.weekPlan.days.find((day) => day.key === activeDayKey) || planner.weekPlan.days[0],
    [planner.weekPlan.days, activeDayKey],
  )
  const activeMeal = activeDay?.meals.find((meal) => meal.key === activeMealKey) || activeDay?.meals[0]
  const activeMealTotals = useMemo(() => getMealTotals(activeMeal), [activeMeal])
  const weeklyAverage = useMemo(() => getWeekAverageTotals(planner.weekPlan), [planner.weekPlan])
  const macroPercentageTotal = useMemo(
    () => MACRO_KEYS.reduce((total, macroKey) => total + Number(planner.macroPercentages?.[macroKey] || 0), 0),
    [planner.macroPercentages],
  )
  const macroPercentageDelta = useMemo(() => 100 - macroPercentageTotal, [macroPercentageTotal])
  const generatedMessage = useMemo(
    () => buildDietMessage(selectedPatient?.full_name, planner),
    [planner, selectedPatient?.full_name],
  )

  function patchPlanner(field, value) {
    setPlanner((current) => ({ ...current, [field]: value }))
  }

  function patchTargets(field, value) {
    setPlanner((current) => ({
      ...current,
      targets: {
        ...current.targets,
        [field]: value,
      },
    }))
  }

  function updateCaloriesTarget(nextCaloriesValue) {
    setPlanner((current) => {
      if (nextCaloriesValue === '') {
        return {
          ...current,
          targets: {
            ...current.targets,
            calories: '',
          },
        }
      }

      const caloriesNumber = Number(nextCaloriesValue)
      if (!Number.isFinite(caloriesNumber)) {
        return current
      }

      const nextTargets = {
        ...current.targets,
        calories: nextCaloriesValue,
      }

      for (const macroKey of MACRO_KEYS) {
        const percentage = Number(current.macroPercentages?.[macroKey] || 0)
        if (percentage > 0) {
          const grams = (caloriesNumber * (percentage / 100)) / MACRO_FACTORS[macroKey]
          nextTargets[macroKey] = formatEditableNumber(grams, 1)
        }
      }

      return {
        ...current,
        targets: nextTargets,
      }
    })
  }

  function applyBalancedMacroPercentages(nextMacroPercentages, currentTargets) {
    const calories = Number(currentTargets.calories || 0)
    const nextTargets = { ...currentTargets }

    for (const macroKey of MACRO_KEYS) {
      const percentage = Number(nextMacroPercentages[macroKey] || 0)

      if (calories > 0) {
        const grams = (calories * (percentage / 100)) / MACRO_FACTORS[macroKey]
        nextTargets[macroKey] = formatEditableNumber(grams, 1)
      } else {
        nextTargets[macroKey] = currentTargets[macroKey] || ''
      }
    }

    return nextTargets
  }

  function updateMacroPercentage(macroKey, nextPercentageValue) {
    setPlanner((current) => {
      const percentageNumber = Number(nextPercentageValue || 0)
      const nextMacroPercentages = buildBalancedPercentages(
        current.macroPercentages,
        macroKey,
        percentageNumber,
      )
      const nextTargets = applyBalancedMacroPercentages(nextMacroPercentages, current.targets)

      return {
        ...current,
        macroPercentages: nextMacroPercentages,
        targets: nextTargets,
      }
    })
  }

  function updateMacroGrams(macroKey, nextGramsValue) {
    setPlanner((current) => {
      const calories = Number(current.targets.calories || 0)

      if (calories <= 0) {
        return {
          ...current,
          targets: {
            ...current.targets,
            [macroKey]: nextGramsValue,
          },
        }
      }

      const gramsNumber = Number(nextGramsValue || 0)
      const requestedPercentage = ((gramsNumber * MACRO_FACTORS[macroKey]) / calories) * 100
      const nextMacroPercentages = buildBalancedPercentages(
        current.macroPercentages,
        macroKey,
        requestedPercentage,
      )
      const nextTargets = applyBalancedMacroPercentages(nextMacroPercentages, {
        ...current.targets,
        [macroKey]: nextGramsValue,
      })

      return {
        ...current,
        targets: nextTargets,
        macroPercentages: nextMacroPercentages,
      }
    })
  }

  function nudgeMacroPercentage(macroKey, delta) {
    const currentValue = Number(planner.macroPercentages?.[macroKey] || 0)
    updateMacroPercentage(macroKey, String(currentValue + delta))
  }

  function normalizeMacroDistribution() {
    setPlanner((current) => {
      const currentPercentages = current.macroPercentages || {}
      const total = MACRO_KEYS.reduce((sum, macroKey) => sum + Number(currentPercentages[macroKey] || 0), 0)

      let nextMacroPercentages

      if (total > 0) {
        const scaled = {}
        let assigned = 0

        MACRO_KEYS.forEach((macroKey, index) => {
          if (index === MACRO_KEYS.length - 1) {
            scaled[macroKey] = formatEditableNumber(100 - assigned, 1)
          } else {
            const value = toRoundedTenth((Number(currentPercentages[macroKey] || 0) / total) * 100)
            assigned += value
            scaled[macroKey] = formatEditableNumber(value, 1)
          }
        })

        nextMacroPercentages = scaled
      } else {
        nextMacroPercentages = {
          protein: '30',
          carbs: '40',
          fat: '30',
        }
      }

      return {
        ...current,
        macroPercentages: nextMacroPercentages,
        targets: applyBalancedMacroPercentages(nextMacroPercentages, current.targets),
      }
    })
  }

  function patchMetrics(field, value) {
    setPlanner((current) => ({
      ...current,
      metrics: {
        ...current.metrics,
        [field]: value,
      },
    }))
  }

  function patchMealItemsFor(dayKey, mealKey, mutator) {
    setPlanner((current) => ({
      ...current,
      weekPlan: {
        ...current.weekPlan,
        days: current.weekPlan.days.map((day) => {
          if (day.key !== dayKey) {
            return day
          }

          return {
            ...day,
            meals: day.meals.map((meal) => {
              if (meal.key !== mealKey) {
                return meal
              }

              return {
                ...meal,
                items: mutator(meal.items),
              }
            }),
          }
        }),
      },
    }))
  }

  function patchMealItems(mutator) {
    patchMealItemsFor(activeDay.key, activeMeal.key, mutator)
  }

  function createFoodEntry(food, suffix = '') {
    return {
      code: `${food.code || crypto.randomUUID()}${suffix}`,
      name: food.name,
      brand: food.brand || '',
      grams: 100,
      nutrientsPer100g: food.nutrientsPer100g || {},
    }
  }

  function addFoodToMeal(food) {
    patchMealItems((items) => [...items, createFoodEntry(food)])
  }

  function addFoodToWholeWeek(food) {
    setPlanner((current) => ({
      ...current,
      weekPlan: {
        ...current.weekPlan,
        days: current.weekPlan.days.map((day) => ({
          ...day,
          meals: day.meals.map((meal) => {
            if (meal.key !== activeMeal.key) {
              return meal
            }

            return {
              ...meal,
              items: [...meal.items, createFoodEntry(food, `-${day.key}-${meal.key}`)],
            }
          }),
        })),
      },
    }))
  }

  function updateFoodGrams(code, grams) {
    patchMealItems((items) =>
      items.map((item) => (item.code === code ? { ...item, grams: Number(grams || 0) } : item)),
    )
  }

  function removeFood(code) {
    patchMealItems((items) => items.filter((item) => item.code !== code))
  }

  async function loadSuggestedFoods(mealKey) {
    const query = MEAL_SUGGESTION_QUERIES[mealKey] || 'comida saludable'
    setSearchLoading(true)

    try {
      const results = await onSearchFoods(query)
      setFoodResults(results)
    } finally {
      setSearchLoading(false)
    }
  }

  async function activateSlot(dayKey, mealKey) {
    setActiveDayKey(dayKey)
    setActiveMealKey(mealKey)
    setFoodQuery('')
    await loadSuggestedFoods(mealKey)
  }

  async function handleFoodSearch(event) {
    event.preventDefault()
    const query = foodQuery.trim()
    if (!query) {
      return
    }

    setSearchLoading(true)

    try {
      const results = await onSearchFoods(query)
      setFoodResults(results)
    } finally {
      setSearchLoading(false)
    }
  }

  async function handleSaveConsultation() {
    const targets = Object.fromEntries(
      Object.entries(planner.targets).map(([key, value]) => [key, parseNumberOrNull(value)]),
    )

    await onSaveConsultation({
      summary: planner.summary,
      notes: planner.notes,
      objectives: {
        primary_goal: planner.primaryGoal,
        targets: {
          ...targets,
          macro_percentages: {
            protein: parseNumberOrNull(planner.macroPercentages.protein),
            carbs: parseNumberOrNull(planner.macroPercentages.carbs),
            fat: parseNumberOrNull(planner.macroPercentages.fat),
          },
        },
      },
      metrics: {
        weight: parseNumberOrNull(planner.metrics.weight),
        body_fat_percentage: parseNumberOrNull(planner.metrics.body_fat_percentage),
        waist_cm: parseNumberOrNull(planner.metrics.waist_cm),
        observations: planner.metrics.observations || null,
      },
      weekly_plan: planner.weekPlan,
    })
  }

  async function handleSaveDiet() {
    const targets = Object.fromEntries(
      Object.entries(planner.targets).map(([key, value]) => [key, parseNumberOrNull(value)]),
    )

    await onSaveDiet({
      title: planner.title,
      summary: planner.summary,
      starts_on: planner.starts_on || null,
      ends_on: planner.ends_on || null,
      notes: planner.notes,
      calories_target: parseNumberOrNull(planner.targets.calories),
      targets: {
        ...targets,
        macro_percentages: {
          protein: parseNumberOrNull(planner.macroPercentages.protein),
          carbs: parseNumberOrNull(planner.macroPercentages.carbs),
          fat: parseNumberOrNull(planner.macroPercentages.fat),
        },
      },
      meals: {
        days: planner.weekPlan.days,
      },
      week_plan: planner.weekPlan,
      generated_message: generatedMessage,
    })
  }

  if (!selectedPatient) {
    return (
      <section className="panel empty-state">
        <h2>Planificador semanal</h2>
        <p className="empty-copy">Selecciona un paciente para construir su plan nutricional.</p>
      </section>
    )
  }

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Consulta y dieta</p>
            <h2>Plan semanal para {selectedPatient.full_name || 'paciente'}</h2>
          </div>
          <div className="button-row">
            <button className="secondary-button" onClick={() => window.print()}>
              Imprimir / PDF
            </button>
            <button className="secondary-button" onClick={onSendLatestDiet}>
              Enviar última dieta
            </button>
            <button className="secondary-button" onClick={handleSaveConsultation}>
              Guardar consulta
            </button>
            <button className="primary-button" onClick={handleSaveDiet}>
              Guardar dieta v{(selectedPatient.diets?.length || 0) + 1}
            </button>
          </div>
        </div>

        <div className="form-grid planner-head-grid">
          <label>
            Título del plan
            <input value={planner.title} onChange={(event) => patchPlanner('title', event.target.value)} />
          </label>
          <label>
            Objetivo principal
            <input value={planner.primaryGoal} onChange={(event) => patchPlanner('primaryGoal', event.target.value)} />
          </label>
          <label>
            Inicio
            <input type="date" value={planner.starts_on} onChange={(event) => patchPlanner('starts_on', event.target.value)} />
          </label>
          <label>
            Fin
            <input type="date" value={planner.ends_on} onChange={(event) => patchPlanner('ends_on', event.target.value)} />
          </label>
        </div>

        <label>
          Resumen de consulta
          <textarea rows="3" value={planner.summary} onChange={(event) => patchPlanner('summary', event.target.value)} />
        </label>
        <label>
          Notas clínicas y de adherencia
          <textarea rows="4" value={planner.notes} onChange={(event) => patchPlanner('notes', event.target.value)} />
        </label>
      </section>

      <section className="grid two-column">
        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Objetivos diarios</p>
              <h3>Calorías, macros y micros</h3>
            </div>
          </div>
          <div className="macro-balance-card">
            <div className="form-grid macro-balance-grid">
              <label>
                Calorías (kcal)
                <input
                  type="number"
                  step="0.01"
                  value={planner.targets.calories}
                  onChange={(event) => updateCaloriesTarget(event.target.value)}
                />
              </label>
              <div
                className={
                  Math.abs(macroPercentageDelta) < 0.2
                    ? 'macro-total-indicator is-balanced'
                    : 'macro-total-indicator is-unbalanced'
                }
              >
                <span>Total macros</span>
                <strong>{formatNumber(macroPercentageTotal)}%</strong>
                <small>
                  {Math.abs(macroPercentageDelta) < 0.2
                    ? 'Balanceado'
                    : `${macroPercentageDelta > 0 ? 'Faltan' : 'Sobran'} ${formatNumber(Math.abs(macroPercentageDelta))}%`}
                </small>
              </div>
            </div>

            <div className="panel-header macro-toolbar">
              <p className="brand-copy">
                Ajusta un macro y los otros dos se redistribuyen automáticamente para sostener el
                100%.
              </p>
              <button className="chip-button" onClick={normalizeMacroDistribution}>
                Normalizar a 100%
              </button>
            </div>

            <div className="macro-grid">
              {MACRO_KEYS.map((macroKey) => {
                const meta = NUTRIENT_META.find((nutrient) => nutrient.key === macroKey)

                return (
                  <div key={macroKey} className="macro-row">
                    <strong>{meta?.label || macroKey}</strong>
                    <div className="macro-stepper">
                      <button
                        className="stepper-button"
                        type="button"
                        onClick={() => nudgeMacroPercentage(macroKey, -5)}
                      >
                        -
                      </button>
                      <label>
                        %
                        <input
                          type="number"
                          step="0.1"
                          value={planner.macroPercentages[macroKey]}
                          onChange={(event) => updateMacroPercentage(macroKey, event.target.value)}
                        />
                      </label>
                      <button
                        className="stepper-button"
                        type="button"
                        onClick={() => nudgeMacroPercentage(macroKey, 5)}
                      >
                        +
                      </button>
                    </div>
                    <label>
                      Gramos
                      <input
                        type="number"
                        step="0.1"
                        value={planner.targets[macroKey]}
                        onChange={(event) => updateMacroGrams(macroKey, event.target.value)}
                      />
                    </label>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="targets-grid">
            {NUTRIENT_META.filter((nutrient) => !MACRO_KEYS.includes(nutrient.key)).map((nutrient) => (
              <label key={nutrient.key}>
                {nutrient.label} ({nutrient.unit})
                <input
                  type="number"
                  step="0.01"
                  value={planner.targets[nutrient.key]}
                  onChange={(event) => patchTargets(nutrient.key, event.target.value)}
                />
              </label>
            ))}
          </div>

          <h4>Métricas de consulta</h4>
          <div className="form-grid">
            <label>
              Peso (kg)
              <input type="number" step="0.01" value={planner.metrics.weight} onChange={(event) => patchMetrics('weight', event.target.value)} />
            </label>
            <label>
              % grasa
              <input
                type="number"
                step="0.01"
                value={planner.metrics.body_fat_percentage}
                onChange={(event) => patchMetrics('body_fat_percentage', event.target.value)}
              />
            </label>
            <label>
              Cintura (cm)
              <input type="number" step="0.01" value={planner.metrics.waist_cm} onChange={(event) => patchMetrics('waist_cm', event.target.value)} />
            </label>
            <label>
              Observaciones
              <input value={planner.metrics.observations} onChange={(event) => patchMetrics('observations', event.target.value)} />
            </label>
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Promedio semanal</p>
              <h3>Vista previa nutricional</h3>
            </div>
          </div>
          <div className="stats-grid compact">
            {NUTRIENT_META.slice(0, 6).map((nutrient) => (
              <div key={nutrient.key} className="stat-card">
                <span>{nutrient.label}</span>
                <strong>
                  {formatNumber(weeklyAverage[nutrient.key])} {nutrient.unit}
                </strong>
              </div>
            ))}
          </div>
          <p className="brand-copy">
            El promedio se calcula con los alimentos asignados en la semana usando Open Food Facts
            como base nutricional.
          </p>
        </article>
      </section>

      <section className="grid planner-layout weekly-grouped-layout">
        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Semana agrupada</p>
              <h3>Vista semanal por días</h3>
            </div>
            <div className="slot-summary">
              <span>Slot activo</span>
              <strong>
                {activeMeal?.label} · {activeDay?.label}
              </strong>
            </div>
          </div>

          <div className="weekly-day-board">
            {planner.weekPlan.days.map((day) => {
              const dayTotals = getDayTotals(day)

              return (
                <section key={day.key} className="day-column">
                  <div className="day-column-header">
                    <div>
                      <strong>{day.label}</strong>
                      <span>{formatNumber(dayTotals.calories)} kcal totales</span>
                    </div>
                  </div>

                  <div className="day-meal-list">
                    {MEAL_TEMPLATES.map((mealTemplate, mealIndex) => {
                      const meal = day.meals.find((entry) => entry.key === mealTemplate.key)
                      const totals = getMealTotals(meal)
                      const isActive = day.key === activeDay.key && mealTemplate.key === activeMeal.key

                      return (
                        <button
                          key={`${day.key}-${mealTemplate.key}`}
                          className={
                            isActive
                              ? `day-meal-card tone-${mealIndex % 5} active`
                              : `day-meal-card tone-${mealIndex % 5}`
                          }
                          onClick={() => activateSlot(day.key, mealTemplate.key)}
                        >
                          <div className="meal-slot-head">
                            <strong>{mealTemplate.label}</strong>
                            <span>{formatNumber(totals.calories)} kcal</span>
                          </div>
                          <ul className="slot-food-list">
                            {meal.items.slice(0, 3).map((item) => (
                              <li key={`${item.code}-${item.name}`}>{item.name}</li>
                            ))}
                            {!meal.items.length && <li>Vacío</li>}
                            {meal.items.length > 3 && <li>+{meal.items.length - 3} más</li>}
                          </ul>
                        </button>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>

          <div className="panel slot-editor">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Editor rápido</p>
                <h4>
                  {activeMeal?.label} · {activeDay?.label}
                </h4>
              </div>
              <div className="mini-metrics">
                <span>{formatNumber(activeMealTotals.calories)} kcal</span>
                <span>{formatNumber(activeMealTotals.protein)} g prot</span>
                <span>{formatNumber(activeMealTotals.carbs)} g carb</span>
                <span>{formatNumber(activeMealTotals.fat)} g grasa</span>
              </div>
            </div>

            <div className="collection">
              {activeMeal.items.map((item) => {
                const totals = getMealTotals({ items: [item] })

                return (
                  <div key={`${item.code}-${item.name}`} className="collection-card">
                    <div className="panel-header">
                      <div>
                        <strong>{item.name}</strong>
                        <span>{item.brand || 'Base Open Food Facts'}</span>
                      </div>
                      <button className="ghost-button" onClick={() => removeFood(item.code)}>
                        Quitar
                      </button>
                    </div>
                    <div className="form-grid">
                      <label>
                        Gramos
                        <input
                          type="number"
                          step="1"
                          value={item.grams}
                          onChange={(event) => updateFoodGrams(item.code, event.target.value)}
                        />
                      </label>
                      <div className="mini-metrics">
                        <span>{formatNumber(totals.calories)} kcal</span>
                        <span>{formatNumber(totals.protein)} g prot</span>
                        <span>{formatNumber(totals.carbs)} g carb</span>
                        <span>{formatNumber(totals.fat)} g grasa</span>
                      </div>
                    </div>
                  </div>
                )
              })}
              {!activeMeal.items.length && (
                <p className="empty-copy">No hay alimentos en este slot. Busca uno y agrégalo.</p>
              )}
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Base alimentaria</p>
              <h3>Alimentos para la comida seleccionada</h3>
            </div>
            <div className="slot-summary">
              <span>Agregar en</span>
              <strong>
                {activeMeal?.label} · {activeDay?.label}
              </strong>
            </div>
          </div>
          <form className="search-row" onSubmit={handleFoodSearch}>
            <input
              value={foodQuery}
              onChange={(event) => setFoodQuery(event.target.value)}
              placeholder={`Refinar ${activeMeal?.label?.toLowerCase() || 'comida'}...`}
            />
            <button className="primary-button" type="submit" disabled={searchLoading}>
              {searchLoading ? 'Buscando...' : 'Buscar'}
            </button>
          </form>
          <p className="brand-copy">
            Haz click en una comida del día y esta lista cargará sugerencias para ese tipo de
            comida. Si necesitas algo más específico, usa la búsqueda manual.
          </p>
          <div className="collection">
            {foodResults.map((food) => (
              <div key={food.code || food.name} className="collection-card">
                <div className="panel-header">
                  <div>
                    <strong>{food.name}</strong>
                    <span>{food.brand || 'Sin marca'}</span>
                  </div>
                  <div className="button-row">
                    <button className="secondary-button" onClick={() => addFoodToMeal(food)}>
                      Al slot
                    </button>
                    <button className="chip-button" onClick={() => addFoodToWholeWeek(food)}>
                      Toda la semana
                    </button>
                  </div>
                </div>
                <p>
                  100 g: {formatNumber(food.nutrientsPer100g.calories)} kcal | Prot{' '}
                  {formatNumber(food.nutrientsPer100g.protein)} g | Carb{' '}
                  {formatNumber(food.nutrientsPer100g.carbs)} g | Grasa{' '}
                  {formatNumber(food.nutrientsPer100g.fat)} g
                </p>
              </div>
            ))}
            {!foodResults.length && (
              <p className="empty-copy">
                Busca alimentos para armar la semana. Los datos nutricionales vienen de Open Food
                Facts.
              </p>
            )}
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Preview imprimible</p>
            <h3>Semana completa</h3>
          </div>
        </div>

        <div className="weekly-preview print-sheet">
          <header className="print-header">
            <h2>{planner.title || 'Plan semanal'}</h2>
            <p>{selectedPatient.full_name}</p>
            <p>{planner.summary}</p>
          </header>
          <div className="week-grid">
            {planner.weekPlan.days.map((day) => {
              const dayTotals = getDayTotals(day)

              return (
                <article key={day.key} className="day-card">
                  <h4>{day.label}</h4>
                  {day.meals.map((meal) => (
                    <div key={meal.key} className="meal-preview">
                      <strong>{meal.label}</strong>
                      <ul>
                        {meal.items.map((item) => (
                          <li key={`${item.code}-${item.name}`}>{item.name} - {item.grams} g</li>
                        ))}
                        {!meal.items.length && <li>Sin alimentos</li>}
                      </ul>
                    </div>
                  ))}
                  <p className="day-total">
                    {formatNumber(dayTotals.calories)} kcal | Prot {formatNumber(dayTotals.protein)} g | Carb{' '}
                    {formatNumber(dayTotals.carbs)} g | Grasa {formatNumber(dayTotals.fat)} g
                  </p>
                </article>
              )
            })}
          </div>
          <pre className="message-preview">{generatedMessage}</pre>
        </div>
      </section>
    </div>
  )
}
