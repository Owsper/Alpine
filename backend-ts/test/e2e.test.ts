import {randomUUID} from 'node:crypto'
import {afterEach,beforeEach,describe,expect,it,type MockInstance,vi} from 'vitest'
import {DIMS,Fact,Plan,PublicSession,Score,type Session,type Turn} from '../src/contracts'
import {createDemo} from '../src/demo'
import {type Io,type Raw,realIo} from '../src/fetch'
import type {LlmCall} from '../src/llm'
import {fakeLlm,makeApp} from './helpers'

const USER = randomUUID()
const JD = 'Backend Engineer at Acme Robotics in Graz. Old posting : https://www.linkedin.com/jobs/1. Read about us on https://acme.test/about.'
const HOME_URL = 'https://acme.test/'
const ABOUT_URL = 'https://acme.test/about'
const Q_HOME = 'Acme builds warehouse robots for retailers across Europe.'
const Q_ABOUT = 'Acme was founded in Graz in 2011.'
const SECRET = 'This text opted out of ai use.'
const BAD_KEY = /overall|total|audio|video|emotion|confidence|personality/i

const html = (body:string,head = ''):Raw => ({status:200,headers:{'content-type':'text/html'},body:`<html><head>${head}</head><body>${body}</body></html>`})
const WIRE:Record<string,Raw> = {
	'/robots.txt':{status:200,headers:{'content-type':'text/plain'},body:'User-agent: *\nDisallow: /careers'},
	'/':html(`<nav>Menu</nav><h1>Acme Robotics</h1><p>${Q_HOME}</p>`),
	'/about':html(`<p>${Q_ABOUT}</p>`),
	'/mission':html(`<p>${SECRET}</p>`,'<meta name="robots" content="noai">'),
	'/careers':html('<p>robots.txt says no</p>'),
}

// the first run of each set is never the median. medians 2 4 4 3 4 2 then 4 4 4 3 4 3
const RUNS = [
	[3,4,4,3,5,2],
	[2,4,4,3,4,2],
	[2,5,4,3,4,1],
	[4,4,5,3,4,3],
	[4,4,4,3,4,3],
	[4,4,4,3,4,3],
]

function gradeRun(o:LlmCall<any>,row:number[]) {
	const said = JSON.parse(o.user).transcript.filter((t:Turn) => t.role === 'candidate')
	return {scores:DIMS.map((dimension,i) => ({
		dimension,
		score:row[i],
		evidence_quote:said[i % said.length].text.slice(0,30),
		tip:`Add one concrete detail on ${dimension}.`,
	}))}
}

function fake() {
	let run = 0
	return fakeLlm({
		research_company:() => ({company_name:'Acme Robotics',role_title:'Backend Engineer',guess_url:null}),
		research_facts:() => ({facts:[
			{source_url:HOME_URL,quote:Q_HOME},
			{source_url:ABOUT_URL,quote:Q_ABOUT},
			{source_url:ABOUT_URL,quote:'Acme employs 9000 people worldwide.'},
			{source_url:'https://acme.test/blog',quote:Q_HOME},
		]}),
		session:() => ({questions:[
			{text:'What does a good API look like?',is_anchor:false},
			{text:'How do you keep a service reliable?',is_anchor:false},
			{text:'Tell me about a time you fixed a hard bug.',is_anchor:true},
			{text:'How do you test a backend?',is_anchor:false},
			{text:'Why do warehouse robots interest you?',is_anchor:false},
		]}),
		grade:(o) => gradeRun(o,RUNS[run++]),
		next:() => ({weak:['Weak star one?','Weak star two?','Weak evidence one?'],new:'New topic?'}),
	})
}

function setup(o:Parameters<typeof makeApp>[0] = {}) {
	const {app,store,llm} = makeApp({llm:fake(),...o})
	const post = (path:string,body:unknown = {}) => app.request(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})
	return {app,store,llm,post}
}

async function ok(res:Response) {
	expect(res.status).toBe(200)
	return res.json()
}

async function failed(res:Response,status:number,code:string) {
	expect(res.status).toBe(status)
	expect((await res.json()).error.code).toBe(code)
}

