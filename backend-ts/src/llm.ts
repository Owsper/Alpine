import {AsyncLocalStorage} from 'node:async_hooks'
import OpenAI,{APIConnectionTimeoutError,APIError,RateLimitError} from 'openai'
import type {ChatCompletion} from 'openai/resources/chat/completions'
import {Agent} from 'undici'
import {z} from 'zod'
import type {Env} from './env'
import {ApiErr} from './errors'

// about 30% of new connections to the relay stall at connect and never reach the model, so fail fast, retry and keep sockets open
const CONNECT_TRIES = 4
// the relay key is the same on both models, so these will not get better on the fallback
const AUTH = [401,402,403]
const CLIENT_SHARE = 0.2
// one /grade round is 3 calls, a share below that can never finish one
const MIN_SHARE = 3

// a demo job stops waiting here and uses canned questions aimed at the same weak dimensions. A healthy /next took a median of 27 s and up to 64 s live under load
export const DEMO_MS = 30000

export const rejected = (why:string) => '\n\nYour last answer was rejected. ' + why + ' Write it again.'

export const llmClient = new AsyncLocalStorage<string>()

export type LlmCall<T> = {name:string,schema:z.ZodType<T>,system:string,user:string,maxTokens?:number,timeoutMs?:number,signal?:AbortSignal}

class CutOff extends ApiErr {
	constructor() {
		super('llm_bad_output','llm output was cut off')
	}
}

const cancelled = () => new ApiErr('llm_timeout','llm call was cancelled')

export async function withDeadline<T>(ms:number,run:(signal:AbortSignal) => Promise<T>) {
	const ac = new AbortController()
	let timer:NodeJS.Timeout|undefined
	const late = new Promise<never>((ok,no) => {
		timer = setTimeout(() => {
			no(new ApiErr('llm_timeout','llm deadline passed'))
			ac.abort()
		},ms)
	})
	try {
		return await Promise.race([run(ac.signal),late])
	} finally {
		clearTimeout(timer)
	}
}

export interface Llm {
	json<T>(o:LlmCall<T>):Promise<T>
}

// the relay's grammar rejects a string mixing format, pattern and length (400 on glm, 500 on deepseek), zod still checks the output
function toSchema<T>(schema:z.ZodType<T>) {
	return z.toJSONSchema(schema,{
		unrepresentable:'any',
		override:({jsonSchema:s}) => {
			if (s.format) delete s.pattern
			if (s.format || s.pattern) {
				delete s.minLength
				delete s.maxLength
			}
		},
	})
}

function stripFences(s:string) {
	const m = s.trim().match(/^```[\w-]*\s*([\s\S]*?)\s*```$/)
	return m ? m[1] : s.trim()
}

function decode<T>(schema:z.ZodType<T>,res:ChatCompletion) {
	const choice = res?.choices?.[0]
	const text = choice?.message?.content
	if (choice?.finish_reason === 'length') throw new CutOff()
	if (!text) return null
	try {
		return schema.safeParse(JSON.parse(stripFences(text)))
	} catch {
		return null
	}
}

function transient(e:unknown) {
	if (e instanceof ApiErr) return e instanceof CutOff
	return !(e instanceof APIError && AUTH.includes(e.status as number))
}

function connectStall(e:unknown) {
	let c = e as any
	for (let i = 0; c && i < 5; i++,c = c.cause) if (c.code === 'UND_ERR_CONNECT_TIMEOUT') return true
	return false
}

function toLlmErr(e:unknown) {
	if (e instanceof ApiErr) return e
	const status = e instanceof APIError ? e.status : undefined
	const details = status ? {status} : undefined
	if (e instanceof APIConnectionTimeoutError || status === 408) return new ApiErr('llm_timeout','llm provider timed out',details)
	if (e instanceof RateLimitError) return new ApiErr('llm_rate_limited','llm provider is rate limiting',details)
	if (status && status >= 400 && status < 500 && status !== 409) return new ApiErr('llm_config','llm provider rejected the request',details)
	return new ApiErr('llm_unavailable','llm provider is unavailable',details)
}

