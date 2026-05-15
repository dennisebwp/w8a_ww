const DEFAULT_API_BASE = (import.meta.env.VITE_API_BASE_URL || '').trim()

export function getApiBaseUrl() {
  return DEFAULT_API_BASE
}

export async function request(apiBaseUrl, accessToken, path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  }

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers,
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.error || `La solicitud falló con estado ${response.status}`)
  }

  if (response.status === 204) {
    return null
  }

  return response.json()
}

export function parseJsonInput(value, label) {
  try {
    return JSON.parse(value || '{}')
  } catch (_error) {
    throw new Error(`${label} contiene JSON inválido.`)
  }
}
