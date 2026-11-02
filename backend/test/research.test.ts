import {Hono} from 'hono'
import {describe,expect,it,vi} from 'vitest'
import type {Demo} from '../src/deps'
import {ApiErr,errRes,toApiErr} from '../src/errors'
import {pageText,researchRoutes} from '../src/research'
import {memStore} from '../src/store/mem'
import {fakeLlm,makeApp,testEnv} from './helpers'

const USER = '3f2b8c1e-6a4d-4e7b-9c21-0d5f7a8b9c10'
const AT = '2026-06-01T11:59:00.000Z'
const AT2 = '2026-06-01T11:59:30.000Z'
const WEEK = 7 * 24 * 3600 * 1000

const HOME_URL = 'https://acme.test/'
const ABOUT_URL = 'https://acme.test/about'
const HOME = '<html><body><nav>Menu navtext here</nav><h1>Acme Robotics</h1><p>Acme builds warehouse robots for mid-sized retailers across Europe.</p><footer>Footer boilerplate text</footer></body></html>'
const ABOUT = '<html><body><p>Founded in Graz in 2011, the company now employs 340 people.</p></body></html>'
const Q_HOME = 'Acme builds warehouse robots for mid-sized retailers across Europe.'
const Q_ABOUT = 'Founded in Graz in 2011, the company now employs 340 people.'

const company = (o = {}) => ({company_name:'Acme Robotics',role_title:'Backend Engineer',guess_url:null,...o})
const fact = (o = {}) => ({source_url:HOME_URL,quote:Q_HOME,...o})

type Page = {html:string,url?:string,retrieved_at?:string}

function build(o:{pages?:Record<string,Page|string>,company?:() => unknown,facts?:() => unknown,demo?:Demo,start?:Date} = {}) {
	const pages = o.pages ?? {[HOME_URL]:HOME,[ABOUT_URL]:ABOUT}
	const fetchPage = vi.fn(async (url:string,key:string) => {
		const p = pages[url]
		if (!p) throw new Error('404')
		const page = typeof p === 'string' ? {html:p} : p
		return {url:page.url ?? url,html:page.html,retrieved_at:page.retrieved_at ?? AT}
	})
	const store = memStore()
	const llm = fakeLlm({
		research_company:o.company ?? (() => company()),
		research_facts:o.facts ?? (() => ({facts:[fact()]})),
	})
	const clock = {now:o.start ?? new Date('2026-06-01T12:00:00.000Z')}
	const app = new Hono()
	app.onError((e,c) => errRes(c,toApiErr(e)))
	app.route('/',researchRoutes({store,llm,env:testEnv,demo:o.demo,now:() => clock.now},fetchPage))
	return {app,store,llm,fetchPage,clock}
}

function post(app:{request:Hono['request']},body:unknown) {
	return app.request('/research',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})
}

const JD = 'We are hiring a Backend Engineer at Acme Robotics.'
const ask = (o = {}) => ({user_id:USER,job_description:JD,company_url:HOME_URL,...o})
const names = (l:{calls:{name:string}[]}) => l.calls.map((c) => c.name)
const asked = (f:{mock:{calls:unknown[][]}}) => f.mock.calls.map((a) => a[0])

