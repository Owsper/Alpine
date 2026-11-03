import {createClient} from '@supabase/supabase-js'
import type {Fact,Job,Plan,Score,Session,Status} from '../contracts'
import type {Env} from '../env'
import {ApiErr} from '../errors'
import {type SessionPatch,type Store,stampAfter} from './types'

const UNIQUE = '23505'
const BAD_TEXT = ['22P05','22P02','PGRST102'] // nul char, lone surrogate in an array insert, lone surrogate
const STORE_MS = 10000
// postgrest caps a response at 1000 rows and a url over about 16 kb breaks the node client
const PAGE = 500
const CHUNK = 100

const ts = (v:string) => new Date(v).toISOString()
const idOf = (r:any):string => r.id
const toJob = (r:any):Job => ({...r,created_at:ts(r.created_at)})
const toFact = (r:any):Fact => ({claim:r.claim,source_url:r.source_url,retrieved_at:ts(r.retrieved_at)})
const toScore = (r:any):Score => ({...r,graded_at:ts(r.graded_at)})
const toPlan = (r:any):Plan => ({...r,created_at:ts(r.created_at)})
const toSession = (r:any):Session => ({
	...r,
	grading_started_at:r.grading_started_at && ts(r.grading_started_at),
	created_at:ts(r.created_at),
	updated_at:ts(r.updated_at),
})

function must(r:{data:any,status?:number,error:{code:string,message:string}|null}) {
	if (!r.error) return r.data
	if (BAD_TEXT.includes(r.error.code)) throw new ApiErr('bad_request','text has characters that cannot be stored')
	console.error('store',r.status,r.error.code)
	if (!r.status || r.status >= 500 || r.error.code?.startsWith('PGRST00')) throw new ApiErr('store_unavailable','the database is unavailable')
	throw new Error('supabase ' + r.error.code + ' : ' + r.error.message)
}

async function all(query:(from:number,to:number) => PromiseLike<any>) {
	const rows:any[] = []
	for (let from = 0; ; from += PAGE) {
		const got = must(await query(from,from + PAGE - 1))
		rows.push(...got)
		if (got.length < PAGE) return rows
	}
}

async function inChunks(ids:string[],query:(ids:string[],from:number,to:number) => PromiseLike<any>) {
	const rows:any[] = []
	for (let i = 0; i < ids.length; i += CHUNK) {
		const part = ids.slice(i,i + CHUNK)
		rows.push(...await all((from,to) => query(part,from,to)))
	}
	return rows
}

