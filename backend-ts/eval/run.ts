import {createHash,randomUUID} from 'node:crypto'
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {dirname,join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {parseArgs} from 'node:util'
import {z} from 'zod'
import type {DimScore} from '../src/contracts'
import {readEnv} from '../src/env'
import {ApiErr} from '../src/errors'
import {runGrader,type GradeResult} from '../src/grade'
import {createLlm} from '../src/llm'
import {AccentItem,GoldItem,summarize,table,type AccentRes,type DimMap,type GoldRes} from './metrics'

const {values:args} = parseArgs({options:{
	limit:{type:'string'},
	concurrency:{type:'string',default:'4'},
	out:{type:'string',default:'eval/results/latest.json'},
}})
const Count = z.coerce.number().int().positive()
const limit = Count.optional().parse(args.limit)
const conc = Count.parse(args.concurrency)

const here = dirname(fileURLToPath(import.meta.url))
const cacheDir = join(here,'.cache')
const env = readEnv()
const llm = createLlm(env)
const graderSrc = readFileSync(join(here,'../src/grade.ts'),'utf8')

function readJsonl<T>(file:string,schema:z.ZodType<T>) {
	return readFileSync(join(here,file),'utf8').split('\n').filter((l) => l.trim()).map((l) => schema.parse(JSON.parse(l)))
}

const gold = readJsonl('gold.jsonl',GoldItem)
const accents = readJsonl('accents.jsonl',AccentItem)
const byId = new Map(gold.map((g) => [g.id,g]))

type Item = {id:string,base:GoldItem,answer:string,variant?:string}
const items:Item[] = [
	...gold.map((g) => ({id:g.id,base:g,answer:g.answer})),
	...accents.map((a) => {
		const base = byId.get(a.base_id)
		if (!base) throw new Error('unknown base_id ' + a.base_id)
		return {id:`${a.base_id}:${a.variant}`,base,answer:a.answer,variant:a.variant}
	}),
].slice(0,limit)

// a rubric or model change must not reuse old grades
function cacheFile(it:Item) {
	const key = createHash('sha256').update(JSON.stringify([env.LLM_MODEL,graderSrc,it.base.role,it.base.question,it.answer])).digest('hex')
	return join(cacheDir,key + '.json')
}

async function grade(it:Item):Promise<GradeResult> {
	const file = cacheFile(it)
	if (existsSync(file)) return JSON.parse(readFileSync(file,'utf8'))
	const id = randomUUID()
	const res = await runGrader(llm,{
		description:'Practice interview for the role : ' + it.base.role,
		facts:[],
		questions:[{id,text:it.base.question,kind:'base',dimension:null}],
		turns:[
			{role:'interviewer',text:it.base.question,question_id:id},
			{role:'candidate',text:it.answer,question_id:id},
		],
	})
	writeFileSync(file,JSON.stringify(res))
	return res
}

async function pool<T>(xs:T[],n:number,fn:(x:T) => Promise<void>) {
	let i = 0
	await Promise.all(Array.from({length:n},async () => {
		while (i < xs.length) await fn(xs[i++])
	}))
}

const pick = (s:DimScore[],k:'score'|'noise') => Object.fromEntries(s.map((d) => [d.dimension,d[k]])) as DimMap

const done = new Map<string,GradeResult>()
const failed:{id:string,code:string,message:string}[] = []
mkdirSync(cacheDir,{recursive:true})

await pool(items,conc,async (it) => {
	const t0 = Date.now()
	try {
		done.set(it.id,await grade(it))
		console.log('graded',it.id,Date.now() - t0,'ms')
	} catch(e) {
		const f = {id:it.id,code:e instanceof ApiErr ? e.code : 'internal',message:e instanceof Error ? e.message : String(e)}
		failed.push(f)
		console.error('failed',f.id,f.code,f.message)
	}
})

const goldRes:GoldRes[] = []
const accentRes:AccentRes[] = []
for (const it of items) {
	const r = done.get(it.id)
	if (!r) continue
	if (it.variant) accentRes.push({base_id:it.base.id,variant:it.variant,pred:pick(r.scores,'score')})
	else goldRes.push({id:it.id,labels:it.base.labels,pred:pick(r.scores,'score'),noise:pick(r.scores,'noise')})
}

const m = summarize(goldRes,accentRes)
mkdirSync(dirname(args.out),{recursive:true})
writeFileSync(args.out,JSON.stringify({...m,label_source:'synthetic-ai',model:env.LLM_MODEL,selected:items.length,failed,items:{gold:goldRes,accents:accentRes}},null,'\t'))

console.log('\n' + table(m))
console.log(`\nselected : ${items.length}, failed : ${failed.length}, out : ${args.out}`)
if (failed.length) process.exitCode = 1
