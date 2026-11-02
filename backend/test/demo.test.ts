import {randomUUID} from 'node:crypto'
import {beforeEach,describe,expect,it,vi} from 'vitest'
import {DIMS,Fact,PublicSession,Question,Score,type Dim,type Turn} from '../src/contracts'
import {createDemo,DEMO_CLAIMS} from '../src/demo'
import jobJson from '../src/demo/job.json'
import {ApiErr,type Code} from '../src/errors'
import {safeFetch} from '../src/fetch'
import {runGrader} from '../src/grade'
import {fakeLlm,makeApp} from './helpers'

vi.mock('../src/fetch',async (orig) => ({
	...await orig<typeof import('../src/fetch')>(),
	safeFetch:vi.fn(async () => {
		throw new Error('network down')
	}),
}))

const USER = randomUUID()
const demo = createDemo()
const quotes = demo.gradeFallback(USER,new Date()).scores.map((s) => s.evidence_quote)

const OTHER:Turn[] = [
	{role:'interviewer',text:'Tell me about a time you had to fix a serious problem in a system you worked on.'},
	{role:'candidate',text:'I migrated our billing database, cut query time by 40 percent and owned the rollout myself.'},
]

function failing(code:Code,o:Record<string,() => unknown> = {}) {
	const fail = () => {
		throw new ApiErr(code,'provider down')
	}
	return fakeLlm({research_company:fail,research_facts:fail,session:fail,grade:fail,next:fail,...o})
}

const poster = (app:ReturnType<typeof makeApp>['app']) => (path:string,body:unknown = {}) => app.request(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})

function setup(code:Code = 'llm_unavailable') {
	const {app,llm} = makeApp({llm:failing(code),demo})
	return {app,llm,post:poster(app)}
}

async function demoSession(post:ReturnType<typeof poster>) {
	const {job} = await (await post('/research',{user_id:USER,job_description:demo.research().job_description,demo:true})).json()
	return (await post('/session',{user_id:USER,job_id:job.id})).json()
}

beforeEach(() => {
	vi.mocked(safeFetch).mockClear()
})

describe('whole flow with the llm and the network down',() => {
	it.each<Code>(['llm_unavailable','llm_timeout','llm_rate_limited','llm_bad_output','budget_exceeded'])('works on %s',async (code) => {
		const {app,llm,post} = setup(code)

		const seed = await (await app.request('/demo')).json()
		expect(seed.transcript).toEqual(demo.transcript())

		const research = await post('/research',{user_id:USER,job_description:seed.job_description,demo:true})
		expect(research.status).toBe(200)
		const r = await research.json()
		expect(r.job).toMatchObject({demo:true,company_name:'N26',company_key:'n26.com',role_title:'Backend Engineer',description:seed.job_description})
		expect(r.company).toEqual({name:'N26',url:seed.company_url})
		expect(r.facts).toEqual(demo.research().facts)
		expect(r.facts.length).toBeGreaterThanOrEqual(4)
		expect(r.warnings).toEqual([])
		expect(llm.calls).toEqual([])

		const created = await post('/session',{user_id:USER,job_id:r.job.id})
		expect(created.status).toBe(200)
		const s = PublicSession.parse(await created.json())
		expect(s).toMatchObject({number:1,status:'created',source_session_id:null})
		expect(s.questions).toEqual(demo.firstQuestions())
		expect(s.flow[0].text).toContain('I am an AI interviewer')
		expect(s.interviewer_instructions).toContain(r.facts[0].claim)
		expect(llm.calls).toEqual([])

		const started = await post(`/session/${s.id}/start`)
		expect((await started.json()).status).toBe('in_progress')

		const saved = await post(`/session/${s.id}/transcript`,{turns:seed.transcript,final:true})
		expect((await saved.json()).status).toBe('completed')

		const graded = await post('/grade',{session_id:s.id})
		expect(graded.status).toBe(200)
		const g = Score.parse(await graded.json())
		expect(g.fallback).toBe(true)
		expect(g.session_id).toBe(s.id)
		expect(g.weakest).toEqual(['star','evidence'])
		expect(g.progress).toBeNull()
		expect(llm.calls.map((c) => c.name)).toContain('grade')

		const after = await (await app.request(`/session/${s.id}`)).json()
		expect(after.session.status).toBe('graded')
		expect(after.score).toEqual(g)

		const nexted = await post('/next',{session_id:s.id})
		expect(nexted.status).toBe(200)
		const {plan,session:n} = await nexted.json()
		expect(plan).toMatchObject({session_id:s.id,next_session_id:n.id,weakest:['star','evidence'],composition:{weak:3,anchor:1,new:1}})
		expect(PublicSession.parse(n)).toMatchObject({number:2,status:'created',source_session_id:s.id})
		expect(n.questions.map((q:Question) => [q.kind,q.dimension])).toEqual([
			['weak','star'],
			['weak','star'],
			['weak','evidence'],
			['anchor',null],
			['new',null],
		])
		expect(n.questions[3].text).toBe(s.questions.find((q) => q.kind === 'anchor')!.text)
		expect(llm.calls.map((c) => c.name)).toContain('next')

		expect(await (await post('/grade',{session_id:s.id})).json()).toEqual(g)
		expect((await (await post('/next',{session_id:s.id})).json()).plan).toEqual(plan)
		expect(safeFetch).not.toHaveBeenCalled()
	})

	it('also works when the session is made straight from the job description',async () => {
		const {llm,post} = setup()
		const res = await post('/session',{user_id:USER,job_description:demo.research().job_description,demo:true})
		expect(res.status).toBe(200)
		const s = await res.json()
		expect(s.questions).toEqual(demo.firstQuestions())
		expect(llm.calls).toEqual([])
	})
})