export function supabaseStore(env:Env,timeoutMs = STORE_MS):Store {
	if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
	// the client's own retries would turn one stalled read into 4 timeouts plus backoff, the frontend retries instead
	const db = createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},db:{timeout:timeoutMs,retry:false}})

	async function update(id:string,from:Status[],patch:SessionPatch) {
		const row = {...patch,updated_at:patch.updated_at ?? new Date().toISOString()}
		const rows = must(await db.from('sessions').update(row).eq('id',id).in('status',from).select())
		return rows[0] ? toSession(rows[0]) : null
	}

	return {
		kind:'supabase',

		async ping() {
			must(await db.from('jobs').select('id').limit(1))
		},

		async createJob(j) {
			return toJob(must(await db.from('jobs').insert(j).select().single()))
		},

		async getJob(id) {
			const r = must(await db.from('jobs').select().eq('id',id).maybeSingle())
			return r && toJob(r)
		},

		async addFacts(jobId,companyKey,list) {
			if (!list.length) return
			const rows = list.map((f) => ({...toFact(f),job_id:jobId,company_key:companyKey}))
			must(await db.from('company_facts').insert(rows))
		},

		async getFacts(jobId) {
			const rows = must(await db.from('company_facts').select().eq('job_id',jobId).order('retrieved_at').order('id'))
			return rows.map(toFact)
		},

		async cachedFacts(companyKey,maxAgeMs,now) {
			const cutoff = new Date(now.getTime() - maxAgeMs).toISOString()
			const rows = must(await db.from('company_facts').select().eq('company_key',companyKey).gte('retrieved_at',cutoff).order('retrieved_at',{ascending:false}))
			const best = new Map<string,Fact>()
			for (const r of rows) {
				const k = r.source_url + '\n' + r.claim
				if (!best.has(k)) best.set(k,toFact(r))
			}
			return [...best.values()]
		},

		async createSession(s) {
			const r = await db.from('sessions').insert(s).select().single()
			if (r.error?.code === UNIQUE && r.error.message.includes('sessions_job_number_key')) return null
			return toSession(must(r))
		},

		async getSession(id) {
			const r = must(await db.from('sessions').select().eq('id',id).maybeSingle())
			return r && toSession(r)
		},

		async listSessions(jobId) {
			return (await all((a,b) => db.from('sessions').select().eq('job_id',jobId).order('number').range(a,b))).map(toSession)
		},

		async lastSessionNumber(jobId) {
			const rows = must(await db.from('sessions').select('number').eq('job_id',jobId).order('number',{ascending:false}).limit(1))
			return rows[0]?.number ?? 0
		},

		updateSession:update,

		async saveTranscript(id,from,turns,toStatus,seen) {
			const rows = must(await db.from('sessions').update({transcript:turns,status:toStatus,updated_at:stampAfter(seen)}).eq('id',id).in('status',from).eq('updated_at',seen).select())
			return rows[0] ? toSession(rows[0]) : null
		},

		async claimGrading(id,leaseMs,now) {
			const cutoff = new Date(now.getTime() - leaseMs).toISOString()
			const rows = must(await db.from('sessions')
				.update({grading_started_at:now.toISOString()})
				.eq('id',id)
				.eq('status','completed')
				.or(`grading_started_at.is.null,grading_started_at.lt."${cutoff}"`)
				.select('id'))
			return rows.length > 0
		},

		async releaseGrading(id,claim) {
			const q = db.from('sessions').update({grading_started_at:null}).eq('id',id)
			must(await (claim ? q.eq('grading_started_at',claim) : q))
		},

		async saveScore(score) {
			const r = await db.from('scores').insert(score).select().single()
			if (r.error?.code !== UNIQUE) return toScore(must(r))
			return toScore(must(await db.from('scores').select().eq('session_id',score.session_id).single()))
		},

		async getScore(sessionId) {
			const r = must(await db.from('scores').select().eq('session_id',sessionId).maybeSingle())
			return r && toScore(r)
		},

		async savePlan(plan) {
			const r = await db.from('plans').insert(plan).select().single()
			if (r.error?.code !== UNIQUE) return toPlan(must(r))
			return toPlan(must(await db.from('plans').select().eq('session_id',plan.session_id).single()))
		},

		async getPlanBySession(sessionId) {
			const r = must(await db.from('plans').select().eq('session_id',sessionId).maybeSingle())
			return r && toPlan(r)
		},

		async exportUser(userId) {
			const jobs = await all((a,b) => db.from('jobs').select().eq('user_id',userId).order('created_at').order('id').range(a,b))
			const sessions = await all((a,b) => db.from('sessions').select().eq('user_id',userId).order('created_at').order('id').range(a,b))
			const ids = sessions.map(idOf)
			const [facts,scores,plans] = await Promise.all([
				inChunks(jobs.map(idOf),(c,a,b) => db.from('company_facts').select().in('job_id',c).order('retrieved_at').order('id').range(a,b)),
				inChunks(ids,(c,a,b) => db.from('scores').select().in('session_id',c).order('session_id').range(a,b)),
				inChunks(ids,(c,a,b) => db.from('plans').select().in('session_id',c).order('id').range(a,b)),
			])
			return {
				jobs:jobs.map(toJob),
				facts:facts.map((f:any) => ({...toFact(f),job_id:f.job_id})),
				sessions:sessions.map(toSession),
				scores:scores.map(toScore),
				plans:plans.map(toPlan),
			}
		},

		async deleteUser(userId) {
			const jobs = (await all((a,b) => db.from('jobs').select('id').eq('user_id',userId).order('id').range(a,b))).map(idOf)
			const own = await all((a,b) => db.from('sessions').select('id').eq('user_id',userId).order('id').range(a,b))
			const onJobs = await inChunks(jobs,(c,a,b) => db.from('sessions').select('id').in('job_id',c).order('id').range(a,b))
			// one statement : the cascade takes facts, sessions, scores and plans with the job, so a failure can not leave job text behind
			must(await db.from('jobs').delete().eq('user_id',userId))
			must(await db.from('sessions').delete().eq('user_id',userId))
			return {jobs:jobs.length,sessions:new Set([...own,...onJobs].map(idOf)).size}
		},
	}
}
