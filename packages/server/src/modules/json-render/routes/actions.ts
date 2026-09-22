import Router from '@koa/router'
import * as ctrl from '../controllers/actions'

export const jsonRenderActionRoutes = new Router()
jsonRenderActionRoutes.post('/api/json-render/actions/execute', ctrl.execute)
