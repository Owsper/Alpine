import {randomUUID} from 'node:crypto'
import {describe,expect,it,vi} from 'vitest'
import {DIMS,Plan,PublicSession,type Dim,type Job,type Question,type Score,type Session,type Status} from '../src/contracts'
import type {Demo} from '../src/deps'
import {ApiErr} from '../src/errors'
import type {Store} from '../src/store/types'
import {fakeLlm,makeApp} from './helpers'

const ANCHOR = 'Tell me about a time you resolved a conflict on your team.'
const TS = '2026-01-01T00:00:00.000Z'
const q = (text:string,kind:Question['kind'] = 'base',dimension:Dim|null = null):Question => ({id:randomUUID(),text,kind,dimension})

function firstQs(anchor = ANCHOR) {
	return [q('Base one'),q('Base two'),q('Base three'),q('Base four'),q(anchor,'anchor')]
}

function sess(job:Job,number:number,questions:Question[],o:Partial<Session> = {}):Session {
	return {
		id:randomUUID(),
		user_id:job.user_id,
		job_id:job.id,
		number,
		status:'graded',
		questions,
		flow:[],
		interviewer_instructions:'',
		transcript:[{role:'candidate',text:'answer'}],
		grading_started_at:null,
		source_session_id:null,
		created_at:TS,
		updated_at:TS,
		...o,
	}
}

function scoreOf(sessionId:string,weakest:[Dim,Dim] = ['star','evidence']):Score {
	return {
		session_id:sessionId,
		scores:DIMS.map((dimension) => ({dimension,score:3,evidence_quote:'quote on ' + dimension,tip:'tip on ' + dimension,noise:0})),
		strengths:[],
		weakest,
		progress:null,
		fallback:false,
		graded_at:TS,
	}
}

async function seed(store:Store,o:{demo?:boolean,status?:Status,weakest?:[Dim,Dim]} = {}) {
	const job = await store.createJob({
		id:randomUUID(),
		user_id:randomUUID(),
		description:'Backend engineer at Acme',
		company_name:'Acme',
		company_url:'https://acme.test/',
		company_key:'acme.test',
		role_title:'Backend engineer',
		demo:o.demo ?? false,
		created_at:TS,
	})
	await store.addFacts(job.id,'acme.test',[{claim:'Acme makes anvils',source_url:'https://acme.test/about',retrieved_at:TS}])
	const src = sess(job,1,firstQs(),{status:o.status ?? 'graded'})
	await store.createSession(src)
	if (src.status === 'graded') await store.saveScore(scoreOf(src.id,o.weakest))
	return {job,src}
}

let seq = 0
function nextOut() {
	seq++
	return {weak:[`Weak A ${seq}`,`Weak B ${seq}`,`Weak C ${seq}`],new:`New ${seq}`}
}

function post(app:ReturnType<typeof makeApp>['app'],session_id:unknown) {
	return app.request('/next',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({session_id})})
}

async function allSessions(store:Store,job:Job) {
	return (await store.exportUser(job.user_id)).sessions.filter((s) => s.job_id === job.id)
}

function fakeDemo():Demo {
	return {
		research() {
			throw new Error('unused')
		},
		firstQuestions:() => firstQs(),
		transcript:() => [],
		followupTranscript:() => [],
		isDemoTranscript:() => false,
		gradeFallback() {
			throw new Error('unused')
		},
		nextQuestions:([a,b]) => [
			q('Demo weak 1','weak',a),
			q('Demo weak 2','weak',a),
			q('Demo weak 3','weak',b),
			q('Demo anchor that drifted','anchor'),
			q('Demo new','new'),
		],
	}
}