export function createLlm(env:Env,connectMs = 4000):Llm {
	const dispatcher = new Agent({connect:{timeout:connectMs},keepAliveTimeout:30000})
	const client = new OpenAI({baseURL:env.LLM_BASE_URL.replace(/\/+$/,'') + '/v1',apiKey:env.LLM_API_KEY,maxRetries:0,fetchOptions:{dispatcher}})
	const share = Math.max(MIN_SHARE,Math.ceil(env.LLM_DAILY_CALL_CAP * CLIENT_SHARE))
	const perClient = new Map<string,number>()
	let day = ''
	let used = 0

	function spend() {
		const today = new Date().toISOString().slice(0,10)
		if (today !== day) {
			day = today
			used = 0
			perClient.clear()
		}
		if (used >= env.LLM_DAILY_CALL_CAP) throw new ApiErr('budget_exceeded','daily llm call cap reached')
		const who = llmClient.getStore()
		const mine = who ? perClient.get(who) ?? 0 : 0
		if (who && mine >= share) throw new ApiErr('budget_exceeded','daily llm call share reached')
		if (who) perClient.set(who,mine + 1)
		used++
	}

	// an outage is not the client's doing, retrying through one must not lock it out for the day. The global cap keeps counting
	function refund() {
		const who = llmClient.getStore()
		const mine = who && perClient.get(who)
		if (who && mine) perClient.set(who,mine - 1)
	}

	async function call<T>(model:string,o:LlmCall<T>,schema:Record<string,unknown>) {
		if (o.signal?.aborted) throw cancelled()
		spend()
		for (let i = 1; ; i++) {
			try {
				return await send(model,o,schema)
			} catch(e) {
				if (i < CONNECT_TRIES && connectStall(e)) continue
				refund()
				throw e
			}
		}
	}

	async function send<T>(model:string,o:LlmCall<T>,schema:Record<string,unknown>) {
		const t0 = Date.now()
		const late = AbortSignal.timeout(o.timeoutMs ?? env.LLM_TIMEOUT_MS)
		const signal = o.signal ? AbortSignal.any([late,o.signal]) : late
		let usage
		try {
			const res = await client.chat.completions.create({
				model,
				max_tokens:o.maxTokens ?? 6000,
				messages:[{role:'system',content:o.system},{role:'user',content:o.user}],
				response_format:{type:'json_schema',json_schema:{name:o.name,schema,strict:true}},
			},{signal})
			usage = res?.usage
			return res
		} catch(e) {
			if (o.signal?.aborted) throw cancelled()
			if (late.aborted) throw new APIConnectionTimeoutError()
			throw e
		} finally {
			console.log('llm',JSON.stringify({name:o.name,model,ms:Date.now() - t0,in:usage?.prompt_tokens,out:usage?.completion_tokens}))
		}
	}

	async function tryModel<T>(model:string,o:LlmCall<T>,schema:Record<string,unknown>) {
		let why = ''
		for (let i = 0; i < 2; i++) {
			const out = decode(o.schema,await call(model,{...o,system:o.system + why},schema))
			if (out?.success) return out.data
			// asked the same way, the model repeats the mistake. Naming it up front costs twice the time on every call
			if (out) why = rejected([...new Set(out.error.issues.map((e) => e.code === 'custom' ? e.message : e.path.join('.') + ' : ' + e.message + '.'))].join(' '))
		}
		throw new ApiErr('llm_bad_output','llm returned invalid output')
	}

	return {
		async json(o) {
			const schema = toSchema(o.schema)
			try {
				return await tryModel(env.LLM_MODEL,o,schema)
			} catch(e) {
				if (!transient(e)) throw toLlmErr(e)
			}
			try {
				return await tryModel(env.LLM_FALLBACK_MODEL,o,schema)
			} catch(e) {
				throw toLlmErr(e)
			}
		},
	}
}
