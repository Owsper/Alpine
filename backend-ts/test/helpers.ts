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

export const AS_COMPANY = [
	'Our payment services run on Java. How would you keep them reliable?',
	'Why do you want to join Zalando and work on our fashion platform?',
	'We invest in training, what would you like to learn?',
	"We're moving to Kotlin, how would you help?",
	'Tell us about a project you led.',
	'Walk us through a deployment you ran.',
	'Why do you want to work with us?',
	'Unsere Services laufen auf Kafka. Wie sicherst du das ab?',
	'Welche Themen möchtest du bei uns vertiefen?',
	'Wir bieten flexible Arbeitszeiten. Wie arbeitest du am besten?',
	'Du arbeitest eng mit unserem Produktteam. Wie gehst du vor?',
	'Notre équipe utilise Kafka. Comment garantis-tu la fiabilité ?',
	'Pourquoi veux-tu rejoindre nos équipes ?',
	'Nous cherchons un développeur, quelle est ton expérience ?',
]

export const NEUTRAL = [
	'How have you sold to US retailers?',
	'Why do you want to work at Zalando on its payments platform?',
	'How do you track your hours on a bonus scheme?',
	'What did you learn from your last web project?',
	'When would you pick NoSQL over Postgres?',
	'Welche Erfahrung hast du mit Kafka bei REWE digital?',
	'Pourquoi veux-tu rejoindre Doctolib ?',
	'Quels retours as-tu reçus de ton équipe ?',
]
