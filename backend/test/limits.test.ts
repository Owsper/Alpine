import {randomUUID} from 'node:crypto'
import {describe,expect,it} from 'vitest'
import {makeApp,testEnv} from './helpers'

type Opts = {xff?:string,ip?:string,origin?:string}

function setup(trust = false) {
	let t = Date.parse('2026-11-02T10:00:00.000Z')
	const {app} = makeApp({env:{...testEnv,TRUST_PROXY:trust ? 1 : 0},now:() => new Date(t)})
	const post = (path:string,o:Opts = {}) => {
		const headers:Record<string,string> = {'content-type':'application/json'}
		if (o.xff !== undefined) headers['x-forwarded-for'] = o.xff
		if (o.origin) headers.origin = o.origin
		return app.request(path,{method:'POST',headers,body:'{}'},o.ip ? {incoming:{socket:{remoteAddress:o.ip}}} : undefined)
	}
	const spam = async (path:string,n:number,o:Opts = {}) => {
		for (let i = 0;i < n;i++) expect((await post(path,o)).status).not.toBe(429)
	}
	return {app,post,spam,tick:(ms:number) => {t += ms}}
}

describe('rate limits',() => {
	it.each([['/research',10],['/session',20],['/grade',10],['/next',10]] as const)('%s allows %i per minute then 429s',async (path,cap) => {
		const {post,spam} = setup()
		await spam(path,cap)
		const res = await post(path)
		expect(res.status).toBe(429)
		expect(res.headers.get('retry-after')).toBe('60')
		expect(await res.json()).toEqual({error:{
			code:'rate_limited',
			message:'too many requests',
			retryable:true,
			details:{retry_after:60},
		}})
	})

	it('keeps per route windows independent',async () => {
		const {post,spam} = setup()
		await spam('/grade',10)
		expect((await post('/grade')).status).toBe(429)
		await spam('/next',10)
		await spam('/research',10)
		await spam('/session',20)
		expect((await post('/next')).status).toBe(429)
		expect((await post('/research')).status).toBe(429)
		expect((await post('/session')).status).toBe(429)
	})

	it('keeps clients apart by connection address',async () => {
		const {post,spam} = setup()
		await spam('/grade',10,{ip:'1.1.1.1'})
		expect((await post('/grade',{ip:'1.1.1.1'})).status).toBe(429)
		expect((await post('/grade',{ip:'2.2.2.2'})).status).not.toBe(429)
	})

	it('slides instead of resetting on a fixed minute',async () => {
		const {post,spam,tick} = setup()
		await spam('/grade',5)
		tick(30000)
		await spam('/grade',5)
		tick(15000)
		const full = await post('/grade')
		expect(full.status).toBe(429)
		expect(full.headers.get('retry-after')).toBe('15')
		tick(15000)
		await spam('/grade',5)
		const again = await post('/grade')
		expect(again.status).toBe(429)
		expect(again.headers.get('retry-after')).toBe('30')
	})

	it('frees a slot right when Retry-After says, rejected calls do not extend it',async () => {
		const {post,spam,tick} = setup()
		await spam('/grade',10)
		tick(59000)
		for (let i = 0;i < 5;i++) expect((await post('/grade')).status).toBe(429)
		tick(999)
		const last = await post('/grade')
		expect(last.status).toBe(429)
		expect(last.headers.get('retry-after')).toBe('1')
		tick(1)
		expect((await post('/grade')).status).not.toBe(429)
	})

	it('sweeping old clients does not drop a live window',async () => {
		const {post,spam,tick} = setup()
		await post('/grade',{ip:'1.1.1.1'})
		tick(50000)
		await spam('/grade',10,{ip:'2.2.2.2'})
		tick(11000)
		expect((await post('/grade',{ip:'1.1.1.1'})).status).not.toBe(429)
		expect((await post('/grade',{ip:'2.2.2.2'})).status).toBe(429)
	})

	it('only counts the four exact paths, not /session/:id or preflight',async () => {
		const {app,post,spam} = setup()
		const id = randomUUID()
		const json = {'content-type':'application/json'}
		const body = '{"turns":[],"final":false}'
		for (let i = 0;i < 25;i++) {
			expect((await app.request('/session/' + id)).status).not.toBe(429)
			expect((await app.request('/session/' + id + '/start',{method:'POST'})).status).not.toBe(429)
			expect((await app.request('/session/' + id + '/transcript',{method:'POST',headers:json,body})).status).not.toBe(429)
			expect((await app.request('/health')).status).toBe(200)
			expect((await app.request('/grade',{method:'OPTIONS',headers:{origin:'http://localhost:5173','access-control-request-method':'POST'}})).status).not.toBe(429)
		}
		await spam('/session',20)
		await spam('/grade',10)
		expect((await post('/session')).status).toBe(429)
	})

	it('cannot be dodged with a percent encoded path',async () => {
		const {post,spam} = setup()
		await spam('/grade',10)
		expect((await post('/gr%61de')).status).toBe(429)
	})

	it('keeps cors headers on the 429 so a browser can read it',async () => {
		const {post,spam} = setup()
		const origin = 'http://localhost:5173'
		await spam('/grade',10,{origin})
		const res = await post('/grade',{origin})
		expect(res.status).toBe(429)
		expect(res.headers.get('access-control-allow-origin')).toBe(origin)
		expect(res.headers.get('retry-after')).toBe('60')
	})
})