describe('happy path',() => {
	it('returns the contract shape and saves job and facts',async () => {
		const {app,store,llm} = build()
		const res = await post(app,ask())
		expect(res.status).toBe(200)
		const b = await res.json()
		expect(Object.keys(b).sort()).toEqual(['cached','company','disclaimer','facts','job','warnings'])
		expect(b.company).toEqual({name:'Acme Robotics',url:HOME_URL})
		expect(b.cached).toBe(false)
		expect(b.warnings).toEqual([])
		expect(b.disclaimer).toBe('Practice tool. Not affiliated with any company mentioned. No guarantee of job offers.')
		expect(b.job).toMatchObject({user_id:USER,description:JD,company_name:'Acme Robotics',company_url:HOME_URL,company_key:'acme.test',role_title:'Backend Engineer',demo:false})
		expect(b.facts).toEqual([{claim:Q_HOME,source_url:HOME_URL,retrieved_at:AT}])
		expect(await store.getJob(b.job.id)).toEqual(b.job)
		expect(await store.getFacts(b.job.id)).toEqual(b.facts)
		expect(names(llm)).toEqual(['research_company','research_facts'])
	})

	it('passes the company key to the fetcher and only fetches official paths',async () => {
		const {app,fetchPage} = build()
		await post(app,ask({company_url:'https://www.acme.test/en/jobs/123?ref=x'}))
		expect(fetchPage.mock.calls[0]).toEqual(['https://www.acme.test/','acme.test'])
		expect(asked(fetchPage)).toEqual(['/','/about','/about-us','/company','/mission','/values','/careers'].map((p) => 'https://www.acme.test' + p))
	})

	it('treats job description and pages as untrusted data',async () => {
		const {app,llm} = build()
		await post(app,ask())
		const [co,facts] = llm.calls
		expect(co.system).toContain('untrusted')
		expect(co.user).toBe(JD)
		expect(facts.system).toContain('untrusted')
		expect(facts.maxTokens).toBe(16000)
		const data = JSON.parse(facts.user)
		expect(data.company).toBe('Acme Robotics')
		expect(data.pages.map((p:{url:string}) => p.url)).toEqual([HOME_URL,ABOUT_URL])
	})

	it('never sends script, style, nav or footer to the llm',async () => {
		const html = '<html><head><title>T</title><style>.a{color:red}</style></head><body><script>var secret = 1</script><nav>navtext</nav><p>Real words</p><noscript>enable js</noscript><footer>foottext</footer></body></html>'
		const {app,llm} = build({pages:{[HOME_URL]:html},facts:() => ({facts:[]})})
		await post(app,ask())
		expect(JSON.parse(llm.calls[1].user).pages[0].text).toBe('Real words')
	})
})

