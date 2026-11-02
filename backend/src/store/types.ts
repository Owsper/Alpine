import type {Fact,Job,Plan,Score,Session,Status,Turn} from '../contracts'

export type SessionPatch = Partial<Omit<Session,'id'>>
export type UserExport = {jobs:Job[],facts:(Fact & {job_id:string})[],sessions:Session[],scores:Score[],plans:Plan[]}

export interface Store {
	kind:'memory'|'supabase'
	ping():Promise<void>
	createJob(j:Job):Promise<Job>
	getJob(id:string):Promise<Job|null>
	addFacts(jobId:string,companyKey:string|null,facts:Fact[]):Promise<void>
	getFacts(jobId:string):Promise<Fact[]>
	cachedFacts(companyKey:string,maxAgeMs:number,now:Date):Promise<Fact[]>
	createSession(s:Session):Promise<Session|null>
	getSession(id:string):Promise<Session|null>
	listSessions(jobId:string):Promise<Session[]>
	lastSessionNumber(jobId:string):Promise<number>
	updateSession(id:string,from:Status[],patch:SessionPatch):Promise<Session|null>
	saveTranscript(id:string,from:Status[],turns:Turn[],toStatus:Status):Promise<Session|null>
	claimGrading(id:string,leaseMs:number,now:Date):Promise<boolean>
	releaseGrading(id:string,claim?:string):Promise<void>
	saveScore(score:Score):Promise<Score>
	getScore(sessionId:string):Promise<Score|null>
	savePlan(plan:Plan):Promise<Plan>
	getPlanBySession(sessionId:string):Promise<Plan|null>
	exportUser(userId:string):Promise<UserExport>
	deleteUser(userId:string):Promise<{jobs:number,sessions:number}>
}
