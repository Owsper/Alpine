// npx tsx --env-file=.env scripts/capture-demo.ts
// refreshes the facts of the demo company. Nothing else in src/demo changes, so it only ever writes the same company
// not before a demo : it replaces hand checked facts with verbatim sentences and a run can fail, see the README
import {randomUUID} from 'node:crypto'
import {writeFileSync} from 'node:fs'
import {createApp} from '../src/app'
import {missingClaims} from '../src/demo'
import {readEnv} from '../src/env'
import {createLlm} from '../src/llm'
import {memStore} from '../src/store/mem'

const MIN_FACTS = 4
const OUT = new URL('../src/demo/facts.json',import.meta.url)
const NAME = 'N26'
const URL_ = 'https://n26.com/'

const env = readEnv()
const app = createApp({store:memStore(),llm:createLlm(env),env,now:() => new Date()})

const res = await app.request('/research',{
	method:'POST',
	headers:{'content-type':'application/json'},
	body:JSON.stringify({user_id:randomUUID(),job_description:`Backend Engineer at ${NAME} in Berlin.`,company_url:URL_}),
})
const b = await res.json()
console.log(NAME,res.status,b.error?.code ?? `${b.facts.length} facts`,b.warnings ?? '')

if (!res.ok || b.facts.length < MIN_FACTS) {
	console.error(`${NAME} did not give ${MIN_FACTS} verified facts, nothing saved`)
	process.exit(1)
}
const missing = missingClaims(b.facts)
if (missing.length) {
	console.error('the question bank depends on claims this run did not return, nothing saved. Claims are verbatim sentences and the model picks different ones each run, so try again or keep the stored facts :',missing.join(' | '))
	process.exit(1)
}

const {company_url,company_key} = b.job
writeFileSync(OUT,JSON.stringify({captured_by:'scripts/capture-demo.ts',company_name:NAME,company_url,company_key,facts:b.facts},null,'\t') + '\n')
console.log('saved',NAME)