// what the frontend does : speak the flow, collect the answers
function interview(s:PublicSession,answer:(q:string) => string):Turn[] {
	return s.flow.flatMap((f):Turn[] => {
		const said:Turn = {role:'interviewer',text:f.text,question_id:f.question_id}
		return f.type === 'question' ? [said,{role:'candidate',text:answer(f.text),question_id:f.question_id}] : [said]
	})
}

function keysOf(v:unknown):string[] {
	if (Array.isArray(v)) return v.flatMap(keysOf)
	if (v && typeof v === 'object') return Object.entries(v).flatMap(([k,x]) => [k,...keysOf(x)])
	return []
}

const count = (l:{calls:{name:string}[]},name:string) => l.calls.filter((c) => c.name === name).length

let wire:MockInstance<Io['get']>

beforeEach(() => {
	vi.spyOn(realIo,'resolve').mockResolvedValue([{address:'93.184.216.34',family:4}])
	wire = vi.spyOn(realIo,'get').mockImplementation(async (u) => WIRE[u.pathname] ?? {status:404,headers:{},body:''})
})

afterEach(() => {
	vi.restoreAllMocks()
})

describe('full flow over http',() => {
	it('job description to delete',async () => {
		const {app,llm,post} = setup()

		await failed(await post('/research',{user_id:USER,job_description:JD,company_url:'https://www.linkedin.com/company/acme'}),422,'source_not_allowed')
		expect(llm.calls).toEqual([])

		const r = await ok(await post('/research',{user_id:USER,job_description:JD}))
		expect(r.job).toMatchObject({user_id:USER,description:JD,company_name:'Acme Robotics',company_url:HOME_URL,company_key:'acme.test',role_title:'Backend Engineer',demo:false})
		expect(r.company).toEqual({name:'Acme Robotics',url:HOME_URL})
		expect(r.cached).toBe(false)
		expect(r.warnings).toEqual([])
		expect(r.disclaimer).toContain('Not affiliated')
		expect(r.facts.map((f:Fact) => [f.claim,f.source_url])).toEqual([[Q_HOME,HOME_URL],[Q_ABOUT,ABOUT_URL]])
		for (const f of r.facts) expect(Object.keys(Fact.parse(f)).sort()).toEqual(Object.keys(f).sort())

		const asked = wire.mock.calls.map((a) => a[0].href)
		expect(asked.every((u) => u.startsWith(HOME_URL))).toBe(true)
		expect(asked).not.toContain('https://acme.test/careers')
		const fed = JSON.parse(llm.calls.find((c) => c.name === 'research_facts')!.user)
		expect(fed.pages.map((p:{url:string}) => p.url)).toEqual([HOME_URL,ABOUT_URL])
		expect(JSON.stringify(fed)).not.toContain(SECRET)

		await failed(await post('/session',{user_id:randomUUID(),job_id:r.job.id}),404,'not_found')
		const s1 = PublicSession.parse(await ok(await post('/session',{user_id:USER,job_id:r.job.id})))
		expect(s1).toMatchObject({job_id:r.job.id,number:1,status:'created',transcript:null,source_session_id:null})
		expect(s1.questions.map((q) => q.kind).sort()).toEqual(['anchor','base','base','base','base'])
		expect(s1.flow.map((f) => f.type)).toEqual(['intro','question','question','question','question','question','outro'])
		expect(s1.flow[0].text).toContain('I am an AI interviewer')
		expect(s1.flow[0].text).toContain('no audio')
		expect(s1.interviewer_instructions).toContain(Q_HOME)
		expect(JSON.parse(llm.calls.find((c) => c.name === 'session')!.user).company_facts).toEqual([Q_HOME,Q_ABOUT])

		expect(await ok(await app.request(`/session/${s1.id}`))).toMatchObject({session:s1,score:null,facts:r.facts})
		await failed(await post('/grade',{session_id:s1.id}),409,'invalid_state')

		expect((await ok(await post(`/session/${s1.id}/start`))).status).toBe('in_progress')
		expect((await ok(await post(`/session/${s1.id}/start`))).status).toBe('in_progress')

		const t1 = interview(s1,(q) => `Well, I worked on this once for a client : ${q}`)
		await failed(await post(`/session/${s1.id}/transcript`,{turns:[{...t1[1],audio_url:'https://x.test/a.wav'}],final:false}),400,'bad_request')
		const part = await ok(await post(`/session/${s1.id}/transcript`,{turns:t1.slice(0,3),final:false}))
		expect(part).toMatchObject({status:'in_progress',transcript:t1.slice(0,3)})
		await failed(await post('/grade',{session_id:s1.id}),409,'invalid_state')

		const done = await ok(await post(`/session/${s1.id}/transcript`,{turns:t1,final:true}))
		expect(done).toMatchObject({status:'completed',transcript:t1})
		expect((await ok(await post(`/session/${s1.id}/transcript`,{turns:t1,final:true}))).status).toBe('completed')
		await failed(await post(`/session/${s1.id}/transcript`,{turns:t1.slice(0,3),final:true}),409,'invalid_state')
		await failed(await post('/next',{session_id:s1.id}),409,'invalid_state')

		const g1 = Score.parse(await ok(await post('/grade',{session_id:s1.id})))
		expect(g1.scores.map((d) => d.score)).toEqual([2,4,4,3,4,2])
		expect(g1.weakest).toEqual(['star','evidence'])
		expect(g1.strengths).toEqual(['relevance','role_knowledge','conciseness'])
		expect(g1.scores[0].noise).toBeCloseTo(Math.sqrt(2) / 3)
		expect(g1).toMatchObject({session_id:s1.id,fallback:false,progress:null})
		const said = t1.filter((t) => t.role === 'candidate').map((t) => t.text)
		for (const d of g1.scores) expect(said.some((a) => a.includes(d.evidence_quote))).toBe(true)
		expect(count(llm,'grade')).toBe(3)

		expect(await ok(await post('/grade',{session_id:s1.id}))).toEqual(g1)
		expect(count(llm,'grade')).toBe(3)
		const after = await ok(await app.request(`/session/${s1.id}`))
		expect(after.session.status).toBe('graded')
		expect(after.score).toEqual(g1)
		await failed(await post(`/session/${s1.id}/start`),409,'invalid_state')

		const n = await ok(await post('/next',{session_id:s1.id}))
		const plan = Plan.parse(n.plan)
		const s2 = PublicSession.parse(n.session)
		expect(plan).toMatchObject({session_id:s1.id,next_session_id:s2.id,weakest:['star','evidence'],composition:{weak:3,anchor:1,new:1}})
		expect(s2).toMatchObject({job_id:s1.job_id,number:2,status:'created',source_session_id:s1.id})
		expect(s2.questions.map((q) => [q.kind,q.dimension])).toEqual([
			['weak','star'],
			['weak','star'],
			['weak','evidence'],
			['anchor',null],
			['new',null],
		])
		expect(s2.questions[3].text).toBe(s1.questions.find((q) => q.kind === 'anchor')!.text)
		expect(s2.flow[0].text).toContain('I am an AI interviewer')
		const nextIn = JSON.parse(llm.calls.find((c) => c.name === 'next')!.user)
		expect(nextIn.weakest).toEqual(['star','evidence'])
		expect(nextIn.excluded_questions).toEqual(s1.questions.map((q) => q.text))
		expect(nextIn.feedback.map((f:{dimension:string}) => f.dimension)).toEqual(['star','evidence'])

		expect(await ok(await post('/next',{session_id:s1.id}))).toEqual(n)
		expect(count(llm,'next')).toBe(1)

		// second interview, skipping start is allowed
		const t2 = interview(s2,(q) => `I led the fix myself and cut errors by 40 percent : ${q}`)
		expect((await ok(await post(`/session/${s2.id}/transcript`,{turns:t2,final:true}))).status).toBe('completed')
		const g2 = Score.parse(await ok(await post('/grade',{session_id:s2.id})))
		expect(g2.scores.map((d) => d.score)).toEqual([4,4,4,3,4,3])
		expect(g2.weakest).toEqual(['company_fit','evidence'])
		expect(g2.progress!.map((p) => [p.dimension,p.prev,p.cur,p.delta,p.significant])).toEqual([
			['star',2,4,2,true],
			['relevance',4,4,0,false],
			['role_knowledge',4,4,0,false],
			['company_fit',3,3,0,false],
			['conciseness',4,4,0,false],
			['evidence',2,3,1,true],
		])
		expect(g2.progress![0].noise).toBeCloseTo(g1.scores[0].noise)
		expect(g2.progress![2].noise).toBeCloseTo(g2.scores[2].noise)

		const dump = await ok(await app.request(`/user/${USER}/export`))
		expect(Object.keys(dump).sort()).toEqual(['facts','jobs','plans','scores','sessions'])
		expect(dump.jobs.map((j:{id:string}) => j.id)).toEqual([r.job.id])
		expect(dump.facts).toHaveLength(2)
		expect(dump.sessions.map((s:Session) => s.number)).toEqual([1,2])
		expect(dump.sessions[1].transcript).toEqual(t2)
		expect(dump.scores).toEqual([g1,g2])
		expect(dump.plans).toEqual([plan])
		expect(keysOf(dump).filter((k) => BAD_KEY.test(k))).toEqual([])

		expect(llm.calls.map((c) => c.name).sort()).toEqual(['grade','grade','grade','grade','grade','grade','next','research_company','research_facts','session'])

		expect(await ok(await app.request(`/user/${USER}`,{method:'DELETE'}))).toEqual({deleted:{jobs:1,sessions:2}})
		expect(await ok(await app.request(`/user/${USER}/export`))).toEqual({jobs:[],facts:[],sessions:[],scores:[],plans:[]})
		await failed(await app.request(`/session/${s1.id}`),404,'not_found')
		await failed(await post('/grade',{session_id:s2.id}),404,'not_found')
		await failed(await post('/next',{session_id:s1.id}),404,'not_found')
	})

	it('a second research of the company comes from the cache, a new user gets the facts too',async () => {
		const {llm,post} = setup()
		const a = await ok(await post('/research',{user_id:USER,job_description:JD}))
		const calls = wire.mock.calls.length

		const b = await ok(await post('/research',{user_id:randomUUID(),job_description:JD}))
		expect(b.cached).toBe(true)
		expect(b.facts).toEqual(a.facts)
		expect(b.job.id).not.toBe(a.job.id)
		expect(wire.mock.calls.length).toBe(calls + 2)
		expect(wire.mock.calls.slice(calls).map((a) => a[0].pathname)).toEqual(['/robots.txt','/'])
		expect(count(llm,'research_facts')).toBe(1)
	})

	it('a session straight from a job description reaches next without research',async () => {
		const {app,llm,post} = setup()
		const s = PublicSession.parse(await ok(await post('/session',{user_id:USER,job_description:'Backend Engineer, no company named'})))
		expect(s.flow[0].text).toContain('any company mentioned')
		await ok(await post(`/session/${s.id}/transcript`,{turns:interview(s,(q) => `I would start by asking : ${q}`),final:true}))
		await ok(await post('/grade',{session_id:s.id}))
		const n = await ok(await post('/next',{session_id:s.id}))
		expect(n.session.number).toBe(2)
		expect(wire).not.toHaveBeenCalled()
		expect(count(llm,'research_company')).toBe(0)
		expect((await ok(await app.request(`/user/${USER}/export`))).jobs).toHaveLength(1)
	})
})

describe('demo facts stay out of the real company cache',() => {
	const demo = createDemo()
	const company_url = demo.research().company_url
	const ask = {user_id:USER,job_description:'Backend Engineer at N26',company_url}

	it.each([
		['/research',{user_id:USER,job_description:'x',demo:true}],
		['/session',{user_id:USER,job_description:'x',demo:true}],
	])('after a demo %s',async (path,body) => {
		const {post} = setup({demo})
		await ok(await post(path,body))
		const r = await ok(await post('/research',ask))
		expect(r.cached).toBe(false)
		expect(r.job.demo).toBe(false)
		expect(wire).toHaveBeenCalled()
	})
})
