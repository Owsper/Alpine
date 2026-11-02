import {createServer,type ServerResponse} from 'node:http'
import {createServer as tcpServer,type AddressInfo,type Socket} from 'node:net'
import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest'
import {z} from 'zod'
import {ApiErr} from '../src/errors'
import {createLlm} from '../src/llm'
import {fakeLlm,testEnv} from './helpers'

type Reply = {status?:number,body?:unknown,raw?:string,hang?:'headers'|'body'}

const Out = z.object({ok:z.boolean()})
const PRIMARY = 'primary-model'
const FALLBACK = 'fallback-model'

let replies:Reply[] = []
let seen:any[] = []
let paths:string[] = []
let baseUrl = ''

const open = new Set<ServerResponse>()

const server = createServer(async (req,res) => {
	let raw = ''
	for await (const ch of req) raw += ch
	seen.push(JSON.parse(raw))
	paths.push(req.url ?? '')
	const r = replies.shift() ?? {status:500,body:{error:{message:'no reply queued'}}}
	if (r.hang === 'headers') {
		open.add(res)
		return
	}
	if (r.hang === 'body') {
		open.add(res)
		res.writeHead(200,{'content-type':'application/json'})
		res.write('{"id":')
		return
	}
	res.writeHead(r.status ?? 200,{'content-type':'application/json'})
	res.end(r.raw ?? JSON.stringify(r.body))
})

function ok(content:string|null,finish = 'stop'):Reply {
	return {body:{
		id:'x',
		object:'chat.completion',
		created:0,
		model:'m',
		choices:[{index:0,message:{role:'assistant',content},finish_reason:finish}],
		usage:{prompt_tokens:3,completion_tokens:4,total_tokens:7},
	}}
}

const fail = (status:number):Reply => ({status,body:{error:{message:'nope'}}})

function llm(over:Partial<typeof testEnv> = {}) {
	return createLlm({...testEnv,LLM_BASE_URL:baseUrl,LLM_MODEL:PRIMARY,LLM_FALLBACK_MODEL:FALLBACK,...over})
}

const ask = (l = llm(),timeoutMs?:number) => l.json({name:'t',schema:Out,system:'SYS_SECRET',user:'USER_SECRET',timeoutMs})
const models = () => seen.map((b) => b.model)

async function errOf(p:Promise<unknown>) {
	try {
		await p
	} catch(e) {
		return e as ApiErr
	}
	throw new Error('expected a rejection')
}

beforeAll(async () => {
	await new Promise<void>((done) => server.listen(0,'127.0.0.1',done))
	baseUrl = 'http://127.0.0.1:' + (server.address() as AddressInfo).port
})

afterAll(async () => {
	for (const r of open) r.destroy()
	server.closeAllConnections()
	await new Promise((done) => server.close(done))
})

beforeEach(() => {
	replies = []
	seen = []
	paths = []
	vi.spyOn(console,'log').mockImplementation(() => {})
})

afterEach(() => {
	for (const r of open) r.destroy()
	open.clear()
	vi.restoreAllMocks()
	vi.useRealTimers()
})

describe('request',() => {
	it('sends json_schema from zod, default maxTokens, /v1 path',async () => {
		replies = [ok('{"ok":true}')]
		await expect(ask()).resolves.toEqual({ok:true})
		const b = seen[0]
		expect(paths[0]).toBe('/v1/chat/completions')
		expect(b.model).toBe(PRIMARY)
		expect(b.max_tokens).toBe(6000)
		expect(b.response_format.type).toBe('json_schema')
		expect(b.response_format.json_schema.name).toBe('t')
		expect(b.response_format.json_schema.schema.properties.ok.type).toBe('boolean')
		expect(b.messages).toEqual([{role:'system',content:'SYS_SECRET'},{role:'user',content:'USER_SECRET'}])
	})

	it('never mixes format, pattern and length on one string',async () => {
		const out = {
			id:'3f2b8c1e-6a4d-4e7b-9c21-0d5f7a8b9c10',
			at:[{ts:'2026-01-01T00:00:00Z'}],
			url:'https://a.test',
			code:'abc',
			plain:'abc',
		}
		replies = [ok(JSON.stringify(out))]
		await llm().json({
			name:'t',
			schema:z.object({
				id:z.uuid(),
				at:z.array(z.object({ts:z.iso.datetime()})),
				url:z.url().min(1).max(100),
				code:z.string().min(1).regex(/^[a-z]+$/),
				plain:z.string().min(1).max(100),
			}),
			system:'s',
			user:'u',
		})
		const p = seen[0].response_format.json_schema.schema.properties
		expect(p.id).toEqual({type:'string',format:'uuid'})
		expect(p.at.items.properties.ts).toEqual({type:'string',format:'date-time'})
		expect(p.url).toEqual({type:'string',format:'uri'})
		expect(p.code).toEqual({type:'string',pattern:'^[a-z]+$'})
		expect(p.plain).toEqual({type:'string',minLength:1,maxLength:100})
	})

	it.each([
		['pattern',z.object({a:z.uuid()}),'{"a":"not-a-uuid"}'],
		['length next to format',z.object({a:z.url().max(5)}),'{"a":"https://a.test"}'],
		['length next to pattern',z.object({a:z.string().min(5).regex(/^[a-z]+$/)}),'{"a":"abc"}'],
	])('zod still enforces a dropped %s',async (name,schema,text) => {
		replies = [ok(text),ok(text)]
		const e = await errOf(llm().json({name:'t',schema,system:'s',user:'u'}))
		expect(e.code).toBe('llm_bad_output')
	})

	it('tolerates a trailing slash on the base url',async () => {
		replies = [ok('{"ok":true}')]
		await ask(llm({LLM_BASE_URL:baseUrl + '/'}))
		expect(paths[0]).toBe('/v1/chat/completions')
	})

	it('honours maxTokens',async () => {
		replies = [ok('{"ok":true}')]
		await llm().json({name:'t',schema:Out,system:'s',user:'u',maxTokens:50})
		expect(seen[0].max_tokens).toBe(50)
	})

	it('logs name, model, ms and tokens but never the prompt',async () => {
		const log = vi.spyOn(console,'log').mockImplementation(() => {})
		replies = [ok('{"ok":true}')]
		await ask()
		const line = JSON.stringify(log.mock.calls)
		expect(line).toContain('"name\\":\\"t')
		expect(line).toContain(PRIMARY)
		expect(line).not.toContain('SECRET')
		expect(line).not.toContain('ok')
	})
})

