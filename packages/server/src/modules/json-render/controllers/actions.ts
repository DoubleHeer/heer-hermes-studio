import type { Context } from 'koa'
import { executeJsonRenderAction } from '../services/action-gateway'

export async function execute(ctx: Context): Promise<void> {
  const body = (ctx.request.body || {}) as any
  const user = (ctx.state as any).user as { id?: number; role?: string } | undefined
  ctx.body = await executeJsonRenderAction(body, user)
}