describe('fact verification',() => {
	it('drops a fabricated quote',async () => {
		const {app} = build({facts:() => ({facts:[fact(),fact({quote:'Acme employs nine thousand people worldwide'})]})})
		const b = await (await post(app,ask())).json()
		expect(b.facts.map((f:{claim:string}) => f.claim)).toEqual([Q_HOME])
	})

	it.each([
		['foreign url','https://evil.test/about'],
		['a page we never fetched','https://acme.test/press'],
		['same page without the slash','https://acme.test'],
		['same page with a query','https://acme.test/?x=1'],
		['http instead of https','http://acme.test/'],
		['not a url','home page'],
	])('drops a source_url that is %s',async (name,url) => {
		const {app,store} = build({facts:() => ({facts:[fact({source_url:url})]})})
		const b = await (await post(app,ask())).json()
		expect(b.facts).toEqual([])
		expect(b.warnings).toEqual(['no_sourced_facts'])
		expect(await store.getFacts(b.job.id)).toEqual([])
	})

	it('drops a quote that lives on another fetched page',async () => {
		const {app} = build({facts:() => ({facts:[fact({quote:Q_ABOUT})]})})
		expect((await (await post(app,ask())).json()).facts).toEqual([])
	})

	it.each(['Menu navtext here','Footer boilerplate text'])('drops a quote from removed markup : %s',async (quote) => {
		const {app} = build({facts:() => ({facts:[fact({quote})]})})
		expect((await (await post(app,ask())).json()).facts).toEqual([])
	})

	it.each(['Acme','the','   ','Acme Robotics','Acme builds warehouse','Acme - builds - robots','Founded in 2011'])('drops a quote under 4 words : %j',async (quote) => {
		const html = '<html><body><h1>Acme Robotics</h1><p>Acme - builds - robots. Founded in 2011. Acme builds warehouse robots.</p></body></html>'
		const {app} = build({pages:{[HOME_URL]:html},facts:() => ({facts:[fact({quote})]})})
		expect((await (await post(app,ask())).json()).facts).toEqual([])
	})

	it('keeps a quote of exactly 4 words',async () => {
		const {app} = build({facts:() => ({facts:[fact({quote:'Acme builds warehouse robots'})]})})
		expect((await (await post(app,ask())).json()).facts[0].claim).toBe('Acme builds warehouse robots')
	})

	it('the claim is the quote, whatever else the model wrote',async () => {
		const {app} = build({facts:() => ({facts:[{...fact(),claim:'Acme is the world leader in robots.'}]})})
		expect((await (await post(app,ask())).json()).facts).toEqual([{claim:Q_HOME,source_url:HOME_URL,retrieved_at:AT}])
	})

	it('only whitespace of the quote is changed',async () => {
		const {app} = build({facts:() => ({facts:[fact({quote:'  Acme   builds\n\twarehouse robots\u00a0for mid-sized retailers across Europe. '})]})})
		expect((await (await post(app,ask())).json()).facts[0].claim).toBe(Q_HOME)
	})

	it.each([
		['with a word at the cut','Acme ' + 'builds robots '.repeat(25) + 'for everyone.'],
		['with a space at the cut','Acme builds robots ' + 'a'.repeat(281) + ' and more words here.'],
	])('drops a sentence over 300 chars instead of cutting it, %s',async (name,long) => {
		expect(long.length).toBeGreaterThan(300)
		const {app} = build({pages:{[HOME_URL]:`<html><body><p>${long}</p></body></html>`},facts:() => ({facts:[fact({quote:long})]})})
		expect((await (await post(app,ask())).json()).facts).toEqual([])
	})

	it('asks the model for the source and the sentence only',async () => {
		const {app,llm} = build()
		await post(app,ask())
		const call = llm.calls[1]
		expect(call.schema.parse({facts:[{claim:'c',source_url:'u',quote:'q'}]})).toEqual({facts:[{source_url:'u',quote:'q'}]})
		expect(() => call.schema.parse({facts:[{claim:'c',source_url:'u'}]})).toThrow()
		for (const asked of ['complete','copied as written','marketing superlatives','navigation','legal','cookie']) expect(call.system).toContain(asked)
		expect(call.system).not.toContain('claim')
	})

	it('a quote that is only in hidden text is dropped',async () => {
		const html = '<html><body><p>Acme builds warehouse robots today.</p><div hidden>Acme employs nine thousand people worldwide.</div></body></html>'
		const {app} = build({pages:{[HOME_URL]:html},facts:() => ({facts:[fact({quote:'Acme employs nine thousand people worldwide.'})]})})
		expect((await (await post(app,ask())).json()).facts).toEqual([])
	})

	it.each([
		['case','ACME BUILDS WAREHOUSE ROBOTS'],
		['whitespace','Acme   builds\n\twarehouse  robots'],
		['curly quotes','the “best” robots aren’t cheap'],
		['nfkc','Acme builds warehouse ｒobots'],
	])('keeps a quote that only differs by %s',async (name,quote) => {
		const html = '<html><body><p>Acme builds warehouse robots. We say the "best" robots aren\'t cheap.</p></body></html>'
		const {app} = build({pages:{[HOME_URL]:html},facts:() => ({facts:[fact({quote})]})})
		expect((await (await post(app,ask())).json()).facts).toHaveLength(1)
	})

	it('takes retrieved_at from the page, per page, never from the llm',async () => {
		const {app} = build({
			pages:{[HOME_URL]:{html:HOME,retrieved_at:AT},[ABOUT_URL]:{html:ABOUT,retrieved_at:AT2}},
			facts:() => ({facts:[
				{...fact(),retrieved_at:'1999-01-01T00:00:00.000Z'},
				{...fact({source_url:ABOUT_URL,quote:Q_ABOUT}),retrieved_at:'1999-01-01T00:00:00.000Z'},
			]}),
		})
		const b = await (await post(app,ask())).json()
		expect(b.facts.map((f:{retrieved_at:string}) => f.retrieved_at)).toEqual([AT,AT2])
	})

	it('never returns or stores a quote field',async () => {
		const {app,store} = build()
		const b = await (await post(app,ask())).json()
		expect(Object.keys(b.facts[0]).sort()).toEqual(['claim','retrieved_at','source_url'])
		expect(Object.keys((await store.getFacts(b.job.id))[0]).sort()).toEqual(['claim','retrieved_at','source_url'])
	})

	it('keeps at most 8 facts',async () => {
		const {app} = build({facts:() => ({facts:Array.from({length:12},() => fact())})})
		expect((await (await post(app,ask())).json()).facts).toHaveLength(8)
	})

	it('zero facts gives no_sourced_facts and does not poison the cache',async () => {
		const {app,llm} = build({facts:() => ({facts:[]})})
		const b = await (await post(app,ask())).json()
		expect(b.warnings).toEqual(['no_sourced_facts'])
		const again = await (await post(app,ask())).json()
		expect(again.cached).toBe(false)
		expect(names(llm).filter((n) => n === 'research_facts')).toHaveLength(2)
	})
})