describe('fences',() => {
	it.each([
		'```json\n{"ok":true}\n```',
		'```\n{"ok":true}\n```',
		'  ```json {"ok":true}```  ',
		'  {"ok":true}\n',
	])('parses %j',async (text) => {
		replies = [ok(text)]
		await expect(ask()).resolves.toEqual({ok:true})
		expect(seen).toHaveLength(1)
	})

	it('keeps backticks inside a json string',async () => {
		replies = [ok('{"q":"use ```x``` here"}')]
		const out = await llm().json({name:'t',schema:z.object({q:z.string()}),system:'s',user:'u'})
		expect(out.q).toBe('use ```x``` here')
	})
})

describe('bad output',() => {
	it('retries once on the same model and recovers',async () => {
		replies = [ok('not json'),ok('{"ok":true}')]
		await expect(ask()).resolves.toEqual({ok:true})
		expect(models()).toEqual([PRIMARY,PRIMARY])
	})

	it.each([
		['invalid json',ok('nope')],
		['wrong shape',ok('{"ok":"yes"}')],
		['empty content',ok('')],
		['null content',ok(null)],
		['no choices',{body:{id:'x',object:'chat.completion',choices:[]}}],
		['error body with 200',{body:{error:{message:'upstream'}}}],
	] as [string,Reply][])('%s twice gives llm_bad_output with no fallback',async (name,r) => {
		replies = [r,r]
		const e = await errOf(ask())
		expect(e).toBeInstanceOf(ApiErr)
		expect(e.code).toBe('llm_bad_output')
		expect(e.status).toBe(502)
		expect(e.retryable).toBe(true)
		expect(models()).toEqual([PRIMARY,PRIMARY])
	})

	it('fallback that also returns bad output retries once, then fails',async () => {
		replies = [fail(429),ok('nope'),ok('nope')]
		expect((await errOf(ask())).code).toBe('llm_bad_output')
		expect(models()).toEqual([PRIMARY,FALLBACK,FALLBACK])
	})
})

describe('fallback',() => {
	it.each([429,500,502,503])('%i goes to the fallback model once',async (status) => {
		replies = [fail(status),ok('{"ok":true}')]
		await expect(ask()).resolves.toEqual({ok:true})
		expect(models()).toEqual([PRIMARY,FALLBACK])
	})

	it('timeout before headers goes to the fallback',async () => {
		replies = [{hang:'headers'},ok('{"ok":true}')]
		await expect(ask(llm(),150)).resolves.toEqual({ok:true})
		expect(models()).toEqual([PRIMARY,FALLBACK])
	})

	it('timeout while reading the body goes to the fallback',async () => {
		replies = [{hang:'body'},ok('{"ok":true}')]
		await expect(ask(llm(),150)).resolves.toEqual({ok:true})
		expect(models()).toEqual([PRIMARY,FALLBACK])
	})

	it('garbage http body goes to the fallback',async () => {
		replies = [{raw:'<<<not json'},ok('{"ok":true}')]
		await expect(ask()).resolves.toEqual({ok:true})
		expect(models()).toEqual([PRIMARY,FALLBACK])
	})

	it('transient failure on the retry after bad output still falls back',async () => {
		replies = [ok('nope'),fail(503),ok('{"ok":true}')]
		await expect(ask()).resolves.toEqual({ok:true})
		expect(models()).toEqual([PRIMARY,PRIMARY,FALLBACK])
	})

	it.each([401,402,403])('%i does not fall back',async (status) => {
		replies = [fail(status)]
		const e = await errOf(ask())
		expect(e.code).toBe('llm_config')
		expect(e.retryable).toBe(false)
		expect(e.details).toEqual({status})
		expect(models()).toEqual([PRIMARY])
	})
})