describe('client identity',() => {
	it('does not crash without conn info and shares the local bucket',async () => {
		const {post,spam} = setup()
		await spam('/grade',10)
		const res = await post('/grade')
		expect(res.status).toBe(429)
	})

	it('ignores x-forwarded-for unless TRUST_PROXY=1',async () => {
		const {post,spam} = setup(false)
		await spam('/grade',10,{xff:'1.1.1.1'})
		expect((await post('/grade',{xff:'2.2.2.2'})).status).toBe(429)
		expect((await post('/grade')).status).toBe(429)
	})

	it('ignores x-forwarded-for over the connection address unless TRUST_PROXY=1',async () => {
		const {post,spam} = setup(false)
		await spam('/grade',10,{ip:'1.1.1.1',xff:'7.7.7.7'})
		expect((await post('/grade',{ip:'1.1.1.1',xff:'8.8.8.8'})).status).toBe(429)
		expect((await post('/grade',{ip:'2.2.2.2',xff:'7.7.7.7'})).status).not.toBe(429)
	})

	it('uses x-forwarded-for over the connection address with TRUST_PROXY=1',async () => {
		const {post,spam} = setup(true)
		await spam('/grade',10,{ip:'10.0.0.1',xff:'1.1.1.1'})
		expect((await post('/grade',{ip:'10.0.0.1',xff:'1.1.1.1'})).status).toBe(429)
		expect((await post('/grade',{ip:'10.0.0.1',xff:'2.2.2.2'})).status).not.toBe(429)
	})

	it('rotating the client supplied part of x-forwarded-for does not get a new window',async () => {
		const {post,spam} = setup(true)
		await spam('/grade',10,{xff:'6.6.6.6, 1.1.1.1'})
		expect((await post('/grade',{xff:'5.5.5.5, 1.1.1.1'})).status).toBe(429)
		expect((await post('/grade',{xff:'1.1.1.1'})).status).toBe(429)
		expect((await post('/grade',{xff:'6.6.6.6, 2.2.2.2'})).status).not.toBe(429)
	})

	it.each(['',' ',', '])('falls back when x-forwarded-for is blank (%j)',async (xff) => {
		const {post,spam} = setup(true)
		await spam('/grade',10,{xff})
		expect((await post('/grade')).status).toBe(429)
		expect((await post('/grade',{ip:'2.2.2.2',xff})).status).not.toBe(429)
	})
})