describe('demo quotes stay on the demo transcript',() => {
	it('a different transcript gets the provider error',async () => {
		const {app,post} = setup()
		const s = await demoSession(post)
		await post(`/session/${s.id}/transcript`,{turns:OTHER,final:true})

		for (let i = 0; i < 2; i++) {
			const res = await post('/grade',{session_id:s.id})
			expect(res.status).toBe(503)
			const txt = await res.text()
			expect(JSON.parse(txt).error).toMatchObject({code:'llm_unavailable',retryable:true})
			for (const q of quotes) expect(txt).not.toContain(q)
		}

		const after = await (await app.request(`/session/${s.id}`)).json()
		expect(after.score).toBeNull()
		expect(after.session).toMatchObject({status:'completed',grading_started_at:null})
	})

	it('one changed character is a different transcript',async () => {
		const {post} = setup()
		const s = await demoSession(post)
		const turns = demo.transcript().map((t,i) => i === 2 ? {...t,text:t.text + '!'} : t)
		await post(`/session/${s.id}/transcript`,{turns,final:true})
		expect((await post('/grade',{session_id:s.id})).status).toBe(503)
	})

	it('the demo transcript on a job that is not demo gets the provider error',async () => {
		const session = () => ({questions:demo.firstQuestions().map((q) => ({text:q.text,is_anchor:q.kind === 'anchor'}))})
		const {app} = makeApp({llm:failing('llm_unavailable',{session}),demo})
		const post = poster(app)
		const s = await (await post('/session',{user_id:USER,job_description:'Backend Engineer at Acme.'})).json()
		await post(`/session/${s.id}/transcript`,{turns:demo.transcript(),final:true})
		const res = await post('/grade',{session_id:s.id})
		expect(res.status).toBe(503)
		const txt = await res.text()
		for (const q of quotes) expect(txt).not.toContain(q)
	})

	it('a job that is not demo never gets the demo facts',async () => {
		const research_company = () => ({company_name:'Acme',role_title:null,guess_url:null})
		const {app} = makeApp({llm:failing('llm_unavailable',{research_company}),demo})
		const res = await poster(app)('/research',{user_id:USER,job_description:'Backend Engineer at Acme.',company_url:'https://acme.example/'})
		const b = await res.json()
		expect(safeFetch).toHaveBeenCalled()
		expect(b.facts).toEqual([])
		expect(b.warnings).toEqual(['no_sourced_facts'])
		expect(b.job.demo).toBe(false)
	})

	it('demo false in demo mode still needs the provider',async () => {
		const {post} = setup()
		const res = await post('/research',{user_id:USER,job_description:'Backend Engineer at Acme.'})
		expect(res.status).toBe(503)
	})
})

describe('demo mode off',() => {
	it('GET /demo is not_found and demo:true does nothing',async () => {
		const {app} = makeApp({llm:failing('llm_unavailable')})
		const res = await app.request('/demo')
		expect(res.status).toBe(404)
		expect((await res.json()).error.code).toBe('not_found')
		expect((await (await app.request('/health')).json()).demo).toBe(false)

		const post = poster(app)
		const body = {user_id:USER,job_description:'x',demo:true}
		expect((await post('/research',body)).status).toBe(503)
		expect((await post('/session',body)).status).toBe(503)
	})

	it('GET /health says demo when it is on',async () => {
		const {app} = setup()
		expect((await (await app.request('/health')).json()).demo).toBe(true)
	})
})

