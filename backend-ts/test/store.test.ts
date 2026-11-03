import {randomUUID as uuid} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {afterAll,describe,expect,it} from 'vitest'
import {DIMS,Job,Plan,Question,Score,Session,type Fact,type Turn} from '../src/contracts'
import {memStore} from '../src/store/mem'
import {supabaseStore} from '../src/store/supabase'
import type {Store} from '../src/store/types'
import {testEnv} from './helpers'

const {TEST_SUPABASE_URL:url,TEST_SUPABASE_KEY:key} = process.env
const liveDb = () => supabaseStore({...testEnv,SUPABASE_URL:url,SUPABASE_SERVICE_ROLE_KEY:key})

const suites:[string,() => Store][] = [['memory',memStore]]
if (url && key) suites.push(['supabase',liveDb])

const iso = () => new Date().toISOString()
const ago = (ms:number,from = Date.now()) => new Date(from - ms).toISOString()
const byClaim = (a:Fact,b:Fact) => a.claim.localeCompare(b.claim)

describe.each(suites)('store contract : %s',(name,make) => {
	const store = make()
	const users:string[] = []

	function newUser() {
		const u = uuid()
		users.push(u)
		return u
	}

	function jobFor(user_id:string,o:Partial<Job> = {}):Job {
		return Job.parse({
			id:uuid(),
			user_id,
			description:'build things "quoted" ünï',
			company_name:'Acme',
			company_url:'https://acme.test/',
			company_key:'acme.test',
			role_title:'dev',
			demo:false,
			created_at:iso(),
			...o,
		})
	}

	function sessFor(job:Job,number:number,o:Partial<Session> = {}):Session {
		const questions = Array.from({length:5},(v,i):Question => ({id:uuid(),text:'q' + i,kind:i ? 'base' : 'anchor',dimension:null}))
		return Session.parse({
			id:uuid(),
			user_id:job.user_id,
			job_id:job.id,
			number,
			status:'created',
			questions,
			flow:[{type:'intro',text:'I am an AI interviewer',question_id:null},{type:'question',text:'q0',question_id:questions[0].id}],
			interviewer_instructions:'ask',
			transcript:null,
			grading_started_at:null,
			source_session_id:null,
			created_at:iso(),
			updated_at:iso(),
			...o,
		})
	}

	function scoreFor(session_id:string,quote = 'i built it'):Score {
		return Score.parse({
			session_id,
			scores:DIMS.map((dimension) => ({dimension,score:3,evidence_quote:quote,tip:'be specific',noise:0.4714045207910317})),
			strengths:['relevance'],
			weakest:['star','evidence'],
			progress:null,
			fallback:false,
			graded_at:iso(),
		})
	}

	function planFor(session_id:string,next_session_id:string):Plan {
		return Plan.parse({
			id:uuid(),
			session_id,
			next_session_id,
			weakest:['star','evidence'],
			composition:{weak:3,anchor:1,new:1},
			created_at:iso(),
		})
	}

	async function seed(number = 1,o:Partial<Session> = {}) {
		const job = await store.createJob(jobFor(newUser()))
		const sess = await store.createSession(sessFor(job,number,o))
		return {job,sess:sess!}
	}

	afterAll(async () => {
		for (const u of users) await store.deleteUser(u)
	})

	it('has the right kind',() => {
		expect(store.kind).toBe(name)
	})

	describe('jobs',() => {
		it('round trips and validates against the contract',async () => {
			const j = jobFor(newUser())
			expect(await store.createJob(j)).toEqual(j)
			const got = await store.getJob(j.id)
			expect(got).toEqual(j)
			expect(Job.safeParse(got).success).toBe(true)
		})

		it('keeps nulls',async () => {
			const j = jobFor(newUser(),{company_name:null,company_url:null,company_key:null,role_title:null,demo:true})
			await store.createJob(j)
			expect(await store.getJob(j.id)).toEqual(j)
		})

		it('returns null for unknown id',async () => {
			expect(await store.getJob(uuid())).toBeNull()
		})

		it('rejects a duplicate id',async () => {
			const j = jobFor(newUser())
			await store.createJob(j)
			await expect(store.createJob(j)).rejects.toThrow()
		})
	})

	describe('facts',() => {
		const key = () => uuid() + '.test'
		const fact = (claim:string,retrieved_at = iso()):Fact => ({claim,source_url:'https://acme.test/about',retrieved_at})

		it('adds and reads per job, without internal columns',async () => {
			const u = newUser()
			const a = await store.createJob(jobFor(u))
			const b = await store.createJob(jobFor(u))
			const k = key()
			const list = [fact('one'),fact('two')]
			await store.addFacts(a.id,k,list)
			await store.addFacts(b.id,k,[fact('other')])
			expect((await store.getFacts(a.id)).sort(byClaim)).toEqual(list)
			expect(await store.getFacts(uuid())).toEqual([])
		})

		it('accepts an empty list',async () => {
			const j = await store.createJob(jobFor(newUser()))
			await store.addFacts(j.id,key(),[])
			expect(await store.getFacts(j.id)).toEqual([])
		})

		it('rejects an unknown job',async () => {
			await expect(store.addFacts(uuid(),key(),[fact('x')])).rejects.toThrow()
		})

		it('caches by company, drops stale, dedupes to the newest',async () => {
			const now = Date.now()
			const week = 7 * 24 * 3600 * 1000
			const k = key()
			const a = await store.createJob(jobFor(newUser()))
			const b = await store.createJob(jobFor(newUser()))
			await store.addFacts(a.id,k,[fact('dup',ago(5000,now)),fact('old',ago(week + 1,now)),fact('edge',ago(week,now))])
			await store.addFacts(b.id,k,[fact('dup',ago(1000,now)),fact('fresh',ago(0,now))])
			await store.addFacts(b.id,key(),[fact('elsewhere',ago(0,now))])
			const got = await store.cachedFacts(k,week,new Date(now))
			expect(got.sort(byClaim)).toEqual([fact('dup',ago(1000,now)),fact('edge',ago(week,now)),fact('fresh',ago(0,now))])
			expect(await store.cachedFacts(key(),week,new Date(now))).toEqual([])
		})
	})

	describe('sessions',() => {
		it('round trips and validates against the contract',async () => {
			const job = await store.createJob(jobFor(newUser()))
			const s = sessFor(job,1)
			expect(await store.createSession(s)).toEqual(s)
			const got = await store.getSession(s.id)
			expect(got).toEqual(s)
			expect(Session.safeParse(got).success).toBe(true)
		})

		it('returns null for unknown id',async () => {
			expect(await store.getSession(uuid())).toBeNull()
		})

		it('returns null on a job and number conflict',async () => {
			const {job} = await seed()
			const s = sessFor(job,1)
			expect(await store.createSession(s)).toBeNull()
			expect(await store.getSession(s.id)).toBeNull()
		})

		it('lets exactly one of many racing creates win',async () => {
			const job = await store.createJob(jobFor(newUser()))
			const got = await Promise.all(Array.from({length:8},() => store.createSession(sessFor(job,1))))
			expect(got.filter(Boolean)).toHaveLength(1)
		})

		it('allows the same number on another job',async () => {
			await seed()
			const other = await seed()
			expect(other.sess.number).toBe(1)
		})

		it('rejects a duplicate id and an unknown job',async () => {
			const {job,sess} = await seed()
			await expect(store.createSession({...sess,number:2})).rejects.toThrow()
			await expect(store.createSession({...sessFor(job,3),job_id:uuid()})).rejects.toThrow()
		})

		it('tracks the last number',async () => {
			const job = await store.createJob(jobFor(newUser()))
			expect(await store.lastSessionNumber(job.id)).toBe(0)
			await store.createSession(sessFor(job,1))
			await store.createSession(sessFor(job,4))
			await store.createSession(sessFor(job,2))
			expect(await store.lastSessionNumber(job.id)).toBe(4)
			expect(await store.lastSessionNumber(uuid())).toBe(0)
		})

		it('lists the sessions of one job in number order',async () => {
			const job = await store.createJob(jobFor(newUser()))
			const other = await seed()
			await store.createSession(sessFor(job,3))
			await store.createSession(sessFor(job,1))
			await store.createSession(sessFor(job,2))
			expect((await store.listSessions(job.id)).map((s) => s.number)).toEqual([1,2,3])
			expect((await store.listSessions(other.job.id)).map((s) => s.id)).toEqual([other.sess.id])
			expect(await store.listSessions(uuid())).toEqual([])
		})

		it('answers a ping',async () => {
			await expect(store.ping()).resolves.toBeUndefined()
		})
	})

	describe('updateSession',() => {
		it('sets the patch when the status matches',async () => {
			const {sess} = await seed()
			const got = await store.updateSession(sess.id,['created'],{status:'in_progress'})
			expect(got).toMatchObject({id:sess.id,status:'in_progress',questions:sess.questions})
			expect(await store.getSession(sess.id)).toEqual(got)
		})

		it('refuses and changes nothing when the status does not match',async () => {
			const {sess} = await seed()
			expect(await store.updateSession(sess.id,['completed','graded'],{status:'graded'})).toBeNull()
			expect(await store.updateSession(sess.id,[],{status:'graded'})).toBeNull()
			expect(await store.getSession(sess.id)).toEqual(sess)
		})

		it('returns null for unknown id',async () => {
			expect(await store.updateSession(uuid(),['created'],{status:'in_progress'})).toBeNull()
		})

		it('bumps updated_at unless the patch sets it',async () => {
			const old = ago(60000)
			const {sess} = await seed(1,{updated_at:old})
			const got = await store.updateSession(sess.id,['created'],{status:'in_progress'})
			expect(Date.parse(got!.updated_at)).toBeGreaterThan(Date.parse(old))
			const at = ago(1000)
			const set = await store.updateSession(sess.id,['in_progress'],{updated_at:at})
			expect(set!.updated_at).toBe(at)
		})

		it('lets exactly one of many racing moves win',async () => {
			const {sess} = await seed()
			const got = await Promise.all(Array.from({length:8},() => store.updateSession(sess.id,['created'],{status:'in_progress'})))
			expect(got.filter(Boolean)).toHaveLength(1)
		})
	})

	describe('saveTranscript',() => {
		const turns:Turn[] = [
			{role:'interviewer',text:'why us',question_id:uuid()},
			{role:'candidate',text:'erm "so" I\nbuilt it ünï 🙂',question_id:null},
			{role:'candidate',text:'no qid'},
		]

		it('stores turns verbatim and moves status',async () => {
			const {sess} = await seed()
			const got = await store.saveTranscript(sess.id,['created','in_progress'],turns,'in_progress',sess.updated_at)
			expect(got).toMatchObject({status:'in_progress',transcript:turns})
			expect(JSON.stringify(got!.transcript)).toBe(JSON.stringify(turns))
			expect(await store.getSession(sess.id)).toEqual(got)
		})

		it('replaces, never appends',async () => {
			const {sess} = await seed()
			const one = await store.saveTranscript(sess.id,['created'],turns,'in_progress',sess.updated_at)
			const got = await store.saveTranscript(sess.id,['in_progress'],turns.slice(0,1),'completed',one!.updated_at)
			expect(got).toMatchObject({status:'completed',transcript:turns.slice(0,1)})
		})

		it('refuses a wrong status and keeps the old transcript',async () => {
			const {sess} = await seed()
			const one = await store.saveTranscript(sess.id,['created'],turns,'completed',sess.updated_at)
			expect(await store.saveTranscript(sess.id,['created','in_progress'],[],'in_progress',one!.updated_at)).toBeNull()
			expect((await store.getSession(sess.id))!.transcript).toEqual(turns)
		})

		it('only writes over the version that was read',async () => {
			const {sess} = await seed()
			const one = await store.saveTranscript(sess.id,['created'],turns,'in_progress',sess.updated_at)
			expect(one).toMatchObject({transcript:turns})
			expect(await store.saveTranscript(sess.id,['in_progress'],turns.slice(0,1),'in_progress',sess.updated_at)).toBeNull()
			expect(await store.getSession(sess.id)).toEqual(one)
		})

		it('every write makes a new version, even in the same millisecond',async () => {
			const {sess} = await seed()
			let seen = sess.updated_at
			for (let i = 0; i < 20; i++) {
				const up = await store.saveTranscript(sess.id,['created','in_progress'],turns,'in_progress',seen)
				expect(Date.parse(up!.updated_at)).toBeGreaterThan(Date.parse(seen))
				seen = up!.updated_at
			}
		})

		it('a version from the future still moves on',async () => {
			const later = ago(-3600000)
			const {sess} = await seed(1,{updated_at:later})
			const up = await store.saveTranscript(sess.id,['created'],turns,'in_progress',later)
			expect(Date.parse(up!.updated_at)).toBeGreaterThan(Date.parse(later))
		})

		it('of two writers on one version exactly one lands',async () => {
			const {sess} = await seed()
			const out = await Promise.all([turns,turns.slice(0,1)].map((t) => store.saveTranscript(sess.id,['created','in_progress'],t,'in_progress',sess.updated_at)))
			const won = out.filter((s) => s !== null)
			expect(won).toHaveLength(1)
			expect(await store.getSession(sess.id)).toEqual(won[0])
		})

		it('a miss on an unknown session is null',async () => {
			expect(await store.saveTranscript(uuid(),['created'],turns,'in_progress',iso())).toBeNull()
		})
	})

	describe('claimGrading',() => {
		const lease = 300000

		async function done() {
			const {sess} = await seed()
			await store.updateSession(sess.id,['created'],{status:'completed'})
			return sess.id
		}

		it('claims only a completed session',async () => {
			const {sess} = await seed()
			expect(await store.claimGrading(sess.id,lease,new Date())).toBe(false)
			await store.updateSession(sess.id,['created'],{status:'in_progress'})
			expect(await store.claimGrading(sess.id,lease,new Date())).toBe(false)
			await store.updateSession(sess.id,['in_progress'],{status:'graded'})
			expect(await store.claimGrading(sess.id,lease,new Date())).toBe(false)
			expect(await store.claimGrading(uuid(),lease,new Date())).toBe(false)
		})

		it('holds the lease and records the time',async () => {
			const id = await done()
			const now = new Date()
			expect(await store.claimGrading(id,lease,now)).toBe(true)
			expect((await store.getSession(id))!.grading_started_at).toBe(now.toISOString())
			expect(await store.claimGrading(id,lease,now)).toBe(false)
			expect(await store.claimGrading(id,lease,new Date(now.getTime() + lease))).toBe(false)
		})

		it('lets a new claim in once the lease is over',async () => {
			const id = await done()
			const now = new Date()
			await store.claimGrading(id,lease,now)
			const later = new Date(now.getTime() + lease + 1)
			expect(await store.claimGrading(id,lease,later)).toBe(true)
			expect((await store.getSession(id))!.grading_started_at).toBe(later.toISOString())
		})

		it('lets exactly one of many racing claims win',async () => {
			const id = await done()
			const now = new Date()
			const got = await Promise.all(Array.from({length:8},() => store.claimGrading(id,lease,now)))
			expect(got.filter(Boolean)).toHaveLength(1)
		})

		it('can claim again after a release',async () => {
			const id = await done()
			await store.claimGrading(id,lease,new Date())
			await store.releaseGrading(id)
			expect((await store.getSession(id))!.grading_started_at).toBeNull()
			expect(await store.claimGrading(id,lease,new Date())).toBe(true)
			await store.releaseGrading(uuid())
		})

		it('a release with a claim only clears that claim',async () => {
			const id = await done()
			const first = new Date('2026-01-01T00:00:00.000Z')
			const second = new Date(first.getTime() + 301000)
			expect(await store.claimGrading(id,300000,first)).toBe(true)
			expect(await store.claimGrading(id,300000,second)).toBe(true)
			await store.releaseGrading(id,first.toISOString())
			expect((await store.getSession(id))!.grading_started_at).toBe(second.toISOString())
			await store.releaseGrading(id,second.toISOString())
			expect((await store.getSession(id))!.grading_started_at).toBeNull()
		})
	})

	describe('scores',() => {
		it('round trips and validates against the contract',async () => {
			const {sess} = await seed()
			const s = scoreFor(sess.id)
			expect(await store.saveScore(s)).toEqual(s)
			const got = await store.getScore(sess.id)
			expect(got).toEqual(s)
			expect(Score.safeParse(got).success).toBe(true)
		})

		it('keeps progress',async () => {
			const {sess} = await seed()
			const s = {...scoreFor(sess.id),progress:[{dimension:'star' as const,prev:2,cur:3,delta:1,noise:0.5,significant:true}]}
			await store.saveScore(s)
			expect(await store.getScore(sess.id)).toEqual(s)
		})

		it('first write wins',async () => {
			const {sess} = await seed()
			const first = scoreFor(sess.id,'first')
			await store.saveScore(first)
			expect(await store.saveScore(scoreFor(sess.id,'second'))).toEqual(first)
			expect(await store.getScore(sess.id)).toEqual(first)
		})

		it('first write wins under a race',async () => {
			const {sess} = await seed()
			const got = await Promise.all(Array.from({length:8},(v,i) => store.saveScore(scoreFor(sess.id,'run' + i))))
			const stored = await store.getScore(sess.id)
			for (const s of got) expect(s).toEqual(stored)
		})

		it('returns null when missing and rejects an unknown session',async () => {
			expect(await store.getScore(uuid())).toBeNull()
			await expect(store.saveScore(scoreFor(uuid()))).rejects.toThrow()
		})
	})

	describe('plans',() => {
		it('round trips and validates against the contract',async () => {
			const {job,sess} = await seed()
			const next = (await store.createSession(sessFor(job,2,{source_session_id:sess.id})))!
			const p = planFor(sess.id,next.id)
			expect(await store.savePlan(p)).toEqual(p)
			const got = await store.getPlanBySession(sess.id)
			expect(got).toEqual(p)
			expect(Plan.safeParse(got).success).toBe(true)
		})

		it('first write wins per session, also under a race',async () => {
			const {job,sess} = await seed()
			const next = (await store.createSession(sessFor(job,2)))!
			const got = await Promise.all(Array.from({length:8},() => store.savePlan(planFor(sess.id,next.id))))
			const stored = await store.getPlanBySession(sess.id)
			for (const p of got) expect(p).toEqual(stored)
		})

		it('returns null when missing and rejects unknown sessions',async () => {
			const {sess} = await seed()
			expect(await store.getPlanBySession(uuid())).toBeNull()
			await expect(store.savePlan(planFor(uuid(),sess.id))).rejects.toThrow()
			await expect(store.savePlan(planFor(sess.id,uuid()))).rejects.toThrow()
		})
	})

	describe('users',() => {
		async function full() {
			const {job,sess} = await seed()
			const next = (await store.createSession(sessFor(job,2,{source_session_id:sess.id})))!
			const k = uuid() + '.test'
			const f:Fact = {claim:'fact',source_url:'https://acme.test/',retrieved_at:iso()}
			await store.addFacts(job.id,k,[f])
			const score = scoreFor(sess.id)
			await store.saveScore(score)
			const plan = planFor(sess.id,next.id)
			await store.savePlan(plan)
			return {job,sess,next,k,f,score,plan}
		}

		it('exports everything for the user and nothing else',async () => {
			const a = await full()
			await full()
			const got = await store.exportUser(a.job.user_id)
			expect(got.jobs).toEqual([a.job])
			expect(got.facts).toEqual([{...a.f,job_id:a.job.id}])
			expect(got.sessions).toHaveLength(2)
			expect(got.sessions).toEqual(expect.arrayContaining([a.sess,a.next]))
			expect(got.scores).toEqual([a.score])
			expect(got.plans).toEqual([a.plan])
		})

		it('exports an empty shape for an unknown user',async () => {
			expect(await store.exportUser(uuid())).toEqual({jobs:[],facts:[],sessions:[],scores:[],plans:[]})
		})

		it('deletes with cascades and counts',async () => {
			const a = await full()
			const b = await full()
			expect(await store.deleteUser(a.job.user_id)).toEqual({jobs:1,sessions:2})
			expect(await store.getJob(a.job.id)).toBeNull()
			expect(await store.getFacts(a.job.id)).toEqual([])
			expect(await store.cachedFacts(a.k,60000,new Date())).toEqual([])
			expect(await store.getSession(a.sess.id)).toBeNull()
			expect(await store.getSession(a.next.id)).toBeNull()
			expect(await store.getScore(a.sess.id)).toBeNull()
			expect(await store.getPlanBySession(a.sess.id)).toBeNull()
			expect(await store.exportUser(a.job.user_id)).toEqual({jobs:[],facts:[],sessions:[],scores:[],plans:[]})
			expect(await store.getJob(b.job.id)).toEqual(b.job)
			expect(await store.getScore(b.sess.id)).toEqual(b.score)
			expect(await store.getPlanBySession(b.sess.id)).toEqual(b.plan)
		})

		it('deleting twice or an unknown user is a no-op',async () => {
			const a = await full()
			await store.deleteUser(a.job.user_id)
			expect(await store.deleteUser(a.job.user_id)).toEqual({jobs:0,sessions:0})
			expect(await store.deleteUser(uuid())).toEqual({jobs:0,sessions:0})
		})

		it('cascades across owners : a job takes foreign sessions, a session takes plans and clears sources',async () => {
			const u = newUser()
			const other = newUser()
			const job = await store.createJob(jobFor(u))
			const mine = (await store.createSession(sessFor(job,1)))!
			const foreign = (await store.createSession({...sessFor(job,2),user_id:other}))!
			const otherJob = await store.createJob(jobFor(other))
			const child = (await store.createSession(sessFor(otherJob,1,{source_session_id:foreign.id})))!
			const childPlan = await store.savePlan(planFor(child.id,child.id))
			const crossPlan = await store.savePlan(planFor(foreign.id,child.id))
			expect(await store.deleteUser(u)).toEqual({jobs:1,sessions:2})
			expect(await store.getSession(mine.id)).toBeNull()
			expect(await store.getSession(foreign.id)).toBeNull()
			expect((await store.getSession(child.id))!.source_session_id).toBeNull()
			expect(await store.getPlanBySession(foreign.id)).toBeNull()
			expect(crossPlan.session_id).toBe(foreign.id)
			expect(await store.getPlanBySession(child.id)).toEqual(childPlan)
		})
	})
})

