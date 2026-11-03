import {z} from 'zod'
import {DIMS,type Dim} from '../src/contracts'

export const NOTICE = 'SMOKE TEST ONLY : labels are synthetic (AI-written, label_source synthetic-ai) and accents are simulated, so this is not fairness validation'
export const TARGETS = {kappa:0.6,noise:0.5,accent_delta:0.5}

const Rating = z.int().min(1).max(5)

export const GoldItem = z.strictObject({
	id:z.string().min(1),
	question:z.string().min(1),
	answer:z.string().min(1),
	role:z.string().min(1),
	labels:z.strictObject({star:Rating,relevance:Rating,role_knowledge:Rating,company_fit:Rating,conciseness:Rating,evidence:Rating}),
	label_source:z.literal('synthetic-ai'),
})
export type GoldItem = z.infer<typeof GoldItem>

export const AccentItem = z.strictObject({
	base_id:z.string().min(1),
	variant:z.string().min(1),
	answer:z.string().min(1),
})
export type AccentItem = z.infer<typeof AccentItem>

export type DimMap = Record<Dim,number>
export type GoldRes = {id:string,labels:DimMap,pred:DimMap,noise:DimMap}
export type AccentRes = {base_id:string,variant:string,pred:DimMap}
type Row = {kappa:number|null,mae:number|null,noise:number|null}
type Delta = {n:number,delta:Record<Dim,number>,flagged:Dim[]}
export type Metrics = {
	notice:string
	targets:typeof TARGETS
	n:{gold:number,accents:number}
	dims:Record<Dim,Row>
	overall:Row
	accents:Record<string,Delta>
}

export function mean(xs:number[]) {
	return xs.length ? xs.reduce((a,b) => a + b,0) / xs.length : null
}

// 1 - observed / expected squared disagreement, the (max-min)^2 weight cancels out. null when undefined (both raters constant)
export function qwk(a:number[],b:number[]) {
	if (a.length !== b.length) throw new Error('qwk needs equal lengths')
	if (!a.length) return null
	const obs = a.reduce((s,v,i) => s + (v - b[i]) ** 2,0)
	const exp = a.reduce((s,v) => s + b.reduce((t,w) => t + (v - w) ** 2,0),0) / a.length
	return exp ? 1 - obs / exp : null
}

export function mae(a:number[],b:number[]) {
	if (a.length !== b.length) throw new Error('mae needs equal lengths')
	return mean(a.map((v,i) => Math.abs(v - b[i])))
}

export function accentDeltas(gold:Pick<GoldRes,'id'|'pred'>[],accents:AccentRes[]) {
	const base = new Map(gold.map((g) => [g.id,g.pred]))
	const out:Record<string,Delta> = {}
	for (const variant of new Set(accents.map((a) => a.variant))) {
		const rows = accents.filter((a) => a.variant === variant && base.has(a.base_id))
		if (!rows.length) continue
		const delta = Object.fromEntries(DIMS.map((d) => [d,mean(rows.map((r) => r.pred[d] - base.get(r.base_id)![d]))!])) as Record<Dim,number>
		out[variant] = {n:rows.length,delta,flagged:DIMS.filter((d) => Math.abs(delta[d]) >= TARGETS.accent_delta)}
	}
	return out
}

function row(gold:GoldRes[],ds:readonly Dim[]):Row {
	const labels = gold.flatMap((g) => ds.map((d) => g.labels[d]))
	const pred = gold.flatMap((g) => ds.map((d) => g.pred[d]))
	return {kappa:qwk(labels,pred),mae:mae(labels,pred),noise:mean(gold.flatMap((g) => ds.map((d) => g.noise[d])))}
}

export function summarize(gold:GoldRes[],accents:AccentRes[]):Metrics {
	return {
		notice:NOTICE,
		targets:TARGETS,
		n:{gold:gold.length,accents:accents.length},
		dims:Object.fromEntries(DIMS.map((d) => [d,row(gold,[d])])) as Record<Dim,Row>,
		overall:row(gold,DIMS),
		accents:accentDeltas(gold,accents),
	}
}

const fmt = (v:number|null) => v === null ? 'n/a' : v.toFixed(2)

function line(name:string,r:Row) {
	const kappa = r.kappa !== null && r.kappa >= TARGETS.kappa ? 'ok' : 'MISS'
	const noise = r.noise !== null && r.noise < TARGETS.noise ? 'ok' : 'MISS'
	return [name.padEnd(16),`${fmt(r.kappa)} ${kappa}`.padEnd(12),fmt(r.mae).padEnd(8),`${fmt(r.noise)} ${noise}`].join('')
}

export function table(m:Metrics) {
	const out = [
		m.notice,
		`graded : ${m.n.gold} gold, ${m.n.accents} accent variants`,
		'',
		['dimension'.padEnd(16),`kappa>=${TARGETS.kappa}`.padEnd(12),'mae'.padEnd(8),`noise<${TARGETS.noise}`].join(''),
		...DIMS.map((d) => line(d,m.dims[d])),
		line('overall',m.overall),
		'',
		`mean score delta vs baseline per simulated accent, ! flags |delta|>=${TARGETS.accent_delta}`,
		['variant (n)'.padEnd(28),...DIMS.map((d) => d.padEnd(16))].join(''),
	]
	for (const [variant,a] of Object.entries(m.accents)) {
		const cells = DIMS.map((d) => `${a.delta[d].toFixed(2)}${a.flagged.includes(d) ? ' !' : ''}`.padEnd(16))
		out.push([`${variant} (${a.n})`.padEnd(28),...cells].join(''))
	}
	if (!Object.keys(m.accents).length) out.push('no accent variants graded with a baseline')
	return out.join('\n')
}