describe('error mapping',() => {
	it('429 on both gives llm_rate_limited',async () => {
		replies = [fail(429),fail(429)]
		const e = await errOf(ask())
		expect(e).toBeInstanceOf(ApiErr)
		expect([e.code,e.status,e.retryable]).toEqual(['llm_rate_limited',429,true])
		expect(models()).toEqual([PRIMARY,FALLBACK])
	})

	it('500 on both gives llm_unavailable',async () => {
		replies = [fail(500),fail(503)]
		const e = await errOf(ask())
		expect([e.code,e.status,e.retryable]).toEqual(['llm_unavailable',503,true])
	})

	it('timeout on both gives llm_timeout',async () => {
		replies = [{hang:'headers'},{hang:'body'}]
		const e = await errOf(ask(llm(),150))
		expect([e.code,e.status,e.retryable]).toEqual(['llm_timeout',504,true])
		expect(models()).toEqual([PRIMARY,FALLBACK])
	})

	it('connection refused on both gives llm_unavailable',async () => {
		const dead = createServer()
		await new Promise<void>((done) => dead.listen(0,'127.0.0.1',done))
		const port = (dead.address() as AddressInfo).port
		await new Promise((done) => dead.close(done))
		const e = await errOf(ask(llm({LLM_BASE_URL:'http://127.0.0.1:' + port})))
		expect([e.code,e.status]).toEqual(['llm_unavailable',503])
	})

	it('uses the last error when the two models fail differently',async () => {
		replies = [fail(429),fail(500)]
		expect((await errOf(ask())).code).toBe('llm_unavailable')
	})

	it('never leaks the provider message',async () => {
		replies = [{status:400,body:{error:{message:'SYS_SECRET echoed back'}}}]
		expect((await errOf(ask())).message).not.toContain('SECRET')
	})

	it('a schema that cannot be converted is a bug, not a provider error',async () => {
		const e = await errOf(llm().json({name:'t',schema:{} as any,system:'s',user:'u'}))
		expect(e).not.toBeInstanceOf(ApiErr)
		expect(seen).toHaveLength(0)
	})
})

describe('daily cap',() => {
	it('stops calling the provider once reached',async () => {
		const l = llm({LLM_DAILY_CALL_CAP:2})
		replies = [ok('{"ok":true}'),ok('{"ok":true}'),ok('{"ok":true}')]
		await ask(l)
		await ask(l)
		const e = await errOf(ask(l))
		expect([e.code,e.status,e.retryable]).toEqual(['budget_exceeded',429,false])
		expect(seen).toHaveLength(2)
	})

	it('counts retries and fallbacks as calls',async () => {
		const l = llm({LLM_DAILY_CALL_CAP:2})
		replies = [ok('nope'),fail(500),ok('{"ok":true}')]
		expect((await errOf(ask(l))).code).toBe('budget_exceeded')
		expect(models()).toEqual([PRIMARY,PRIMARY])
	})

	it('resets on the next utc day',async () => {
		vi.useFakeTimers({toFake:['Date']})
		vi.setSystemTime(new Date('2026-01-01T23:59:00Z'))
		const l = llm({LLM_DAILY_CALL_CAP:1})
		replies = [ok('{"ok":true}'),ok('{"ok":true}')]
		await ask(l)
		expect((await errOf(ask(l))).code).toBe('budget_exceeded')
		vi.setSystemTime(new Date('2026-01-02T00:00:01Z'))
		await expect(ask(l)).resolves.toEqual({ok:true})
	})
})

describe('fakeLlm',() => {
	it('validates against the schema and records calls',async () => {
		const f = fakeLlm({good:() => ({ok:true}),bad:() => ({ok:'no'})})
		await expect(f.json({name:'good',schema:Out,system:'s',user:'u'})).resolves.toEqual({ok:true})
		const e = await errOf(f.json({name:'bad',schema:Out,system:'s',user:'u'}))
		expect(e.code).toBe('llm_bad_output')
		expect(f.calls.map((c) => c.name)).toEqual(['good','bad'])
	})

	it('throws on an unknown call name',async () => {
		await expect(fakeLlm().json({name:'x',schema:Out,system:'s',user:'u'})).rejects.toThrow('no fake handler')
	})
})

describe('connect stall',() => {
	// undici connect timers have about 1s granularity, so 8 attempts take about 8s
	it('retries a stalled connect 4 times per model then maps to llm_timeout',async () => {
		const socks:Socket[] = []
		const srv = tcpServer(s => {
			socks.push(s)
			s.on('error',() => {})
		})
		await new Promise<void>(r => srv.listen(0,'127.0.0.1',r))
		const url = 'https://127.0.0.1:' + (srv.address() as AddressInfo).port
		const llm = createLlm({...testEnv,LLM_BASE_URL:url},50)
		try {
			await expect(llm.json({name:'t',schema:Out,system:'s',user:'u'})).rejects.toMatchObject({code:'llm_timeout'})
			expect(socks.length).toBe(8)
		} finally {
			socks.forEach(s => s.destroy())
			srv.close()
		}
	},15000)
})