describe('pages',() => {
	const all = Object.fromEntries(['/','/about','/about-us','/company','/mission','/values','/careers'].map((p) => ['https://acme.test' + p,'<html><body><p>page ' + p + ' words</p></body></html>']))

	it('never uses more than 6 pages',async () => {
		const {app,llm,fetchPage} = build({pages:all,facts:() => ({facts:[]})})
		await post(app,ask())
		expect(fetchPage).toHaveBeenCalledTimes(6)
		expect(JSON.parse(llm.calls[1].user).pages).toHaveLength(6)
	})

	it('reaches /careers when an earlier page is missing',async () => {
		const {['https://acme.test/mission']:gone,...rest} = all
		const {app,llm,fetchPage} = build({pages:rest,facts:() => ({facts:[]})})
		await post(app,ask())
		expect(asked(fetchPage)).toContain('https://acme.test/careers')
		expect(JSON.parse(llm.calls[1].user).pages).toHaveLength(6)
	})

	it('dedupes pages that redirect to the same final url and cites the final url',async () => {
		const pages = {
			[HOME_URL]:{html:HOME,url:'https://www.acme.test/'},
			[ABOUT_URL]:{html:ABOUT,url:'https://www.acme.test/about/'},
			'https://acme.test/about-us':{html:ABOUT,url:'https://www.acme.test/about/'},
		}
		const {app,llm} = build({pages,facts:() => ({facts:[fact({source_url:'https://www.acme.test/about/',quote:Q_ABOUT}),fact({source_url:ABOUT_URL,quote:Q_ABOUT})]})})
		const b = await (await post(app,ask())).json()
		expect(JSON.parse(llm.calls[1].user).pages.map((p:{url:string}) => p.url)).toEqual(['https://www.acme.test/','https://www.acme.test/about/'])
		expect(b.facts.map((f:{source_url:string}) => f.source_url)).toEqual(['https://www.acme.test/about/'])
	})

	describe('research-live-6 : a path that redirects to another topic',() => {
		const land = async (path:string,to:string) => {
			const {app,llm} = build({pages:{[HOME_URL]:HOME,['https://acme.test' + path]:{html:ABOUT,url:'https://acme.test' + to}},facts:() => ({facts:[]})})
			await post(app,ask())
			return JSON.parse(llm.calls[1].user).pages.map((p:{url:string}) => p.url)
		}

		it.each([
			['/about','/efood'],
			['/about','/sitemap/'],
			['/careers','/'],
			['/mission','/brands/efood'],
		])('%s landing on %s is dropped',async (path,to) => {
			expect(await land(path,to)).toEqual([HOME_URL])
		})

		it.each([
			['/about','/about/'],
			['/about','/en-eu/about'],
			['/about','/ABOUT'],
			['/about-us','/about'],
			['/about','/about-us'],
			['/careers','/en-eu/careers/open'],
			['/values','/about/values'],
		])('%s landing on %s is kept',async (path,to) => {
			expect(await land(path,to)).toEqual([HOME_URL,'https://acme.test' + to])
		})

		it('the home page can land anywhere on the site',async () => {
			const {app,llm} = build({pages:{[HOME_URL]:{html:HOME,url:'https://acme.test/en-eu/'}},facts:() => ({facts:[]})})
			await post(app,ask())
			expect(JSON.parse(llm.calls[1].user).pages.map((p:{url:string}) => p.url)).toEqual(['https://acme.test/en-eu/'])
		})

		it('a dropped page does not use up the page budget',async () => {
			const six = ['/','/about','/about-us','/company','/mission','/values'].map((p) => 'https://acme.test' + p)
			const pages:Record<string,Page> = Object.fromEntries(six.map((u) => [u,{html:'<body><p>' + u + ' words</p></body>'}]))
			pages['https://acme.test/about'] = {html:ABOUT,url:'https://acme.test/efood'}
			pages['https://acme.test/careers'] = {html:'<body><p>jobs words</p></body>'}
			const {app,llm} = build({pages,facts:() => ({facts:[]})})
			await post(app,ask())
			const got = JSON.parse(llm.calls[1].user).pages.map((p:{url:string}) => p.url)
			expect(got).toHaveLength(6)
			expect(got).not.toContain('https://acme.test/efood')
			expect(got).toContain('https://acme.test/careers')
		})

		it('tells the model to skip a page about a subsidiary or brand',async () => {
			const {app,llm} = build()
			await post(app,ask())
			expect(llm.calls[1].system).toContain('subsidiary or brand')
		})
	})

	it('no fetchable page skips the facts call',async () => {
		const {app,llm} = build({pages:{}})
		const b = await (await post(app,ask())).json()
		expect(b.facts).toEqual([])
		expect(b.warnings).toEqual(['no_sourced_facts'])
		expect(b.job.company_url).toBe(HOME_URL)
		expect(names(llm)).toEqual(['research_company'])
	})

	it('pages with no text are skipped',async () => {
		const {app,llm} = build({pages:{[HOME_URL]:'<html><body><div id="root"></div><script>app()</script></body></html>'}})
		await post(app,ask())
		expect(names(llm)).toEqual(['research_company'])
	})

	it('caps a page at 12000 chars and a quote past the cut is dropped',async () => {
		const html = '<html><body><p>' + 'a'.repeat(12000) + ' this quote is past the cut</p></body></html>'
		expect(await pageText(html)).toHaveLength(12000)
		const {app} = build({pages:{[HOME_URL]:html},facts:() => ({facts:[fact({quote:'this quote is past the cut'})]})})
		expect((await (await post(app,ask())).json()).facts).toEqual([])
	})

	it.each([
		['script','<script>gone words</script>'],
		['style','<style>gone words</style>'],
		['noscript','<noscript>gone words</noscript>'],
		['template','<template><p>gone words</p></template>'],
		['svg','<svg><title>gone words</title><text>gone words</text></svg>'],
		['the hidden attribute','<div hidden>gone words</div>'],
		['a hidden attribute with a value','<div hidden="hidden">gone words</div>'],
		['an uppercase hidden attribute','<DIV HIDDEN>gone words</DIV>'],
		['aria-hidden true','<span aria-hidden="true">gone words</span>'],
		['aria-hidden TRUE','<span aria-hidden="TRUE">gone words</span>'],
		['display none','<div style="display:none">gone words</div>'],
		['spaced display none','<div style="color: red; DISPLAY : NONE !important">gone words</div>'],
		['visibility hidden','<span style="visibility:hidden">gone words</span>'],
		['spaced visibility hidden','<span style="margin:0 ; visibility: hidden;">gone words</span>'],
		['a child of a hidden element','<div hidden><section><p>gone <b>words</b></p></section></div>'],
		['a hidden element with another id','<div hidden id="radix-S:a">gone words</div>'],
		['a hidden element inside a streamed segment','<div hidden id="S:a"><div hidden>gone words</div></div>'],
	])('pageText drops %s',async (name,html) => {
		expect(await pageText(`<body><p>shown words</p>${html}</body>`)).toBe('shown words')
	})

	it.each([
		['aria-hidden false','<p aria-hidden="false">kept words</p>'],
		['another display','<p style="display:block">kept words</p>'],
		['visibility visible','<p style="visibility:visible">kept words</p>'],
		['a custom property that only looks like it','<p style="--display:none">kept words</p>'],
		['a data attribute','<p data-hidden="true">kept words</p>'],
		['a hidden class we can not see','<p class="hidden">kept words</p>'],
		['a segment react streams into place','<template id="B:a"></template><div hidden id="S:a"><p>kept words</p></div><script>$RC("B:a","S:a")</script>'],
	])('pageText keeps %s',async (name,html) => {
		expect(await pageText(`<body>${html}</body>`)).toBe('kept words')
	})

	it('pageText separates blocks and leaves inline text alone',async () => {
		expect(await pageText('<body><h1>About</h1><p>We build</p><ul><li>a</li><li>b</li></ul>line<br>break</body>')).toBe('About We build a b line break')
		expect(await pageText('<body><p>In<b>ter</b>view</p></body>')).toBe('Interview')
	})
})

