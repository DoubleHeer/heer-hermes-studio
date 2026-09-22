import { randomUUID } from 'node:crypto'
import type { ExecuteActionRequest, ExecuteActionResponse, JsonRenderActionConfig } from '../contracts/actions'
import { getJsonRenderAction } from './action-registry'
import { executeHttpAction, JsonRenderActionError } from './http-action'

const idempotentResults = new Map<string, ExecuteActionResponse>()

function schemaCheck(form: Record<string, unknown>, schema?: Record<string, unknown>): string | null {
  if (!schema) return null
  const required = Array.isArray(schema.required) ? schema.required : []
  for (const field of required) if (!(field in form)) return `缺少必填字段：${field}`
  const properties = schema.properties && typeof schema.properties === 'object' ? schema.properties as Record<string, any> : {}
  if (schema.additionalProperties === false) for (const key of Object.keys(form)) if (!properties[key]) return `不允许的字段：${key}`
  for (const [key, rule] of Object.entries(properties)) {
    const value = form[key]
    if (value === undefined || value === null) continue
    if (rule?.type === 'string' && typeof value !== 'string') return `字段类型错误：${key}`
    if (rule?.maxLength && typeof value === 'string' && value.length > rule.maxLength) return `字段过长：${key}`
    if (Array.isArray(rule?.enum) && !rule.enum.includes(value)) return `字段值无效：${key}`
  }
  return null
}

function allowed(config: JsonRenderActionConfig, role?: string): boolean {
  return config.enabled !== false && (!config.allowedRoles?.length || (!!role && config.allowedRoles.includes(role)))
}

export async function executeJsonRenderAction(input: ExecuteActionRequest, user?: { id?: number; role?: string }): Promise<ExecuteActionResponse> {
  if (!input || typeof input.actionId !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(input.actionId)) return { ok: false, status: 'failed', code: 'ACTION_INVALID', message: 'actionId 无效' }
  if (!input.form || typeof input.form !== 'object' || Array.isArray(input.form)) return { ok: false, status: 'failed', code: 'FORM_INVALID', message: '表单数据无效' }
  const config = getJsonRenderAction(input.actionId)
  if (!config) return { ok: false, status: 'failed', code: 'ACTION_NOT_FOUND', message: '动作不存在' }
  if (!allowed(config, user?.role)) return { ok: false, status: 'failed', code: 'ACTION_PERMISSION_DENIED', message: '当前用户无权执行此动作' }
  const validationError = schemaCheck(input.form, config.inputSchema)
  if (validationError) return { ok: false, status: 'failed', code: 'ACTION_SCHEMA_INVALID', message: validationError }
  const key = input.idempotencyKey ? `${user?.id || 'anonymous'}:${input.actionId}:${input.idempotencyKey}` : ''
  if (key && idempotentResults.has(key)) return idempotentResults.get(key)!
  try {
    if (config.type !== 'http') return { ok: false, status: 'failed', code: 'MCP_ACTION_NOT_CONFIGURED', message: 'MCP action executor 尚未配置' }
    const response: ExecuteActionResponse = { ok: true, status: 'completed', actionId: input.actionId, data: await executeHttpAction(config, input.form) }
    if (key) idempotentResults.set(key, response)
    return response
  } catch (error) {
    const result: ExecuteActionResponse = error instanceof JsonRenderActionError
      ? { ok: false, status: 'failed', code: error.code, message: error.message }
      : { ok: false, status: 'failed', code: 'ACTION_FAILED', message: '动作执行失败' }
    if (key) idempotentResults.set(key, result)
    return result
  }
}

export function createSubmissionId(): string { return `sub_${randomUUID()}` }
