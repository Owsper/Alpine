import {createApp} from '../src/app'
import type {Deps} from '../src/deps'
import {readEnv} from '../src/env'
import {ApiErr} from '../src/errors'
import type {Llm,LlmCall} from '../src/llm'
import {memStore} from '../src/store/mem'

type Handler = (o:LlmCall<any>) => unknown|Promise<unknown>
export type FakeLlm = Llm & {calls:LlmCall<any>[]}

export const testEnv = readEnv({LLM_BASE_URL:'http://llm.test',LLM_API_KEY:'test'})

export function fakeLlm(handlers:Record<string,Handler> = {}):FakeLlm {
	const calls:LlmCall<any>[] = []
	return {
		calls,
		async json(o) {
			calls.push(o)
			const h = handlers[o.name]
			if (!h) throw new Error('no fake handler for ' + o.name)
			const out = o.schema.safeParse(await h(o))
			if (!out.success) throw new ApiErr('llm_bad_output','fake output failed schema',out.error.issues)
			return out.data
		},
	}
}

export function makeApp(o:Partial<Omit<Deps,'llm'>> & {llm?:FakeLlm} = {}) {
	const store = o.store ?? memStore()
	const llm = o.llm ?? fakeLlm()
	const app = createApp({env:testEnv,now:() => new Date(),...o,store,llm})
	return {app,store,llm}
}
