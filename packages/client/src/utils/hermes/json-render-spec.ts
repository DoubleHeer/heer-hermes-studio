import type { Spec } from '@json-render/core'

export type JsonRenderMessageParts = {
  spec: Spec
  before: string
  after: string
}

const FENCE = /```json-render\s*/i
const FORM_FIELD_TYPES = new Set(['Input', 'Textarea', 'Select'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Accept the original json-render flat format (`type`) and the legacy format
 * currently produced by Hermes prompts (`component`). Legacy form controls get
 * a deterministic state binding so generated forms work without an extra
 * model-specific binding instruction.
 */
function normalizeFlatSpec(parsed: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(parsed.elements)) return parsed
  const elements = Object.fromEntries(Object.entries(parsed.elements).map(([key, rawElement]) => {
    if (!isRecord(rawElement)) return [key, rawElement]
    const type = typeof rawElement.type === 'string'
      ? rawElement.type
      : typeof rawElement.component === 'string' ? rawElement.component : undefined
    const props = isRecord(rawElement.props) ? { ...rawElement.props } : {}
    if (type && FORM_FIELD_TYPES.has(type) && !('value' in props)) {
      props.value = { $bindState: `/form/${key}` }
    }
    return [key, {
      ...rawElement,
      ...(type ? { type } : {}),
      props,
      children: Array.isArray(rawElement.children) ? rawElement.children : [],
    }]
  }))
  return { ...parsed, elements }
}

function findJsonObject(source: string, start: number): { value: string; end: number } | null {
  const open = source.indexOf('{', start)
  if (open < 0) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = open; i < source.length; i += 1) {
    const char = source[i]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === '{') depth += 1
    else if (char === '}' && --depth === 0) return { value: source.slice(open, i + 1), end: i + 1 }
  }
  return null
}

export function extractJsonRenderSpec(content: string): JsonRenderMessageParts | null {
  const match = FENCE.exec(content)
  if (!match) return null
  const json = findJsonObject(content, match.index + match[0].length)
  if (!json) return null
  try {
    const parsed = normalizeFlatSpec(JSON.parse(json.value) as Record<string, unknown>)
    if (typeof parsed.root !== 'string' || !parsed.elements || typeof parsed.elements !== 'object' || Array.isArray(parsed.elements)) {
      return null
    }
    const fenceEnd = content.indexOf('```', json.end)
    const afterStart = fenceEnd >= 0 ? fenceEnd + 3 : json.end
    return {
      spec: parsed as unknown as Spec,
      before: content.slice(0, match.index).trim(),
      after: content.slice(afterStart).trim(),
    }
  } catch {
    return null
  }
}

export function hasKnownJsonRenderTypes(spec: Spec, knownTypes: readonly string[]): boolean {
  const elements = spec.elements as Record<string, { type?: unknown }>
  return Object.values(elements).every(element => typeof element?.type === 'string' && knownTypes.includes(element.type))
}
