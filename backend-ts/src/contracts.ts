import {z} from 'zod'
import {okText} from './text'

export const Id = z.uuid()
const Ts = z.iso.datetime({offset:true})
const HttpUrl = z.url({protocol:/^https?$/})

export const DIMS = ['star','relevance','role_knowledge','company_fit','conciseness','evidence'] as const
export const Dim = z.enum(DIMS)
export type Dim = z.infer<typeof Dim>

export const Status = z.enum(['created','in_progress','completed','graded'])
export type Status = z.infer<typeof Status>

export const Job = z.object({
	id:Id,
	user_id:Id,
	description:z.string(),
	company_name:z.string().nullable(),
	company_url:HttpUrl.nullable(),
	company_key:z.string().nullable(),
	role_title:z.string().nullable(),
	demo:z.boolean(),
	created_at:Ts,
})
export type Job = z.infer<typeof Job>

export const Fact = z.object({
	claim:z.string().min(1),
	source_url:HttpUrl,
	retrieved_at:Ts,
})
export type Fact = z.infer<typeof Fact>

export const Question = z.object({
	id:Id,
	text:z.string().min(1),
	kind:z.enum(['base','weak','anchor','new']),
	dimension:Dim.nullable(),
})
export type Question = z.infer<typeof Question>

export const FlowStep = z.object({
	type:z.enum(['intro','question','outro']),
	text:z.string(),
	question_id:Id.nullable(),
})
export type FlowStep = z.infer<typeof FlowStep>

export const Turn = z.strictObject({
	role:z.enum(['interviewer','candidate']),
	text:z.string().refine(okText,'text has characters that cannot be stored'),
	question_id:Id.nullable().optional(),
})
export type Turn = z.infer<typeof Turn>

export const Session = z.object({
	id:Id,
	user_id:Id,
	job_id:Id,
	number:z.int().positive(),
	status:Status,
	questions:z.array(Question).length(5),
	flow:z.array(FlowStep),
	interviewer_instructions:z.string(),
	transcript:z.array(Turn).nullable(),
	grading_started_at:Ts.nullable(),
	source_session_id:Id.nullable(),
	created_at:Ts,
	updated_at:Ts,
})
export type Session = z.infer<typeof Session>

export const PublicSession = Session.omit({user_id:true})
export type PublicSession = z.infer<typeof PublicSession>

const Rating = z.int().min(1).max(5)
const Noise = z.number().min(0)
const Weakest = z.tuple([Dim,Dim])

export const DimScore = z.object({
	dimension:Dim,
	score:Rating,
	evidence_quote:z.string().min(1),
	tip:z.string().min(1),
	noise:Noise,
})
export type DimScore = z.infer<typeof DimScore>

export const Progress = z.object({
	dimension:Dim,
	prev:Rating,
	cur:Rating,
	delta:z.int(),
	noise:Noise,
	significant:z.boolean(),
})
export type Progress = z.infer<typeof Progress>

export const Score = z.object({
	session_id:Id,
	scores:z.array(DimScore).length(6),
	strengths:z.array(Dim),
	weakest:Weakest,
	progress:z.array(Progress).nullable(),
	fallback:z.boolean(),
	graded_at:Ts,
})
export type Score = z.infer<typeof Score>

export const Plan = z.object({
	id:Id,
	session_id:Id,
	next_session_id:Id,
	weakest:Weakest,
	composition:z.object({weak:z.literal(3),anchor:z.literal(1),new:z.literal(1)}),
	created_at:Ts,
})
export type Plan = z.infer<typeof Plan>
