import {Hono} from 'hono'
import {bodyLimit} from 'hono/body-limit'
import {cors} from 'hono/cors'
import {routePath} from 'hono/route'
import type {Deps} from './deps'
import {ApiErr,errRes,toApiErr} from './errors'
import {gradeRoutes} from './grade'
import {limits} from './limits'
import {nextRoutes} from './next'
import {researchRoutes} from './research'
import {sessionRoutes} from './session'
import {userRoutes} from './user'

export function createApp(given:Deps) {
	const deps = {...given,gone:new Map<string,number>()}
	const app = new Hono()

	app.onError((e,c) => {
		const err = toApiErr(e)
		if (err.code === 'internal' && err !== e) {
			const at = e.stack?.split('\n').filter((l) => /^\s+at /.test(l)).slice(0,3).join(' ')
			console.error('unhandled',c.req.method,routePath(c),e.name,at)
		}
		return errRes(c,err)
	})
	app.notFound((c) => errRes(c,new ApiErr('not_found','route not found')))

	app.use('*',cors({origin:deps.env.CORS_ORIGIN,exposeHeaders:['Retry-After']}))
	// a browser only sends json after a preflight, so other pages can not make this server spend llm calls
	app.use('*',async (c,next) => {
		const noBody = c.req.method !== 'POST' || c.req.path.endsWith('/start')
		if (!noBody && !/^application\/json\b/i.test(c.req.header('content-type') ?? '')) throw new ApiErr('unsupported_media_type','send content-type application/json')
		return next()
	})
	app.use('*',limits(deps))
	app.use('*',bodyLimit({
		maxSize:256 * 1024,
		onError:(c) => errRes(c,new ApiErr('payload_too_large','request body is over 256kb')),
	}))

	app.get('/health',async (c) => {
		await deps.store.ping()
		return c.json({ok:true,store:deps.store.kind,model:deps.env.LLM_MODEL,demo:!!deps.demo})
	})

	app.get('/demo',(c) => {
		if (!deps.demo) throw new ApiErr('not_found','demo mode is off')
		const r = deps.demo.research()
		return c.json({job_description:r.job_description,company_url:r.company_url,transcript:deps.demo.transcript(),followup_transcript:deps.demo.followupTranscript()})
	})

	app.route('/',researchRoutes(deps))
	app.route('/',sessionRoutes(deps))
	app.route('/',gradeRoutes(deps))
	app.route('/',nextRoutes(deps))
	app.route('/',userRoutes(deps))

	return app
}
