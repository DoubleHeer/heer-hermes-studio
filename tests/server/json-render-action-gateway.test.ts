import { afterEach, describe, expect, it } from 'vitest'
import { executeJsonRenderAction } from '../../packages/server/src/modules/json-render/services/action-gateway'

const previous = process.env.HERMES_JSON_RENDER_ACTIONS

afterEach(() => {
  if (previous === undefined) delete process.env.HERMES_JSON_RENDER_ACTIONS
  else process.env.HERMES_JSON_RENDER_ACTIONS = previous
})

describe('json-render action gateway', () => {
  it('rejects unknown actions and client-controlled URLs', async () => {
    process.env.HERMES_JSON_RENDER_ACTIONS = JSON.stringify({ actions: {} })
    expect(await executeJsonRenderAction({ actionId: 'missing', form: {} }, { id: 1, role: 'user' })).toMatchObject({ code: 'ACTION_NOT_FOUND' })

    process.env.HERMES_JSON_RENDER_ACTIONS = JSON.stringify({ actions: { 'safe.action': { type: 'http', url: 'http://127.0.0.1:9' } } })
    expect(await executeJsonRenderAction({ actionId: 'safe.action', form: {} }, { id: 1, role: 'user' })).toMatchObject({ code: 'ACTION_URL_UNSAFE' })
  })

  it('enforces role, schema and idempotency before dispatch', async () => {
    process.env.HERMES_JSON_RENDER_ACTIONS = JSON.stringify({ actions: { 'safe.action': { type: 'http', url: 'https://example.com', allowedRoles: ['admin'], inputSchema: { required: ['name'], properties: { name: { type: 'string' } } } } } })
    expect(await executeJsonRenderAction({ actionId: 'safe.action', form: {} }, { id: 1, role: 'user' })).toMatchObject({ code: 'ACTION_PERMISSION_DENIED' })
    expect(await executeJsonRenderAction({ actionId: 'safe.action', form: {} }, { id: 1, role: 'admin' })).toMatchObject({ code: 'ACTION_SCHEMA_INVALID' })
  })
})