describe('url priority',() => {
	const noFacts = () => ({facts:[]})

	it('body company_url beats the job description and the guess',async () => {
		const {app,fetchPage} = build({company:() => company({guess_url:'https://guess.test/'}),facts:noFacts})
		const b = await (await post(app,ask({job_description:JD + ' https://other.test/'}))).json()
		expect(b.job.company_key).toBe('acme.test')
		expect(asked(fetchPage).every((u) => String(u).startsWith(HOME_URL))).toBe(true)
	})

	it('job description url beats the guess and skips blocklisted ones',async () => {
		const {app,fetchPage} = build({company:() => company({guess_url:'https://guess.test/'}),facts:noFacts})
		const jd = 'Apply on https://www.linkedin.com/jobs/1 or https://de.indeed.com/x. More at https://acme.test/careers.'
		const b = await (await post(app,{user_id:USER,job_description:jd})).json()
		expect(b.job.company_url).toBe(HOME_URL)
		expect(asked(fetchPage)[0]).toBe(HOME_URL)
	})

	it.each([
		['a bare www host','See www.acme.test for more'],
		['markdown','[site](https://acme.test/x)'],
		['angle brackets','<https://acme.test/>'],
	])('finds %s in the job description',async (name,jd) => {
		const {app} = build({pages:{[HOME_URL]:HOME,'https://www.acme.test/':HOME},facts:noFacts})
		const b = await (await post(app,{user_id:USER,job_description:jd})).json()
		expect(b.job.company_key).toBe('acme.test')
	})

	it.each(['http://127.0.0.1/admin','http://169.254.169.254/latest','http://localhost:3000/','https://acme.test:8443/','https://u:p@acme.test/','http://2130706433/'])('skips an unsafe job description url : %s',async (url) => {
		const {app,fetchPage} = build()
		const b = await (await post(app,{user_id:USER,job_description:'Visit ' + url})).json()
		expect(fetchPage).not.toHaveBeenCalled()
		expect(b.warnings).toEqual(['no_official_source'])
	})

	it('guess is used only when the homepage contains the company name',async () => {
		const {app,fetchPage,llm} = build({company:() => company({guess_url:HOME_URL})})
		const b = await (await post(app,{user_id:USER,job_description:JD})).json()
		expect(b.job.company_url).toBe(HOME_URL)
		expect(b.facts).toHaveLength(1)
		expect(asked(fetchPage).filter((u) => u === HOME_URL)).toHaveLength(1)
		expect(names(llm)).toEqual(['research_company','research_facts'])
	})

	it('guess is matched after normalizing',async () => {
		const {app} = build({company:() => company({company_name:'ACME  robotics',guess_url:HOME_URL})})
		const b = await (await post(app,{user_id:USER,job_description:JD})).json()
		expect(b.job.company_url).toBe(HOME_URL)
	})

	it.each([
		['name not on the page',{company_name:'Other GmbH',guess_url:HOME_URL}],
		['home unreachable',{guess_url:'https://down.test/'}],
		['no company name',{company_name:null,guess_url:HOME_URL}],
		['blocklisted',{guess_url:'https://www.linkedin.com/company/acme'}],
		['private',{guess_url:'http://10.0.0.1/'}],
		['not a url',{guess_url:'acme dot test'}],
		['null',{guess_url:null}],
	])('guess refused when %s',async (name,o) => {
		const {app,llm} = build({company:() => company(o)})
		const b = await (await post(app,{user_id:USER,job_description:JD})).json()
		expect(b.warnings).toEqual(['no_official_source'])
		expect(b.facts).toEqual([])
		expect(b.job.company_url).toBeNull()
		expect(b.job.company_key).toBeNull()
		expect(b.company.url).toBeNull()
		expect(names(llm)).toEqual(['research_company'])
	})

	it.each(['linkedin','glassdoor','indeed','kununu','xing'])('blocklisted body url %s gives source_not_allowed before any llm call',async (name) => {
		const {app,llm} = makeApp()
		const res = await post(app,ask({company_url:'https://www.' + name + '.com/company/acme'}))
		expect(res.status).toBe(422)
		expect((await res.json()).error).toMatchObject({code:'source_not_allowed',retryable:false,details:{reason:'blocklisted'}})
		expect(llm.calls).toEqual([])
	})

	it.each(['http://127.0.0.1/','http://169.254.169.254/','http://[::1]/','http://localhost/','https://acme.test:8443/','https://u:p@acme.test/'])('unsafe body url %s gives source_not_allowed',async (url) => {
		const {app,llm} = makeApp()
		const res = await post(app,ask({company_url:url}))
		expect(res.status).toBe(422)
		expect((await res.json()).error.code).toBe('source_not_allowed')
		expect(llm.calls).toEqual([])
	})

	it('no url at all gives no_official_source through the real app',async () => {
		const {app,store,llm} = makeApp({llm:fakeLlm({research_company:() => company()})})
		const res = await post(app,{user_id:USER,job_description:JD})
		expect(res.status).toBe(200)
		const b = await res.json()
		expect(b.warnings).toEqual(['no_official_source'])
		expect(b.facts).toEqual([])
		expect(b.cached).toBe(false)
		expect(b.company).toEqual({name:'Acme Robotics',url:null})
		expect(await store.getJob(b.job.id)).toEqual(b.job)
		expect(names(llm)).toEqual(['research_company'])
	})
})

