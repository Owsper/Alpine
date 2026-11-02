import {randomUUID} from 'node:crypto'
import {z} from 'zod'
import {Dim,DimScore,Fact,Question,Turn} from './contracts'
import type {Demo} from './deps'
import factsJson from './demo/facts.json'
import jobJson from './demo/job.json'
import followupScoreJson from './demo/followup-score.json'
import followupJson from './demo/followup-transcript.json'
import nextJson from './demo/next.json'
import questionsJson from './demo/questions.json'
import scoreJson from './demo/score.json'
import transcriptJson from './demo/transcript.json'

const Text = z.string().min(1)
const Company = z.object({company_name:Text,company_url:z.url(),company_key:Text,facts:z.array(Fact).min(4)})
const SampleJob = z.object({sample:z.literal(true),role_title:Text,job_description:Text})
const Graded = z.object({scores:z.array(DimScore).length(6),strengths:z.array(Dim),weakest:z.tuple([Dim,Dim])})
const Bank = z.object({weak:z.record(Dim,z.tuple([Text,Text])),new:Text})

const sig = (t:Turn[]) => JSON.stringify(t.map((x) => [x.role,x.text]))

// the question bank quotes these, a refresh of facts.json has to keep them
export const DEMO_CLAIMS = ['change the relationship people have with money for the better','24 markets worldwide','fully licensed German bank']

export const missingClaims = (facts:Fact[]) => DEMO_CLAIMS.filter((c) => !facts.some((f) => f.claim.includes(c)))

export function createDemo():Demo {
	const company = Company.parse(factsJson)
	const {role_title,job_description} = SampleJob.parse(jobJson)
	const questions = z.array(Question).length(5).parse(questionsJson)
	const turns = z.array(Turn).parse(transcriptJson)
	const graded = Graded.parse(scoreJson)
	const followup = z.array(Turn).parse(followupJson)
	const gradedFollowup = Graded.parse(followupScoreJson)
	const bank = Bank.parse(nextJson)
	const anchor = questions.find((q) => q.kind === 'anchor')!

	return {
		research:() => ({...company,role_title,job_description}),
		firstQuestions:() => questions,
		transcript:() => turns,
		followupTranscript:() => followup,
		isDemoTranscript:(t) => sig(t) === sig(turns) || sig(t) === sig(followup),
		gradeFallback:(session_id,now,t) => ({...(t && sig(t) === sig(followup) ? gradedFollowup : graded),session_id,progress:null,fallback:true,graded_at:now.toISOString()}),
		nextQuestions:([a,b]) => [
			{id:randomUUID(),text:bank.weak[a][0],kind:'weak',dimension:a},
			{id:randomUUID(),text:bank.weak[a][1],kind:'weak',dimension:a},
			{id:randomUUID(),text:bank.weak[b][0],kind:'weak',dimension:b},
			{id:randomUUID(),text:anchor.text,kind:'anchor',dimension:null},
			{id:randomUUID(),text:bank.new,kind:'new',dimension:null},
		],
	}
}
