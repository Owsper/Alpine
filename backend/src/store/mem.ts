import type {Fact,Job,Plan,Score,Session,Status} from '../contracts'
import type {SessionPatch,Store} from './types'

type FactRow = Fact & {job_id:string,company_key:string|null}

const toFact = ({claim,source_url,retrieved_at}:Fact):Fact => ({claim,source_url,retrieved_at})

export function memStore():Store {
	const jobs = new Map<string,Job>()
	const sessions = new Map<string,Session>()
	const scores = new Map<string,Score>()
	const plans = new Map<string,Plan>()
	let facts:FactRow[] = []

	function needJob(id:string) {
		if (!jobs.has(id)) throw new Error('fk violation : job')
	}

	function needSession(id:string) {
		if (!sessions.has(id)) throw new Error('fk violation : session')
	}

	function update(id:string,from:Status[],patch:SessionPatch) {
		const s = sessions.get(id)
		if (!s || !from.includes(s.status)) return null
		Object.assign(s,structuredClone(patch),{updated_at:patch.updated_at ?? new Date().toISOString()})
		return structuredClone(s)
	}

	return {
		kind:'memory',

		async ping() {},

		async createJob(j) {
			if (jobs.has(j.id)) throw new Error('pk violation : job')
			jobs.set(j.id,structuredClone(j))
			return structuredClone(j)
		},

		async getJob(id) {
			return structuredClone(jobs.get(id) ?? null)
		},

		async addFacts(jobId,companyKey,list) {
			needJob(jobId)
			for (const f of list) facts.push({...toFact(f),job_id:jobId,company_key:companyKey})
		},

		async getFacts(jobId) {
			return facts.filter((f) => f.job_id === jobId).map(toFact)
		},

		async cachedFacts(companyKey,maxAgeMs,now) {
			const best = new Map<string,Fact>()
			for (const f of facts) {
				const t = Date.parse(f.retrieved_at)
				if (f.company_key !== companyKey || now.getTime() - t > maxAgeMs) continue
				const k = f.source_url + '\n' + f.claim
				const had = best.get(k)
				if (!had || t > Date.parse(had.retrieved_at)) best.set(k,toFact(f))
			}
			return [...best.values()]
		},

		async createSession(s) {
			needJob(s.job_id)
			if (sessions.has(s.id)) throw new Error('pk violation : session')
			for (const o of sessions.values()) {
				if (o.job_id === s.job_id && o.number === s.number) return null
			}
			sessions.set(s.id,structuredClone(s))
			return structuredClone(s)
		},

		async getSession(id) {
			return structuredClone(sessions.get(id) ?? null)
		},

		async listSessions(jobId) {
			return structuredClone([...sessions.values()].filter((s) => s.job_id === jobId).sort((a,b) => a.number - b.number))
		},

		async lastSessionNumber(jobId) {
			let last = 0
			for (const s of sessions.values()) {
				if (s.job_id === jobId && s.number > last) last = s.number
			}
			return last
		},

		async updateSession(id,from,patch) {
			return update(id,from,patch)
		},

		async saveTranscript(id,from,turns,toStatus) {
			return update(id,from,{transcript:turns,status:toStatus})
		},

		async claimGrading(id,leaseMs,now) {
			const s = sessions.get(id)
			if (!s || s.status !== 'completed') return false
			if (s.grading_started_at && now.getTime() - Date.parse(s.grading_started_at) <= leaseMs) return false
			s.grading_started_at = now.toISOString()
			return true
		},

		async releaseGrading(id,claim) {
			const s = sessions.get(id)
			if (s && (!claim || s.grading_started_at === claim)) s.grading_started_at = null
		},

		async saveScore(score) {
			needSession(score.session_id)
			const had = scores.get(score.session_id)
			if (had) return structuredClone(had)
			scores.set(score.session_id,structuredClone(score))
			return structuredClone(score)
		},

		async getScore(sessionId) {
			return structuredClone(scores.get(sessionId) ?? null)
		},

		async savePlan(plan) {
			needSession(plan.session_id)
			needSession(plan.next_session_id)
			const had = plans.get(plan.session_id)
			if (had) return structuredClone(had)
			plans.set(plan.session_id,structuredClone(plan))
			return structuredClone(plan)
		},

		async getPlanBySession(sessionId) {
			return structuredClone(plans.get(sessionId) ?? null)
		},

		async exportUser(userId) {
			const myJobs = [...jobs.values()].filter((j) => j.user_id === userId)
			const jobIds = new Set(myJobs.map((j) => j.id))
			const mySessions = [...sessions.values()].filter((s) => s.user_id === userId)
			const ids = new Set(mySessions.map((s) => s.id))
			return structuredClone({
				jobs:myJobs,
				facts:facts.filter((f) => jobIds.has(f.job_id)).map((f) => ({...toFact(f),job_id:f.job_id})),
				sessions:mySessions,
				scores:[...scores.values()].filter((s) => ids.has(s.session_id)),
				plans:[...plans.values()].filter((p) => ids.has(p.session_id)),
			})
		},

		async deleteUser(userId) {
			const jobIds = new Set([...jobs.values()].filter((j) => j.user_id === userId).map((j) => j.id))
			const gone = new Set([...sessions.values()].filter((s) => s.user_id === userId || jobIds.has(s.job_id)).map((s) => s.id))
			for (const id of jobIds) jobs.delete(id)
			facts = facts.filter((f) => !jobIds.has(f.job_id))
			for (const id of gone) {
				sessions.delete(id)
				scores.delete(id)
			}
			for (const [id,p] of plans) {
				if (gone.has(p.session_id) || gone.has(p.next_session_id)) plans.delete(id)
			}
			for (const s of sessions.values()) {
				if (s.source_session_id && gone.has(s.source_session_id)) s.source_session_id = null
			}
			return {jobs:jobIds.size,sessions:gone.size}
		},
	}
}
