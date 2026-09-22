import { request } from '@/api/client'

export type ExecuteJsonRenderActionRequest = {
  actionId: string
  form: Record<string, unknown>
  context?: { sessionId?: string; messageId?: string; surface?: 'chat' | 'workflow' | 'shared' }
  idempotencyKey?: string
}

export type ExecuteJsonRenderActionResponse =
  | { ok: true; status: 'completed'; actionId: string; data?: unknown }
  | { ok: true; status: 'accepted'; actionId: string; submissionId: string }
  | { ok: false; status: 'failed'; code: string; message: string }

export function executeJsonRenderAction(input: ExecuteJsonRenderActionRequest) {
  return request<ExecuteJsonRenderActionResponse>('/api/json-render/actions/execute', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