describe('POST /next',() => {
	it('builds exactly 3 weak, 1 anchor, 1 new with a 2+1 split',async () => {
		const llm = fakeLlm({next:() => ({weak:['W1','W2','W3'],new:'N1'})})
		const {app,store} = makeApp({llm})
		const {job,src} = await seed(store,{weakest:['conciseness','star']})

		const res = await post(app,src.id)
		expect(res.status).toBe(200)
		const {plan,session} = await res.json() as any
		Plan.parse(plan)
		PublicSession.parse(session)

		expect(session.questions.map((x:Question) => [x.kind,x.dimension,x.text])).toEqual([
			['weak','conciseness','W1'],
			['weak','conciseness','W2'],
			['weak','star','W3'],
			['anchor',null,ANCHOR],
			['new',null,'N1'],
		])
		expect(new Set(session.questions.map((x:Question) => x.id)).size).toBe(5)
		expect(plan.composition).toEqual({weak:3,anchor:1,new:1})
		expect(plan.weakest).toEqual(['conciseness','star'])
		expect(plan.session_id).toBe(src.id)
		expect(plan.next_session_id).toBe(session.id)

		expect(session.status).toBe('created')
		expect(session.number).toBe(2)
		expect(session.source_session_id).toBe(src.id)
		expect(session.job_id).toBe(job.id)
		expect(session.user_id).toBeUndefined()
		expect(session.transcript).toBeNull()
		expect(await store.getPlanBySession(src.id)).toEqual(plan)
	})

	it('builds flow and instructions from the new questions with the session helpers',async () => {
		const llm = fakeLlm({next:nextOut})
		const {app,store} = makeApp({llm})
		const {src} = await seed(store)

		const {session} = await (await post(app,src.id)).json() as any
		const steps = session.flow.filter((s:any) => s.type === 'question')
		expect(steps.map((s:any) => s.question_id)).toEqual(session.questions.map((x:Question) => x.id))
		expect(session.flow[0].type).toBe('intro')
		expect(session.flow.at(-1).type).toBe('outro')
		for (const x of session.questions) expect(session.interviewer_instructions).toContain(x.text)
	})

	it('keeps the anchor verbatim from session 1 at session 3',async () => {
		const llm = fakeLlm({next:nextOut})
		const {app,store} = makeApp({llm})
		const {src} = await seed(store)

		const s2 = (await (await post(app,src.id)).json() as any).session
		await store.updateSession(s2.id,['created'],{status:'graded'})
		await store.saveScore(scoreOf(s2.id,['relevance','company_fit']))
		const res = await post(app,s2.id)
		expect(res.status).toBe(200)
		const {plan,session} = await res.json() as any

		expect(session.number).toBe(3)
		expect(session.source_session_id).toBe(s2.id)
		expect(session.questions.filter((x:Question) => x.kind === 'anchor').map((x:Question) => x.text)).toEqual([ANCHOR])
		expect(plan.weakest).toEqual(['relevance','company_fit'])
	})

	it('takes the anchor from the source session, the one the candidate answered',async () => {
		const llm = fakeLlm({next:nextOut})
		const {app,store} = makeApp({llm})
		const {job} = await seed(store)
		const s2 = sess(job,2,firstQs('A different anchor'))
		await store.createSession(s2)
		await store.saveScore(scoreOf(s2.id))

		const {session} = await (await post(app,s2.id)).json() as any
		expect(session.number).toBe(3)
		expect(session.questions.find((x:Question) => x.kind === 'anchor').text).toBe('A different anchor')
	})

	it('passes earlier questions as exclusions plus score feedback and untrusted data wording',async () => {
		const llm = fakeLlm({next:nextOut})
		const {app,store} = makeApp({llm})
		const {src} = await seed(store,{weakest:['star','evidence']})

		const s2 = (await (await post(app,src.id)).json() as any).session
		await store.updateSession(s2.id,['created'],{status:'graded'})
		await store.saveScore(scoreOf(s2.id,['relevance','company_fit']))
		await post(app,s2.id)

		expect(llm.calls.length).toBe(2)
		const call = llm.calls[1]
		expect(call.name).toBe('next')
		const data = JSON.parse(call.user)
		const texts = [...src.questions,...s2.questions].map((x:Question) => x.text)
		expect(new Set(data.excluded_questions)).toEqual(new Set(texts))
		expect(data.excluded_questions.filter((t:string) => t === ANCHOR).length).toBe(1)
		expect(data.job_description).toBe('Backend engineer at Acme')
		expect(data.facts).toEqual([{claim:'Acme makes anvils',source_url:'https://acme.test/about'}])
		expect(data.weakest).toEqual(['relevance','company_fit'])
		expect(data.feedback.map((f:any) => [f.dimension,f.tip,f.evidence_quote])).toEqual([
			['relevance','tip on relevance','quote on relevance'],
			['company_fit','tip on company_fit','quote on company_fit'],
		])
		expect(call.system).toMatch(/untrusted/)
		expect(call.system).toContain('weak[0] and weak[1] train "relevance"')
		expect(call.system).toContain('weak[2] trains "company_fit"')
	})

	it.each(['created','in_progress'] as const)('rejects a %s session with invalid_state',async (status) => {
		const llm = fakeLlm({next:nextOut})
		const {app,store} = makeApp({llm})
		const {src} = await seed(store,{status})
		await store.saveScore(scoreOf(src.id))

		const res = await post(app,src.id)
		expect(res.status).toBe(409)
		expect(((await res.json()) as any).error.code).toBe('invalid_state')
		expect(llm.calls.length).toBe(0)
	})

	it('rejects a graded session that has no score with invalid_state',async () => {
		const llm = fakeLlm({next:nextOut})
		const {app,store} = makeApp({llm})
		const {src} = await seed(store,{status:'completed'})
		await store.updateSession(src.id,['completed'],{status:'graded'})

		const res = await post(app,src.id)
		expect(res.status).toBe(409)
		expect(((await res.json()) as any).error.code).toBe('invalid_state')
		expect(llm.calls.length).toBe(0)
	})

	it('maps an unknown session to not_found and a bad id to bad_request',async () => {
		const {app} = makeApp()
		const miss = await post(app,randomUUID())
		expect(miss.status).toBe(404)
		expect(((await miss.json()) as any).error.code).toBe('not_found')
		const bad = await post(app,'nope')
		expect(bad.status).toBe(400)
		expect(((await bad.json()) as any).error.code).toBe('bad_request')
	})

	it('returns the same plan and session on repeat with no second llm call',async () => {
		const llm = fakeLlm({next:nextOut})
		const {app,store} = makeApp({llm})
		const {job,src} = await seed(store)

		const one = await (await post(app,src.id)).json()
		const two = await (await post(app,src.id)).json()
		expect(two).toEqual(one)
		expect(llm.calls.length).toBe(1)
		expect(await store.lastSessionNumber(job.id)).toBe(2)
	})

	it('settles concurrent calls on one session and one plan even when one llm call finishes much later',async () => {
		const box:{job?:Job} = {}
		let release = () => {}
		const gate = new Promise<void>((r) => release = r)
		const llm = fakeLlm({
			next:async () => {
				const nth = llm.calls.length
				if (nth === 2) release()
				await gate
				while (nth === 2 && await store.lastSessionNumber(box.job!.id) < 2) await new Promise((r) => setImmediate(r))
				return nextOut()
			},
		})
		const {app,store} = makeApp({llm})
		const {job,src} = await seed(store)
		box.job = job

		const [a,b] = await Promise.all([post(app,src.id),post(app,src.id)])
		expect([a.status,b.status]).toEqual([200,200])
		const [ra,rb] = await Promise.all([a.json(),b.json()]) as any[]
		expect(llm.calls.length).toBe(2)
		expect(ra).toEqual(rb)
		expect(ra.session.number).toBe(2)
		expect((await allSessions(store,job)).length).toBe(2)
	})

	it('reuses the winner session when the conflict comes before its plan is saved',async () => {
		const llm = fakeLlm({next:nextOut})
		const {app,store} = makeApp({llm})
		const {job,src} = await seed(store)
		const winner = sess(job,2,firstQs(),{status:'created',source_session_id:src.id,transcript:null})
		const real = store.createSession.bind(store)
		const spy = vi.spyOn(store,'createSession').mockImplementation(async (s) => {
			await real(winner)
			return real(s)
		})

		const res = await post(app,src.id)
		expect(res.status).toBe(200)
		const {plan,session} = await res.json() as any
		expect(spy).toHaveBeenCalledTimes(1)
		expect(session.id).toBe(winner.id)
		expect(plan.next_session_id).toBe(winner.id)
		expect((await allSessions(store,job)).length).toBe(2)
	})

	it('moves to a free number when an unrelated session took it during the llm call',async () => {
		const box:{job?:Job} = {}
		const {app,store} = makeApp({
			llm:fakeLlm({
				next:async () => {
					await store.createSession(sess(box.job!,2,firstQs('Other'),{status:'created'}))
					return nextOut()
				},
			}),
		})
		const {job,src} = await seed(store)
		box.job = job

		const res = await post(app,src.id)
		expect(res.status).toBe(200)
		const {session} = await res.json() as any
		expect(session.number).toBe(3)
		expect(session.source_session_id).toBe(src.id)
		expect(session.questions.find((x:Question) => x.kind === 'anchor').text).toBe(ANCHOR)
	})

	it('fails with a retryable conflict when the number stays taken and leaves no plan',async () => {
		const {app,store,llm} = makeApp({llm:fakeLlm({next:nextOut})})
		const {src} = await seed(store)
		const spy = vi.spyOn(store,'createSession').mockResolvedValue(null)

		const res = await post(app,src.id)
		expect(res.status).toBe(409)
		expect(((await res.json()) as any).error).toMatchObject({code:'session_conflict',retryable:true})
		expect(spy).toHaveBeenCalledTimes(2)
		expect(llm.calls.length).toBe(1)
		expect(await store.getPlanBySession(src.id)).toBeNull()
	})

	it('reuses a session left behind without a plan and skips the llm',async () => {
		const {app,store,llm} = makeApp({llm:fakeLlm({next:nextOut})})
		const {job,src} = await seed(store)
		const left = sess(job,2,firstQs(),{status:'created',source_session_id:src.id,transcript:null})
		await store.createSession(left)

		const res = await post(app,src.id)
		expect(res.status).toBe(200)
		const {plan,session} = await res.json() as any
		expect(session.id).toBe(left.id)
		expect(plan.next_session_id).toBe(left.id)
		expect(llm.calls.length).toBe(0)
	})

	it('falls back to demo questions on provider failure for a demo job',async () => {
		const llm = fakeLlm({
			next:() => {
				throw new ApiErr('llm_unavailable','down')
			},
		})
		const {app,store} = makeApp({llm,demo:fakeDemo()})
		const {src} = await seed(store,{demo:true,weakest:['star','evidence']})

		const res = await post(app,src.id)
		expect(res.status).toBe(200)
		const {plan,session} = await res.json() as any
		expect(llm.calls.length).toBe(1)
		expect(session.questions.map((x:Question) => [x.kind,x.dimension,x.text])).toEqual([
			['weak','star','Demo weak 1'],
			['weak','star','Demo weak 2'],
			['weak','evidence','Demo weak 3'],
			['anchor',null,ANCHOR],
			['new',null,'Demo new'],
		])
		expect(plan.composition).toEqual({weak:3,anchor:1,new:1})
		expect(session.source_session_id).toBe(src.id)
	})

	it('does not use demo questions for a real job, fails clean and lets a retry work',async () => {
		let down = true
		const llm = fakeLlm({
			next:() => {
				if (down) throw new ApiErr('llm_unavailable','down')
				return nextOut()
			},
		})
		const {app,store} = makeApp({llm,demo:fakeDemo()})
		const {job,src} = await seed(store)

		const res = await post(app,src.id)
		expect(res.status).toBe(503)
		const body = await res.json() as any
		expect(body.error.code).toBe('llm_unavailable')
		expect(body.error.retryable).toBe(true)
		expect((await allSessions(store,job)).length).toBe(1)
		expect(await store.getPlanBySession(src.id)).toBeNull()

		down = false
		const again = await post(app,src.id)
		expect(again.status).toBe(200)
		const {session} = await again.json() as any
		expect(session.questions.some((x:Question) => x.text.startsWith('Demo'))).toBe(false)
	})

	it('does not fall back for a demo job when the app has no demo mode',async () => {
		const llm = fakeLlm({
			next:() => {
				throw new ApiErr('llm_timeout','slow')
			},
		})
		const {app,store} = makeApp({llm})
		const {src} = await seed(store,{demo:true})

		const res = await post(app,src.id)
		expect(res.status).toBe(504)
		expect(((await res.json()) as any).error.code).toBe('llm_timeout')
	})

	it('rejects llm output with the wrong shape and creates nothing',async () => {
		const llm = fakeLlm({next:() => ({weak:['only','two'],new:'N'})})
		const {app,store} = makeApp({llm})
		const {job,src} = await seed(store)

		const res = await post(app,src.id)
		expect(res.status).toBe(502)
		expect(((await res.json()) as any).error.code).toBe('llm_bad_output')
		expect((await allSessions(store,job)).length).toBe(1)
	})
})