describe('cache',() => {
	it('hit copies facts to the new job, skips fetching and the facts call',async () => {
		const {app,store,llm,fetchPage} = build()
		const one = await (await post(app,ask())).json()
		fetchPage.mockClear()
		llm.calls.length = 0
		const two = await (await post(app,ask({company_url:'https://www.acme.test/jobs'}))).json()
		expect(two.cached).toBe(true)
		expect(two.warnings).toEqual([])
		expect(two.facts).toEqual(one.facts)
		expect(two.job.id).not.toBe(one.job.id)
		expect(fetchPage).not.toHaveBeenCalled()
		expect(names(llm)).toEqual(['research_company'])
		expect(await store.getFacts(two.job.id)).toEqual(one.facts)
		expect(await store.getFacts(one.job.id)).toEqual(one.facts)
	})

	it('deleting the first user leaves the copy on the second job',async () => {
		const {app,store} = build()
		await post(app,ask())
		const other = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
		const two = await (await post(app,ask({user_id:other}))).json()
		await store.deleteUser(USER)
		expect(await store.getFacts(two.job.id)).toEqual(two.facts)
	})

	it('another company does not hit',async () => {
		const {app} = build({pages:{[HOME_URL]:HOME,'https://other.test/':'<html><body><p>Other words</p></body></html>'},facts:() => ({facts:[]})})
		await post(app,ask())
		expect((await (await post(app,ask({company_url:'https://other.test/'}))).json()).cached).toBe(false)
	})

	it('facts older than 7 days do not hit',async () => {
		const {app,llm,clock} = build()
		await post(app,ask())
		clock.now = new Date(Date.parse(AT) + WEEK + 1000)
		const b = await (await post(app,ask())).json()
		expect(b.cached).toBe(false)
		expect(names(llm).filter((n) => n === 'research_facts')).toHaveLength(2)
	})
})

