export type JsonRenderActionConfig = {
  enabled?: boolean
  type: 'http' | 'mcp'
  method?: string
  url?: string
  timeoutMs?: number
  allowedRoles?: string[]
  headers?: Record<string, string>
  inputSchema?: Record<string, unknown>
  mapping?: Record<string, string>
  server?: string
  tool?: string
}

export type ExecuteActionRequest = {
  actionId: string
  form: Record<string, unknown>
  context?: { sessionId?: string; messageId?: string; surface?: 'chat' | 'workflow' | 'shared' }
  idempotencyKey?: string
}

export type ExecuteActionResponse =
  | { ok: true; status: 'completed'; actionId: string; data?: unknown }
  | { ok: true; status: 'accepted'; actionId: string; submissionId: string }
  | { ok: false; status: 'failed'; code: string; message: string }
