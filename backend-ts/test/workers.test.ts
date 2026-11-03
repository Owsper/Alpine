import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {type Io,parseHtml,type Raw,safeFetch} from '../src/fetch'

const hook = vi.hoisted(() => ({script:null as string|null,made:[] as Record<string,unknown>[],sent:[] as unknown[],got:[] as any[],killed:0}))

vi.mock('node:child_process',async (orig) => {
	const m = await orig<typeof import('node:child_process')>()
	return {...m,fork:(file:string,o:import('node:child_process').ForkOptions) => {
		hook.made.push(o as Record<string,unknown>)
		const c = m.fork(hook.script ?? file,o)
		const [send,kill] = [c.send.bind(c),c.kill.bind(c)]
		c.on('message',(m) => hook.got.push(m))
		c.send = ((job:never) => {
			hook.sent.push(job)
			return send(job)
		}) as typeof c.send
		c.kill = () => {
			hook.killed++
			return kill()
		}
		return c
	}}
})

const HOSTILE = '<div>'.repeat(209715)
const BIG = '<p>'.repeat(174762) + 'end'
// each <p> closes the open formatting elements and the next text clones them all back
const BOMB = '<p>' + Array.from({length:1000},(x,i) => `<b a${i}>`).join('') + '<p>x'.repeat(2000)

beforeEach(() => {
	hook.made.length = 0
	hook.sent.length = 0
	hook.got.length = 0
	hook.killed = 0
	hook.script = null
})

afterEach(() => {
	vi.restoreAllMocks()
})

const logs = () => vi.spyOn(console,'error').mockImplementation(() => {})
const warm = () => Promise.all([0,1,2,3].map(() => parseHtml('<p>warm</p>')))

describe('concurrency-1 : parsing is capped',() => {
	it('runs at most 4 at once and starts them in order',async () => {
		const pages = Array.from({length:20},(x,i) => `<p>page ${i}</p>`)
		const jobs = pages.map((p) => parseHtml(p))
		expect(hook.sent.length).toBeLessThanOrEqual(4)
		const out = await Promise.all(jobs)
		expect(out.map((o) => o?.text)).toEqual(pages.map((x,i) => 'page ' + i))
		expect(hook.sent).toEqual(pages)
	},30000)

	it('a burst never makes more than 4 workers',async () => {
		await Promise.all(Array.from({length:30},() => parseHtml('<p>x</p>')))
		expect(hook.made.length).toBeLessThanOrEqual(4)
	},30000)

	it('finished workers are kept for the next burst',async () => {
		await warm()
		hook.made.length = 0
		await warm()
		expect(hook.made).toEqual([])
	},30000)

	it('a worker that hit the hard stop gives its slot back',async () => {
		logs()
		const stuck = await Promise.all([0,1,2,3].map(() => parseHtml(HOSTILE,200)))
		expect(stuck).toEqual([null,null,null,null])
		expect((await parseHtml('<p>still working</p>'))?.text).toBe('still working')
	},30000)
})

describe('a page that runs the parser out of heap',() => {
	it('is small enough to pass any size limit',() => {
		expect(BOMB.length).toBeLessThan(20 * 1024)
	})

	// in a worker thread this aborted the whole process with exit 134, 4 runs of 4
	it('gives null and the server keeps running',async () => {
		logs()
		const out = await Promise.all(Array.from({length:6},() => parseHtml(BOMB)))
		expect(out).toEqual([null,null,null,null,null,null])
		expect((await parseHtml('<p>still working</p>'))?.text).toBe('still working')
	},60000)

	it('says so in the log',async () => {
		const err = logs()
		expect(await parseHtml(BOMB)).toBeNull()
		expect(JSON.stringify(err.mock.calls)).toMatch(/parser exited|parser stopped/)
	},30000)
})