describe('demo',() => {
	const demoFact = {claim:'Demo Co makes demos.',source_url:'https://demo.test/about',retrieved_at:AT}
	const demo = {
		research:() => ({company_name:'Demo Co',company_url:'https://demo.test/',company_key:'demo.test',role_title:'Engineer',job_description:'demo jd',facts:[demoFact]}),
	} as unknown as Demo

	it('demo true uses canned facts with no network and no llm',async () => {
		const {app,store,llm,fetchPage} = build({demo})
		const b = await (await post(app,{user_id:USER,job_description:'demo jd',demo:true})).json()
		expect(b.job).toMatchObject({demo:true,company_name:'Demo Co',company_key:'demo.test',role_title:'Engineer'})
		expect(b.facts).toEqual([demoFact])
		expect(b.cached).toBe(true)
		expect(b.warnings).toEqual([])
		expect(llm.calls).toEqual([])
		expect(fetchPage).not.toHaveBeenCalled()
		expect(await store.getFacts(b.job.id)).toEqual([demoFact])
	})

	it('canned facts never reach the real company cache',async () => {
		const {app,store} = build({demo})
		await post(app,{user_id:USER,job_description:'demo jd',demo:true})
		expect(await store.cachedFacts('demo.test',WEEK,new Date(AT))).toEqual([])
	})

	it('demo false goes the normal way even in demo mode',async () => {
		const {app,llm} = build({demo})
		const b = await (await post(app,ask())).json()
		expect(b.job.demo).toBe(false)
		expect(names(llm)).toEqual(['research_company','research_facts'])
	})

	it('demo true with demo mode off goes the normal way',async () => {
		const {app,llm} = build()
		const b = await (await post(app,ask({demo:true}))).json()
		expect(b.job.demo).toBe(false)
		expect(names(llm)).toEqual(['research_company','research_facts'])
	})
})

