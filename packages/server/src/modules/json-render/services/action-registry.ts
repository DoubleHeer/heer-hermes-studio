import type { JsonRenderActionConfig } from '../contracts/actions'

export function loadJsonRenderActions(env: Record<string, string | undefined> = process.env): Record<string, JsonRenderActionConfig> {
  const raw = env.HERMES_JSON_RENDER_ACTIONS?.trim()
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const record = parsed as Record<string, unknown>
    if (record.actions && typeof record.actions === 'object' && !Array.isArray(record.actions)) return record.actions as Record<string, JsonRenderActionConfig>
    return record as Record<string, JsonRenderActionConfig>
  } catch {
    throw new Error('HERMES_JSON_RENDER_ACTIONS must be valid JSON')
  }
}

export function getJsonRenderAction(actionId: string, env?: Record<string, string | undefined>): JsonRenderActionConfig | null {
  return loadJsonRenderActions(env)[actionId] || null
}