describe('a hostile page at the 3 MB fetch limit',() => {
	const MAX = 3 * 1024 * 1024
	const fill = (unit:string) => unit.repeat(Math.floor(MAX / unit.length))

	it.each([
		['nested divs',fill('<div>')],
		['open p tags',fill('<p>')],
		['the formatting bomb, over and over',fill(BOMB)],
	])('%s gives null inside the hard stop and the server keeps running',async (name,html) => {
		logs()
		const t0 = Date.now()
		expect(await parseHtml(html)).toBeNull()
		expect(Date.now() - t0).toBeLessThan(5000)
		expect((await parseHtml('<p>still working</p>'))?.text).toBe('still working')
	},30000)

	// cut in the worker : a long answer would be parsed and held by the server, and a slice there keeps the whole string alive
	it('the worker sends back no more text than the route reads',async () => {
		const out = await parseHtml(fill('<p>Acme baut Röbots für Händler in ganz Europa.</p>'))
		expect(out?.text).toHaveLength(12000)
		expect(hook.got.map((m) => m.text.length)).toEqual([12000])
	},30000)

	it('an honest page that size parses well inside the hard stop',async () => {
		const out = await parseHtml(fill('<p>Acme builds warehouse robots for retailers across Europe.</p>'))
		expect(out?.text).toContain('Acme builds warehouse robots')
	},30000)
})

describe('concurrency-3 : the time limit starts when a worker takes the job',() => {
	it('a job that had to wait still gets its time',async () => {
		await warm()
		const busy = [0,1,2,3].map(() => parseHtml(BIG,10000))
		const late = await parseHtml('<p>quick</p>',250)
		expect(late?.text).toBe('quick')
		await Promise.all(busy)
	},30000)
})

describe('concurrency-3 : a queued job its fetch gave up on',() => {
	it('is skipped when its turn comes, and the line moves on',async () => {
		await warm()
		const busy = [0,1,2,3].map(() => parseHtml(BIG,10000))
		const ac = new AbortController()
		const stale = parseHtml('<p>stale</p>',1000,ac.signal)
		const after = parseHtml('<p>after</p>')
		ac.abort()
		expect((await after)?.text).toBe('after')
		expect(await stale).toBeNull()
		expect(hook.sent).not.toContain('<p>stale</p>')
		await Promise.all(busy)
	},30000)

	it('safeFetch hands its deadline to the parse',async () => {
		const io:Io = {
			resolve:async () => [{address:'93.184.216.34',family:4}],
			get:async (u):Promise<Raw> => u.pathname === '/robots.txt' ? {status:404,headers:{},body:''} : {status:200,headers:{'content-type':'text/html'},body:'<p>x</p>'},
		}
		const parse = vi.fn(async () => ({text:'x',optOut:false}))
		await safeFetch('https://acme.test/',undefined,{io,parse})
		expect((parse.mock.calls[0] as unknown[])[2]).toBeInstanceOf(AbortSignal)
	})
})

describe('tests-1, observability-1 : a worker that fails',() => {
	it('a page over the deadline stops the worker, logs and shows no page text',async () => {
		const err = logs()
		const secret = '<p>secret page words</p>'
		expect(await parseHtml(secret + HOSTILE,200)).toBeNull()
		expect(hook.killed).toBe(1)
		expect(err).toHaveBeenCalledTimes(1)
		expect(JSON.stringify(err.mock.calls)).not.toContain('secret')
	},30000)

	it('a crash returns well under the 3 s stop and logs once',async () => {
		const err = logs()
		const t0 = Date.now()
		expect(await parseHtml(5 as unknown as string)).toBeNull()
		expect(Date.now() - t0).toBeLessThan(2000)
		expect(hook.killed).toBe(1)
		expect(err).toHaveBeenCalledTimes(1)
		expect((await parseHtml('<p>next</p>'))?.text).toBe('next')
	},30000)

	it('a worker that can not start gives null fast and says so',async () => {
		const err = logs()
		// the pool has to be empty for a new worker to be made
		await Promise.all([0,1,2,3].map(() => parseHtml(HOSTILE,200)))
		err.mockClear()
		hook.script = new URL('./no-such-worker.mjs',import.meta.url).pathname.replace(/^\/(?=\w:)/,'')
		const t0 = Date.now()
		expect(await parseHtml('<p>secret page words</p>')).toBeNull()
		expect(Date.now() - t0).toBeLessThan(2000)
		const line = JSON.stringify(err.mock.calls)
		expect(line).toContain('parser exited')
		expect(line).not.toContain('secret')
	},30000)

	it('workers run with no loader, no secrets and a memory limit',async () => {
		logs()
		await Promise.all(Array.from({length:6},() => parseHtml(HOSTILE,50)))
		expect(hook.made[0]).toMatchObject({execArgv:['--max-old-space-size=256'],env:{}})
		expect(hook.made[0].stdio).toEqual(['ignore','ignore','ignore','ipc'])
	},30000)
})

