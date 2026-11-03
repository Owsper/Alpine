import {randomUUID} from 'node:crypto'
import {describe,expect,it} from 'vitest'
import {DIMS,Job,Plan,Score,Session} from '../src/contracts'
import type {Status} from '../src/contracts'
import type {Store} from '../src/store/types'
import {makeApp} from './helpers'

const NOW = '2026-11-02T10:00:00.000Z'

function mkSession(user:string,jobId:string,number:number,tag:string,status:Status,src:string|null) {
	const questions = Array.from({length:5},(v,i) => ({id:randomUUID(),text:tag + ' question ' + i,kind:'base',dimension:null}))
	return Session.parse({
		id:randomUUID(),
		user_id:user,
		job_id:jobId,
		number,
		status,
		questions,
		flow:[{type:'intro',text:'I am an AI interviewer',question_id:null}],
		interviewer_instructions:tag + ' instructions',
		transcript:[{role:'candidate',text:tag + ' answer'}],
		grading_started_at:null,
		source_session_id:src,
		created_at:NOW,
		updated_at:NOW,
	})
}

async function seed(store:Store,tag:string) {
	const user = randomUUID()
	const job = await store.createJob(Job.parse({
		id:randomUUID(),
		user_id:user,
		description:tag + ' job description',
		company_name:tag,
		company_url:'https://' + tag + '.test',
		company_key:tag + '.test',
		role_title:'dev',
		demo:false,
		created_at:NOW,
	}))
	const fact = {claim:tag + ' claim',source_url:'https://' + tag + '.test/about',retrieved_at:NOW}
	await store.addFacts(job.id,job.company_key,[fact])

	const s1 = mkSession(user,job.id,1,tag,'graded',null)
	const s2 = mkSession(user,job.id,2,tag,'created',s1.id)
	await store.createSession(s1)
	await store.createSession(s2)

	const score = await store.saveScore(Score.parse({
		session_id:s1.id,
		scores:DIMS.map((d) => ({dimension:d,score:3,evidence_quote:tag + ' answer',tip:tag + ' tip',noise:0})),
		strengths:['star'],
		weakest:['evidence','conciseness'],
		progress:null,
		fallback:false,
		graded_at:NOW,
	}))
	const plan = await store.savePlan(Plan.parse({
		id:randomUUID(),
		session_id:s1.id,
		next_session_id:s2.id,
		weakest:['evidence','conciseness'],
		composition:{weak:3,anchor:1,new:1},
		created_at:NOW,
	}))
	return {user,job,fact,s1,s2,score,plan}
}

const del = (app:ReturnType<typeof makeApp>['app'],id:string) => app.request('/user/' + id,{method:'DELETE'})
const EMPTY = {jobs:[],facts:[],sessions:[],scores:[],plans:[]}

describe('GET /user/:id/export',() => {
	it('returns every row of the user and nothing from others',async () => {
		const {app,store} = makeApp()
		const a = await seed(store,'alpha')
		const b = await seed(store,'bravo')

		const res = await app.request('/user/' + a.user + '/export')
		expect(res.status).toBe(200)
		const raw = await res.text()
		expect(JSON.parse(raw)).toEqual({
			jobs:[a.job],
			facts:[{...a.fact,job_id:a.job.id}],
			sessions:[a.s1,a.s2],
			scores:[a.score],
			plans:[a.plan],
		})
		for (const leak of ['bravo',b.user,b.job.id,b.s1.id,b.s2.id,b.plan.id]) expect(raw).not.toContain(leak)
	})

	it('returns empty lists for an unknown user',async () => {
		const {app} = makeApp()
		const res = await app.request('/user/' + randomUUID() + '/export')
		expect(res.status).toBe(200)
		expect(await res.json()).toEqual(EMPTY)
	})

	it('rejects an id that is not a uuid',async () => {
		const {app} = makeApp()
		const res = await app.request('/user/nope/export')
		expect(res.status).toBe(400)
		const {error} = await res.json() as any
		expect(error.code).toBe('bad_request')
		expect(error.retryable).toBe(false)
		expect(error.details).toBeTruthy()
	})
})

describe('DELETE /user/:id',() => {
	it('cascades through every table and leaves other users intact',async () => {
		const {app,store} = makeApp()
		const a = await seed(store,'alpha')
		const b = await seed(store,'bravo')
		const bBefore = await store.exportUser(b.user)

		const res = await del(app,a.user)
		expect(res.status).toBe(200)
		expect(await res.json()).toEqual({deleted:{jobs:1,sessions:2}})

		expect(await store.getJob(a.job.id)).toBeNull()
		expect(await store.getFacts(a.job.id)).toEqual([])
		expect(await store.cachedFacts('alpha.test',1e12,new Date(NOW))).toEqual([])
		for (const s of [a.s1,a.s2]) {
			expect(await store.getSession(s.id)).toBeNull()
			expect(await store.getScore(s.id)).toBeNull()
			expect(await store.getPlanBySession(s.id)).toBeNull()
		}
		const after = await app.request('/user/' + a.user + '/export')
		expect(await after.json()).toEqual(EMPTY)

		expect(await store.exportUser(b.user)).toEqual(bBefore)
		expect(await store.cachedFacts('bravo.test',1e12,new Date(NOW))).toEqual([b.fact])
	})

	it('is safe to repeat',async () => {
		const {app,store} = makeApp()
		const a = await seed(store,'alpha')
		const b = await seed(store,'bravo')
		const bBefore = await store.exportUser(b.user)

		await del(app,a.user)
		const res = await del(app,a.user)
		expect(res.status).toBe(200)
		expect(await res.json()).toEqual({deleted:{jobs:0,sessions:0}})
		expect(await store.exportUser(b.user)).toEqual(bBefore)
	})

	it('is safe for an unknown user',async () => {
		const {app} = makeApp()
		const res = await del(app,randomUUID())
		expect(res.status).toBe(200)
		expect(await res.json()).toEqual({deleted:{jobs:0,sessions:0}})
	})

	it('rejects an id that is not a uuid and deletes nothing',async () => {
		const {app,store} = makeApp()
		const a = await seed(store,'alpha')
		const res = await del(app,'nope')
		expect(res.status).toBe(400)
		const {error} = await res.json() as any
		expect(error.code).toBe('bad_request')
		expect(await store.getJob(a.job.id)).not.toBeNull()
	})
})