describe('validation and errors',() => {
	it.each([
		['bad user_id',{user_id:'nope',job_description:JD}],
		['no user_id',{job_description:JD}],
		['no job description',{user_id:USER}],
		['blank job description',{user_id:USER,job_description:'   '}],
		['job description too long',{user_id:USER,job_description:'x'.repeat(20001)}],
		['company_url not a url',{user_id:USER,job_description:JD,company_url:'acme'}],
		['company_url ftp',{user_id:USER,job_description:JD,company_url:'ftp://acme.test/'}],
		['demo not a boolean',{user_id:USER,job_description:JD,demo:'yes'}],
	])('%s gives bad_request',async (name,body) => {
		const {app,llm} = build()
		const res = await post(app,body)
		expect(res.status).toBe(400)
		const {error} = await res.json()
		expect(error.code).toBe('bad_request')
		expect(error.details).toBeTruthy()
		expect(llm.calls).toEqual([])
	})

	it('job description at the limit is fine',async () => {
		const {app} = build()
		expect((await post(app,ask({job_description:'x'.repeat(20000)}))).status).toBe(200)
	})

	it('broken json gives bad_request',async () => {
		const {app} = build()
		const res = await app.request('/research',{method:'POST',body:'{nope'})
		expect(res.status).toBe(400)
	})

	it.each(['research_company','research_facts'])('provider failure on %s surfaces and leaves no job',async (name) => {
		const fail = () => {
			throw new ApiErr('llm_unavailable','down')
		}
		const {app,store} = build(name === 'research_company' ? {company:fail} : {facts:fail})
		const res = await post(app,ask())
		expect(res.status).toBe(503)
		expect((await res.json()).error).toMatchObject({code:'llm_unavailable',retryable:true})
		expect((await store.exportUser(USER)).jobs).toEqual([])
	})

	it('a broken store is internal and does not leak the message',async () => {
		const {app,store} = build()
		store.createJob = async () => {
			throw new Error('secret connection string')
		}
		const res = await post(app,ask())
		expect(res.status).toBe(500)
		expect(await res.text()).not.toContain('secret')
	})
})
