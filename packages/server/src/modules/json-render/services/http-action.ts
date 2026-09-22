import { lookup } from 'node:dns/promises'
import type { JsonRenderActionConfig } from '../contracts/actions'

export class JsonRenderActionError extends Error {
  constructor(public readonly code: string, message: string) { super(message) }
}

function isPrivateIp(ip: string): boolean {
  return ip === '127.0.0.1' || ip === '0.0.0.0' || ip === '::1' || ip.startsWith('10.') || ip.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[01])\./.test(ip) || ip.startsWith('169.254.') || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80:')
}

export async function assertSafeActionUrl(rawUrl: string, allowHttp = false): Promise<URL> {
  let url: URL
  try { url = new URL(rawUrl) } catch { throw new JsonRenderActionError('ACTION_URL_INVALID', '动作 URL 无效') }
  if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) throw new JsonRenderActionError('ACTION_URL_UNSAFE', '动作 URL 必须使用 HTTPS')
  if (url.username || url.password || url.port === '0') throw new JsonRenderActionError('ACTION_URL_UNSAFE', '动作 URL 不允许携带凭证或非法端口')
  if (url.hostname === 'localhost' || isPrivateIp(url.hostname)) throw new JsonRenderActionError('ACTION_URL_PRIVATE', '动作 URL 不允许访问本机或内网地址')
  try {
    const addresses = await lookup(url.hostname, { all: true })
    if (addresses.some(address => isPrivateIp(address.address))) throw new JsonRenderActionError('ACTION_URL_PRIVATE', '动作 URL 解析到内网地址')
  } catch (error) {
    if (error instanceof JsonRenderActionError) throw error
    throw new JsonRenderActionError('ACTION_URL_UNREACHABLE', '动作 URL 域名无法解析')
  }
  return url
}

function valueAtPath(form: Record<string, unknown>, path: string): unknown {
  const parts = path.replace(/^form\.?/, '').split('.').filter(Boolean)
  return parts.reduce<unknown>((value, key) => value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined, form)
}

function buildPayload(form: Record<string, unknown>, mapping?: Record<string, string>): Record<string, unknown> {
  if (!mapping) return form
  return Object.fromEntries(Object.entries(mapping).map(([target, source]) => [target, valueAtPath(form, source)]))
}

export async function executeHttpAction(config: JsonRenderActionConfig, form: Record<string, unknown>): Promise<unknown> {
  if (!config.url) throw new JsonRenderActionError('ACTION_URL_MISSING', '动作未配置 URL')
  const url = await assertSafeActionUrl(config.url, process.env.NODE_ENV !== 'production' && process.env.HERMES_JSON_RENDER_ALLOW_HTTP === '1')
  const timeoutMs = Math.min(Math.max(config.timeoutMs || 10000, 100), 60000)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { method: (config.method || 'POST').toUpperCase(), headers: { 'Content-Type': 'application/json', ...(config.headers || {}) }, body: JSON.stringify(buildPayload(form, config.mapping)), signal: controller.signal, redirect: 'error' })
    const text = await response.text()
    if (text.length > 1_000_000) throw new JsonRenderActionError('ACTION_RESPONSE_TOO_LARGE', '动作响应过大')
    let data: unknown = null
    try { data = text ? JSON.parse(text) : null } catch { data = text }
    if (!response.ok) throw new JsonRenderActionError('ACTION_UPSTREAM_FAILED', `动作服务返回 HTTP ${response.status}`)
    return data
  } catch (error) {
    if (error instanceof JsonRenderActionError) throw error
    if (error instanceof Error && error.name === 'AbortError') throw new JsonRenderActionError('ACTION_TIMEOUT', '动作执行超时')
    throw new JsonRenderActionError('ACTION_UPSTREAM_FAILED', '动作服务暂时不可用')
  } finally { clearTimeout(timer) }
}
