import type {Context} from 'hono'
import {z} from 'zod'

const CODES = {
	bad_request:{status:400,retryable:false},
	not_found:{status:404,retryable:false},
	invalid_state:{status:409,retryable:false},
	session_conflict:{status:409,retryable:true},
	grading_in_progress:{status:409,retryable:true},
	payload_too_large:{status:413,retryable:false},
	transcript_too_long:{status:413,retryable:false},
	unsupported_media_type:{status:415,retryable:false},
	no_candidate_answers:{status:422,retryable:false},
	source_not_allowed:{status:422,retryable:false},
	rate_limited:{status:429,retryable:true},
	budget_exceeded:{status:429,retryable:false},
	llm_rate_limited:{status:429,retryable:true},
	internal:{status:500,retryable:false},
	llm_bad_output:{status:502,retryable:true},
	llm_unavailable:{status:503,retryable:true},
	llm_config:{status:503,retryable:false},
	store_unavailable:{status:503,retryable:true},
	llm_timeout:{status:504,retryable:true},
} as const

export type Code = keyof typeof CODES

export class ApiErr extends Error {
	code:Code
	status:(typeof CODES)[Code]['status']
	retryable:boolean
	details?:unknown

	constructor(code:Code,message:string = code,details?:unknown) {
		super(message)
		this.name = 'ApiErr'
		this.code = code
		this.status = CODES[code].status
		this.retryable = CODES[code].retryable
		this.details = details
	}
}

export function toApiErr(e:unknown) {
	if (e instanceof ApiErr) return e
	if (e instanceof z.ZodError) return new ApiErr('bad_request','invalid request',e.issues)
	if (e instanceof SyntaxError) return new ApiErr('bad_request','body is not valid json')
	return new ApiErr('internal','internal error')
}

export function errRes(c:Context,e:ApiErr) {
	const {code,message,retryable,details} = e
	return c.json({error:{code,message,retryable,details}},e.status)
}
