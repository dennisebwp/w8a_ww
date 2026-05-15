const OPEN_FOOD_FACTS_BASE_URL = 'https://world.openfoodfacts.org';
const OPEN_FOOD_FACTS_USER_AGENT = 'W8A-Nutrition/1.0 (dennisalvarado89@gmail.com)';
const SEARCH_CACHE_TTL_MS = 1000 * 60 * 30;
const searchCache = new Map();

function normalizeSearchText(value = '') {
    return String(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function getCacheEntry(query) {
    const cached = searchCache.get(query);
    if (!cached) {
        return null;
    }

    if (Date.now() - cached.createdAt > SEARCH_CACHE_TTL_MS) {
        searchCache.delete(query);
        return null;
    }

    return cached.data;
}

function setCacheEntry(query, data) {
    searchCache.set(query, {
        createdAt: Date.now(),
        data,
    });
}

function getFallbackQueries(normalizedQuery) {
    const fallbacks = [];

    if (normalizedQuery.endsWith('es') && normalizedQuery.length > 4) {
        fallbacks.push(normalizedQuery.slice(0, -2));
    }

    if (normalizedQuery.endsWith('s') && normalizedQuery.length > 3) {
        fallbacks.push(normalizedQuery.slice(0, -1));
    }

    const synonymMap = {
        huevos: 'huevo',
        eggs: 'egg',
        yogures: 'yogurt',
        bananas: 'banana',
    };

    if (synonymMap[normalizedQuery]) {
        fallbacks.unshift(synonymMap[normalizedQuery]);
    }

    return [...new Set(fallbacks.filter(Boolean).filter((query) => query !== normalizedQuery))];
}

function countFilledNutrients(nutrientsPer100g) {
    return Object.values(nutrientsPer100g).reduce((count, value) => count + (Number(value || 0) > 0 ? 1 : 0), 0);
}

function hasMeaningfulNutrition(nutrientsPer100g) {
    return ['calories', 'protein', 'carbs', 'fat', 'fiber']
        .some((key) => Number(nutrientsPer100g[key] || 0) > 0);
}

function scoreProduct(product, normalizedQuery, tokens, nutrientsPer100g) {
    const productName = normalizeSearchText(product.product_name);
    const genericName = normalizeSearchText(product.generic_name);
    const brands = normalizeSearchText(product.brands);

    let score = 0;

    if (productName === normalizedQuery || genericName === normalizedQuery) {
        score += 120;
    }

    if (productName.startsWith(normalizedQuery) || genericName.startsWith(normalizedQuery)) {
        score += 80;
    }

    if (productName.includes(normalizedQuery) || genericName.includes(normalizedQuery)) {
        score += 55;
    }

    for (const token of tokens) {
        if (!token) {
            continue;
        }

        if (productName.includes(token) || genericName.includes(token)) {
            score += 12;
        } else if (brands.includes(token)) {
            score += 4;
        }
    }

    if (hasMeaningfulNutrition(nutrientsPer100g)) {
        score += 18;
    } else {
        score -= 24;
    }

    score += Math.min(countFilledNutrients(nutrientsPer100g) * 3, 24);

    if (product.image_url) {
        score += 4;
    }

    if (product.serving_size) {
        score += 3;
    }

    if (product.nutrition_grades) {
        score += 2;
    }

    if (!product.product_name && product.generic_name) {
        score += 5;
    }

    return score;
}

function mapFoodProduct(product) {
    const nutriments = product.nutriments || {};
    const nutrientsPer100g = {
        calories: Number(nutriments['energy-kcal_100g'] || nutriments['energy-kcal_value'] || 0),
        protein: Number(nutriments.proteins_100g || 0),
        carbs: Number(nutriments.carbohydrates_100g || 0),
        fat: Number(nutriments.fat_100g || 0),
        fiber: Number(nutriments.fiber_100g || 0),
        sodium: Number(nutriments.sodium_100g || 0),
        calcium: Number(nutriments.calcium_100g || 0),
        iron: Number(nutriments.iron_100g || 0),
        potassium: Number(nutriments.potassium_100g || 0),
        vitaminC: Number(nutriments['vitamin-c_100g'] || 0),
    };

    return {
        code: product.code,
        name: product.product_name || product.generic_name || 'Producto sin nombre',
        brand: product.brands || '',
        imageUrl: product.image_url || null,
        nutritionGrade: product.nutrition_grades || null,
        servingSize: product.serving_size || null,
        nutrientsPer100g,
    };
}

async function runSearch(query, normalizedQuery) {
    const tokens = normalizedQuery.split(' ').filter(Boolean);
    const params = new URLSearchParams({
        search_terms: query,
        search_simple: '1',
        action: 'process',
        json: '1',
        page_size: '36',
        fields: 'code,product_name,generic_name,brands,image_url,nutrition_grades,serving_size,nutriments',
    });

    const response = await fetch(`${OPEN_FOOD_FACTS_BASE_URL}/cgi/search.pl?${params.toString()}`, {
        headers: {
            'User-Agent': OPEN_FOOD_FACTS_USER_AGENT,
        },
    });

    if (!response.ok) {
        throw new Error(`Open Food Facts search failed with status ${response.status}`);
    }

    const payload = await response.json();

    return (payload.products || [])
        .filter((product) => product.product_name || product.generic_name)
        .map((product) => {
            const mapped = mapFoodProduct(product);
            return {
                ...mapped,
                _score: scoreProduct(product, normalizedQuery, tokens, mapped.nutrientsPer100g),
            };
        })
        .filter((product) => product._score > 0)
        .sort((left, right) => right._score - left._score)
        .slice(0, 12)
        .map(({ _score, ...product }) => product);
}

async function searchFoods(query) {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) {
        return [];
    }

    const cached = getCacheEntry(normalizedQuery);
    if (cached) {
        return cached;
    }

    try {
        const results = await runSearch(query, normalizedQuery);
        setCacheEntry(normalizedQuery, results);
        return results;
    } catch (error) {
        for (const fallbackQuery of getFallbackQueries(normalizedQuery)) {
            const fallbackCached = getCacheEntry(fallbackQuery);
            if (fallbackCached) {
                return fallbackCached;
            }

            try {
                const fallbackResults = await runSearch(fallbackQuery, fallbackQuery);
                if (fallbackResults.length) {
                    setCacheEntry(fallbackQuery, fallbackResults);
                    setCacheEntry(normalizedQuery, fallbackResults);
                    return fallbackResults;
                }
            } catch (_fallbackError) {
                // Ignore fallback failure and continue trying the next option.
            }
        }

        throw error;
    }
}

module.exports = {
    searchFoods,
};