describe('concurrency-2 : robots rules run off the main thread',() => {
	const RULE = 'Disallow: /*a*a*a*a*a*a*a*a*a*a*a*b\n'
	const ROBOTS = 'User-agent: *\n' + RULE.repeat(Math.floor(1024 * 1024 / RULE.length))
	const ioFor = (long:string) => {
		const asked:string[] = []
		const io:Io = {
			resolve:async () => [{address:'93.184.216.34',family:4}],
			get:async (u):Promise<Raw> => {
				asked.push(u.pathname)
				if (u.pathname === '/robots.txt') return {status:200,headers:{},body:ROBOTS}
				if (u.pathname === '/about') return {status:302,headers:{location:long},body:''}
				return {status:200,headers:{'content-type':'text/html'},body:'<p>x</p>'}
			},
		}
		return {io,asked}
	}

	it('a hostile robots.txt does not stall the server',async () => {
		logs()
		const {io} = ioFor('/' + 'a'.repeat(2000))
		let last = Date.now()
		let gap = 0
		const timer = setInterval(() => {
			gap = Math.max(gap,Date.now() - last)
			last = Date.now()
		},5)
		await safeFetch('https://acme.test/about',undefined,{io}).catch(() => null)
		clearInterval(timer)
		expect(gap).toBeLessThan(500)
	},60000)

	it('rules that take over the hard stop leave the page unread, and the site did not say no',async () => {
		logs()
		const long = '/' + 'a'.repeat(15000)
		const {io,asked} = ioFor(long)
		await expect(safeFetch('https://acme.test/about',undefined,{io})).rejects.toThrow(/^robots_unknown$/)
		expect(asked).not.toContain(long)
	},60000)

	it('a robots parser that dies leaves the page unread, and the site did not say no',async () => {
		logs()
		// the pool has to be empty for a new worker to be made
		await Promise.all([0,1,2,3].map(() => parseHtml(HOSTILE,200)))
		hook.script = new URL('./no-such-worker.mjs',import.meta.url).pathname.replace(/^\/(?=\w:)/,'')
		const {io,asked} = ioFor('/x')
		await expect(safeFetch('https://acme.test/about',undefined,{io})).rejects.toThrow(/^robots_unknown$/)
		expect(asked).toEqual(['/robots.txt'])
	},30000)

	it('a normal robots.txt still decides',async () => {
		const io = (txt:string):Io => ({
			resolve:async () => [{address:'93.184.216.34',family:4}],
			get:async (u):Promise<Raw> => u.pathname === '/robots.txt' ? {status:200,headers:{},body:txt} : {status:200,headers:{'content-type':'text/html'},body:'<p>x</p>'},
		})
		await expect(safeFetch('https://acme.test/about',undefined,{io:io('User-agent: *\nDisallow: /about')})).rejects.toThrow('robots')
		await expect(safeFetch('https://acme.test/about',undefined,{io:io('User-agent: *\nDisallow: /private')})).resolves.toMatchObject({url:'https://acme.test/about'})
	},30000)
})