describe.runIf(url && key)('postgres constraints',() => {
	const store = url && key ? liveDb() : memStore()

	const job = (over:Partial<Job> = {}):Job => ({
		id:uuid(),
		user_id:uuid(),
		description:'d',
		company_name:null,
		company_url:null,
		company_key:null,
		role_title:null,
		demo:false,
		created_at:iso(),
		...over,
	})

	it('rejects a non http source_url',async () => {
		const j = await store.createJob(job())
		await expect(store.addFacts(j.id,'k',[{claim:'c',source_url:'ftp://acme.test/',retrieved_at:iso()}])).rejects.toThrow('23514')
		await store.deleteUser(j.user_id)
	})

	it('rejects a non http company_url',async () => {
		await expect(store.createJob(job({company_url:'javascript:alert(1)'}))).rejects.toThrow('23514')
	})

	const sess = (j:Job,status:string) => ({
		id:uuid(),
		user_id:j.user_id,
		job_id:j.id,
		number:1,
		status,
		questions:[],
		flow:[],
		interviewer_instructions:'',
		transcript:null,
		grading_started_at:null,
		source_session_id:null,
		created_at:iso(),
		updated_at:iso(),
	}) as unknown as Session

	it('rejects an unknown status',async () => {
		const j = await store.createJob(job())
		await expect(store.createSession(sess(j,'nope'))).rejects.toThrow('23514')
		await store.deleteUser(j.user_id)
	})

	it('turns text postgres cannot store into bad_request',async () => {
		const j = await store.createJob(job())
		const s = (await store.createSession(sess(j,'created')))!
		for (const text of ['a\u0000b','a\ud83db']) {
			await expect(store.createJob(job({description:text}))).rejects.toMatchObject({code:'bad_request'})
			await expect(store.saveTranscript(s.id,['created'],[{role:'candidate',text}],'in_progress',s.updated_at)).rejects.toMatchObject({code:'bad_request'})
		}
		await store.deleteUser(j.user_id)
	})

	// the store reads ms, so a stored microsecond would never equal what was read
	it.each(['05.123456','05.999999'])('a row written at second %s can still save a transcript',async (sec) => {
		const j = await store.createJob(job())
		const s = (await store.createSession({...sess(j,'created'),updated_at:`2026-01-02T03:04:${sec}Z`}))!
		expect(await store.saveTranscript(s.id,['created'],[{role:'candidate',text:'hi'}],'in_progress',s.updated_at)).not.toBeNull()
		await store.deleteUser(j.user_id)
	})

	it('a lease written with microseconds can be released with the value read back',async () => {
		const j = await store.createJob(job())
		const s = (await store.createSession({...sess(j,'completed'),grading_started_at:'2026-01-02T03:04:05.123456Z'}))!
		await store.releaseGrading(s.id,s.grading_started_at!)
		expect((await store.getSession(s.id))!.grading_started_at).toBeNull()
		await store.deleteUser(j.user_id)
	})
})

describe('migration',() => {
	it('timestamps the store compares with eq hold the ms it reads back',() => {
		const sql = readFileSync(new URL('../supabase/migrations/0001_init.sql',import.meta.url),'utf8')
		for (const col of ['updated_at','grading_started_at']) expect(sql).toContain(col + ' timestamptz(3)')
	})
})