describe('demo data',() => {
	it('facts are sourced from the official site',() => {
		const {facts,company_key,company_url} = demo.research()
		expect(new URL(company_url).hostname).toBe(company_key)
		for (const f of facts) {
			Fact.parse(f)
			expect(new URL(f.source_url).hostname).toBe(company_key)
		}
	})

	it('company details in the questions come from the captured facts',() => {
		const claims = demo.research().facts.map((f) => f.claim).join(' ')
		const asked = [...demo.firstQuestions(),...demo.nextQuestions(['company_fit','star'])].map((q) => q.text).join(' ')
		for (const said of DEMO_CLAIMS) {
			expect(claims).toContain(said)
			expect(asked).toContain(said)
		}
	})

	it('the job description is marked as a sample',() => {
		expect(jobJson.sample).toBe(true)
		expect(jobJson.note).toMatch(/SAMPLE.*Not a real job posting/)
		expect(demo.research().job_description).toMatch(/^SAMPLE .*Not a real job posting/)
	})

	it('first session is 4 base and 1 anchor with unique ids',() => {
		const qs = demo.firstQuestions()
		expect(qs.map((q) => q.kind).sort()).toEqual(['anchor','base','base','base','base'])
		expect(new Set(qs.map((q) => q.id)).size).toBe(5)
	})

	it('transcript follows the flow word for word',async () => {
		const {post} = setup()
		const s = await demoSession(post)
		const said = demo.transcript().filter((t) => t.role === 'interviewer')
		expect(said.map((t) => [t.text,t.question_id])).toEqual(s.flow.map((f:{text:string,question_id:string|null}) => [f.text,f.question_id]))
	})

	it('fallback passes the real grader checks and ranks the same',async () => {
		const fb = demo.gradeFallback(USER,new Date())
		const llm = fakeLlm({grade:() => ({scores:fb.scores.map(({dimension,score,evidence_quote,tip}) => ({dimension,score,evidence_quote,tip}))})})
		const r = demo.research()
		const out = await runGrader(llm,{description:r.job_description,facts:r.facts,questions:demo.firstQuestions(),turns:demo.transcript()})
		expect(llm.calls).toHaveLength(3)
		expect(out.scores).toEqual(fb.scores)
		expect(out.weakest).toEqual(fb.weakest)
		expect(out.strengths).toEqual(fb.strengths)
	})

	it('fallback quotes are in a single candidate turn',() => {
		const said = demo.transcript().filter((t) => t.role === 'candidate').map((t) => t.text)
		for (const q of quotes) expect(said.some((t) => t.includes(q))).toBe(true)
	})

	it('fallback is a valid flagged score',() => {
		const now = new Date('2026-06-01T12:00:00.000Z')
		const s = Score.parse(demo.gradeFallback(USER,now))
		expect(s).toMatchObject({session_id:USER,fallback:true,graded_at:now.toISOString(),progress:null,weakest:['star','evidence']})
		expect(s.scores.map((x) => x.dimension)).toEqual(DIMS)
	})

	it('isDemoTranscript is exact on role and text',() => {
		const t = demo.transcript()
		expect(demo.isDemoTranscript(t)).toBe(true)
		expect(demo.isDemoTranscript(t.map(({role,text}) => ({role,text})))).toBe(true)
		expect(demo.isDemoTranscript([])).toBe(false)
		expect(demo.isDemoTranscript(t.slice(1))).toBe(false)
		expect(demo.isDemoTranscript([...t,t[0]])).toBe(false)
		expect(demo.isDemoTranscript(t.map((x,i) => i === 2 ? {...x,role:'interviewer' as const} : x))).toBe(false)
		expect(demo.isDemoTranscript(t.map((x,i) => i === 2 ? {...x,text:x.text + ' '} : x))).toBe(false)
	})

	const pairs = DIMS.flatMap((a) => DIMS.filter((b) => b !== a).map((b):[Dim,Dim] => [a,b]))

	it.each(pairs)('next questions for %s and %s',(a,b) => {
		const qs = demo.nextQuestions([a,b])
		const first = demo.firstQuestions()
		expect(qs.map((q) => Question.parse(q)).map((q) => [q.kind,q.dimension])).toEqual([
			['weak',a],
			['weak',a],
			['weak',b],
			['anchor',null],
			['new',null],
		])
		expect(qs[3].text).toBe(first.find((q) => q.kind === 'anchor')!.text)
		const fresh = qs.filter((q) => q.kind !== 'anchor').map((q) => q.text)
		expect(new Set(fresh).size).toBe(4)
		for (const t of fresh) expect(first.map((q) => q.text)).not.toContain(t)
		expect(new Set([...qs,...first].map((q) => q.id)).size).toBe(10)
	})
})
