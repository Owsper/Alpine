import type {Dim,Fact,Question,Score,Turn} from './contracts'
import type {Env} from './env'
import type {Llm} from './llm'
import type {Store} from './store/types'

export type Demo = {
	research():{company_name:string,company_url:string,company_key:string,role_title:string,job_description:string,facts:Fact[]}
	firstQuestions():Question[]
	transcript():Turn[]
	followupTranscript():Turn[]
	isDemoTranscript(t:Turn[]):boolean
	gradeFallback(sessionId:string,now:Date,turns?:Turn[]):Score
	nextQuestions(weakest:[Dim,Dim]):Question[]
}

export type Deps = {store:Store,llm:Llm,env:Env,demo?:Demo,now:() => Date,gone?:Map<string,number>}
