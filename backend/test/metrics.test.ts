import {readFileSync} from 'node:fs'
import {describe,expect,it} from 'vitest'
import {DIMS} from '../src/contracts'
import {AccentItem,GoldItem,NOTICE,accentDeltas,mae,mean,qwk,summarize,table,type DimMap} from '../eval/metrics'

const all = (v:number) => Object.fromEntries(DIMS.map((d) => [d,v])) as DimMap
const jsonl = (f:string) => readFileSync(new URL(`../eval/${f}`,import.meta.url),'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))

describe('qwk',() => {
	// obs = 1, exp = (23+10+7+14+31)/5 = 17, kappa = 1 - 1/17
	it('matches a hand computed value',() => {
		expect(qwk([1,2,3,4,5],[1,2,3,4,4])).toBeCloseTo(16 / 17,10)
	})

	// obs = 0+1+0+1+0+4 = 6, exp = 4*12/6 = 8, kappa = 1 - 6/8
	it('matches a second hand computed value',() => {
		expect(qwk([1,1,2,2,3,3],[1,2,2,3,3,1])).toBeCloseTo(0.25,10)
	})

	it('is 1 on perfect agreement and -1 on full inversion',() => {
		expect(qwk([1,3,5],[1,3,5])).toBe(1)
		expect(qwk([1,5],[5,1])).toBe(-1)
	})

	it('is undefined when both raters are constant or there is no data',() => {
		expect(qwk([3,3],[3,3])).toBeNull()
		expect(qwk([],[])).toBeNull()
	})

	it('is 0 when one rater is constant and the other is not',() => {
		expect(qwk([1,2,3],[2,2,2])).toBe(0)
	})

	it('throws on mismatched lengths',() => {
		expect(() => qwk([1],[1,2])).toThrow()
	})
})

describe('mae and mean',() => {
	it('computes them',() => {
		expect(mae([1,2,5],[2,2,3])).toBe(1)
		expect(mean([1,2,6])).toBe(3)
		expect(mean([])).toBeNull()
	})
})

describe('accentDeltas',() => {
	const gold = [{id:'a',pred:all(3)},{id:'b',pred:all(4)}]

	it('averages variant minus baseline per variant per dimension',() => {
		const out = accentDeltas(gold,[
			{base_id:'a',variant:'v1',pred:{...all(3),star:4}},
			{base_id:'b',variant:'v1',pred:{...all(4),star:6}},
			{base_id:'a',variant:'v2',pred:{...all(3),evidence:2}},
		])
		expect(out.v1.n).toBe(2)
		expect(out.v1.delta.star).toBe(1.5)
		expect(out.v1.delta.relevance).toBe(0)
		expect(out.v1.flagged).toEqual(['star'])
		expect(out.v2.delta.evidence).toBe(-1)
		expect(out.v2.flagged).toEqual(['evidence'])
	})

	it('flags exactly at 0.5 and not just under',() => {
		const out = accentDeltas(gold,[
			{base_id:'a',variant:'v',pred:{...all(3),star:4}},
			{base_id:'b',variant:'v',pred:all(4)},
		])
		expect(out.v.delta.star).toBe(0.5)
		expect(out.v.flagged).toEqual(['star'])
		const none = accentDeltas(gold,[
			{base_id:'a',variant:'v',pred:{...all(3),star:4}},
			{base_id:'b',variant:'v',pred:all(4)},
			{base_id:'a',variant:'v',pred:all(3)},
		])
		expect(none.v.flagged).toEqual([])
	})

	it('skips variants whose baseline was not graded',() => {
		expect(accentDeltas(gold,[{base_id:'zzz',variant:'v',pred:all(1)}])).toEqual({})
	})
})

describe('summarize and table',() => {
	const gold = [
		{id:'a',labels:all(1),pred:all(1),noise:all(0)},
		{id:'b',labels:all(5),pred:all(5),noise:all(0.2)},
		{id:'c',labels:all(3),pred:{...all(3),star:1},noise:{...all(0),star:0.9}},
	]

	it('computes per dimension and pooled rows',() => {
		const m = summarize(gold,[])
		expect(m.dims.relevance.kappa).toBe(1)
		expect(m.dims.star.mae).toBeCloseTo(2 / 3,10)
		expect(m.dims.star.noise).toBeCloseTo(1.1 / 3,10)
		expect(m.overall.mae).toBeCloseTo(2 / 18,10)
		expect(m.n).toEqual({gold:3,accents:0})
	})

	it('states the labels are synthetic in both json and table',() => {
		const m = summarize(gold,[])
		expect(m.notice).toBe(NOTICE)
		expect(NOTICE).toMatch(/synthetic/)
		expect(NOTICE).toMatch(/simulated/)
		expect(NOTICE).toMatch(/not fairness validation/)
		expect(table(m).split('\n')[0]).toBe(NOTICE)
	})

	it('marks misses and accent flags in the table',() => {
		const low = [
			{id:'a',labels:all(1),pred:all(5),noise:all(1)},
			{id:'b',labels:all(5),pred:all(1),noise:all(1)},
		]
		const t = table(summarize(low,[{base_id:'a',variant:'asr_x',pred:all(1)}]))
		expect(t).toMatch(/star\s+-1\.00 MISS\s+4\.00\s+1\.00 MISS/)
		expect(t).toMatch(/overall\s+-1\.00 MISS/)
		expect(t).toMatch(/asr_x \(1\)\s+-4\.00 !/)
	})

	it('prints n/a instead of crashing with no graded items',() => {
		const t = table(summarize([],[]))
		expect(t).toMatch(/overall\s+n\/a MISS\s+n\/a\s+n\/a MISS/)
		expect(t).toMatch(/no accent variants graded/)
	})
})

describe('datasets',() => {
	const gold = jsonl('gold.jsonl').map((l) => GoldItem.parse(l))
	const accents = jsonl('accents.jsonl').map((l) => AccentItem.parse(l))

	it('has at least 60 unique answers across roles',() => {
		expect(gold.length).toBeGreaterThanOrEqual(60)
		expect(new Set(gold.map((g) => g.id)).size).toBe(gold.length)
		expect(new Set(gold.map((g) => g.answer)).size).toBe(gold.length)
		expect(new Set(gold.map((g) => g.role.split(' at ')[0])).size).toBeGreaterThanOrEqual(10)
	})

	it('spreads labels over 1 to 5 on every dimension',() => {
		for (const d of DIMS) {
			const counts = [1,2,3,4,5].map((v) => gold.filter((g) => g.labels[d] === v).length)
			expect(counts.every((c) => c >= 4),`${d} ${counts}`).toBe(true)
		}
	})

	it('has at least 4 injection answers all labeled low',() => {
		const inj = gold.filter((g) => g.id.startsWith('inj'))
		expect(inj.length).toBeGreaterThanOrEqual(4)
		for (const g of inj) expect(Math.max(...DIMS.map((d) => g.labels[d])),g.id).toBeLessThanOrEqual(2)
	})

	it('has at least 12 bases with at least 3 variants that point at gold',() => {
		const ids = new Set(gold.map((g) => g.id))
		for (const a of accents) expect(ids.has(a.base_id),a.base_id).toBe(true)
		const bases = new Set(accents.map((a) => a.base_id))
		expect(bases.size).toBeGreaterThanOrEqual(12)
		for (const b of bases) expect(new Set(accents.filter((a) => a.base_id === b).map((a) => a.variant)).size,b).toBeGreaterThanOrEqual(3)
		const answers = new Map(gold.map((g) => [g.id,g.answer]))
		for (const a of accents) expect(a.answer,`${a.base_id} ${a.variant}`).not.toBe(answers.get(a.base_id))
	})
})
