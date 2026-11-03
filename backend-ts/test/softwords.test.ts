import {randomUUID} from 'node:crypto'
import {describe,expect,it} from 'vitest'
import {DIMS,PublicSession,type Job,type Session} from '../src/contracts'
import {runGrader} from '../src/grade'
import type {Store} from '../src/store/types'
import {fakeLlm,makeApp} from './helpers'

const USER = randomUUID()
const AT = '2026-01-01T00:00:00.000Z'

type App = ReturnType<typeof makeApp>['app']
const post = (app:App,path:string,body:unknown) => app.request(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})

const five = (q:string) => ({questions:[q,'q1 about apis','q2 about tests','q3 about queues','q4 about sql'].map((text,i) => ({text,is_anchor:i === 4}))})
const four = (q:string) => ({questions:[q,'l1 about apis','l2 about tests','l3 about queues'].map((text) => ({text}))})
const isLater = (user:string) => 'excluded_questions' in JSON.parse(user)

const addJob = (store:Store,description:string):Promise<Job> => store.createJob({id:randomUUID(),user_id:USER,description,company_name:null,company_url:null,company_key:null,role_title:null,demo:false,created_at:AT})
const addFact = (store:Store,job:Job,claim:string) => store.addFacts(job.id,null,[{claim,source_url:'https://acme.test/about',retrieved_at:AT}])

async function graded(store:Store,description:string,o:{tip?:string,evidence_quote?:string} = {}) {
	const job = await addJob(store,description)
	const s:Session = {
		id:randomUUID(),
		user_id:USER,
		job_id:job.id,
		number:1,
		status:'graded',
		questions:[0,1,2,3,4].map((i) => ({id:randomUUID(),text:'q' + i,kind:i === 4 ? 'anchor' : 'base',dimension:null})),
		flow:[],
		interviewer_instructions:'',
		transcript:[{role:'candidate',text:'answer'}],
		grading_started_at:null,
		source_session_id:null,
		created_at:AT,
		updated_at:AT,
	}
	await store.createSession(s)
	await store.saveScore({session_id:s.id,scores:DIMS.map((dimension) => ({dimension,score:3,evidence_quote:o.evidence_quote ?? 'quote',tip:o.tip ?? 'tip',noise:0})),strengths:[],weakest:['star','evidence'],progress:null,fallback:false,graded_at:AT})
	return {job,s}
}

async function first(job:string,q:string) {
	const res = await post(makeApp({llm:fakeLlm({session:() => five(q)})}).app,'/session',{user_id:USER,job_description:job})
	return res.status
}

async function later(job:string,q:string) {
	const {app} = makeApp({llm:fakeLlm({session:(c) => isLater(c.user) ? four(q) : five('first q')})})
	const res = await post(app,'/session',{user_id:USER,job_description:job})
	expect(res.status).toBe(200)
	const s = PublicSession.parse(await res.json())
	return (await post(app,'/session',{user_id:USER,job_id:s.job_id})).status
}

async function next(job:string,q:string,o:Parameters<typeof graded>[2] = {}) {
	for (const out of [{weak:[q,'w2','w3'],new:'n1'},{weak:['w1','w2','w3'],new:q}]) {
		const {app,store} = makeApp({llm:fakeLlm({next:() => out})})
		const {s} = await graded(store,job,o)
		const status = (await post(app,'/next',{session_id:s.id})).status
		if (status !== 200) return status
	}
	return 200
}

const ROUTES:[string,(job:string,q:string) => Promise<number>][] = [['/session first',first],['/session later',later],['/next',next]]

const ABOUT_THE_JOB = [
	['a voice disorder','Speech therapist. Treat voice disorders, stuttering and pronunciation problems.','How would you assess and treat a new patient with a voice disorder?'],
	['tone in the posting','Copywriter. You own our tone of voice across packaging.','How do you keep the tone consistent across packaging and social?'],
	['stress allows stressful','ICU nurse. You stay calm in emergencies and can handle stress on night shifts.','How do you stay calm on a stressful night shift?'],
	['stressful allows stress','ICU nurse. You handle stressful night shifts.','How do you plan a night shift to reduce stress for the team?'],
	['anxiety allows anxious','Psychologist. You assess anxiety and mood disorders.','How do you assess an anxious patient?'],
	['confidence allows confident','ESL teacher. Build confidence in nervous beginners.','How do you make a nervous beginner more confident when speaking?'],
	['several words','Account executive. Confident with C-level buyers, assertive in negotiation and fluent in German.','How do you stay confident and assertive with a buyer, and how fluent is your German?'],
	['any case','Customer service. Keep a FRIENDLY TONE and STAY CALM.','How do you keep a friendly tone and stay calm with an upset customer?'],
	['a company called Calm','Calm is hiring a marketer. Plan campaigns for the app.','Why do you want to work at Calm?'],
	['pronunciation allows pronounce','Speech therapist. Treat pronunciation problems.','How do you help a child pronounce the letter r?'],
	['pronounce allows pronunciation','ESL teacher. Help adults pronounce English.','How do you teach pronunciation to a beginner class?'],
	['pronounced allows itself','Physiotherapist. Treat patients with pronounced scoliosis.','How do you treat a patient with pronounced scoliosis?'],
	['hesitant allows itself','Sales rep. Turn hesitant prospects into customers.','How do you win over a hesitant prospect?'],
	['sounds like for the job','Copywriter. Write copy that sounds like the brand.','How do you make packaging copy sound like the brand?'],
	['sound more for the job','Presentation coach. Help executives sound more natural on stage.','How do you help an executive sound more natural?'],
	['hesitation for the job','Speech therapist. Treat stuttering and hesitation in speech.','How do you assess a child who hesitates in their speech?'],
] as const

const STILL_BAD = [
	['nothing in the posting','Backend engineer at Acme.','How do you stay confident and calm when you feel nervous?'],
	['one of three words in the posting','ICU nurse. You stay calm in emergencies.','How do you stay confident and calm when you feel nervous?'],
	['two of three words in the posting','ICU nurse. You stay calm and confident in emergencies.','How do you stay confident and calm when you feel nervous?'],
	['tone is not unlocked by milestone','Project manager. Hit each milestone on time.','What tone do you use with a late supplier?'],
	['tone is not unlocked by stone','Mason. Cut stone and lay tile.','What tone do you use with a client?'],
	['confident is not unlocked by confidential','Lawyer. Keep client files confidential.','How confident are you in court?'],
	['accent is not unlocked by accentuate','Designer. Accentuate the brand in print.','How would you hide your accent?'],
	['voice is not unlocked by voicemail','Receptionist. Check the voicemail each morning.','How would you describe your voice?'],
	['personality is not unlocked by personal','Assistant. Support a personal schedule.','How would you describe your personality?'],
	['stress is not unlocked by a stress test','Backend engineer. Run a stress test before each release.','How do you handle stress?'],
	['voice is not unlocked by the voice of the customer','Product manager. Be the voice of the customer.','How do you use your voice in a meeting?'],
	['confidence is not unlocked by a confidence interval','Data analyst. Report a confidence interval.','How is your confidence in meetings?'],
	['a different banned word','Copywriter. You own the tone of voice.','How do you stay calm before a deadline?'],
	['sound more is not unlocked by this sounds like you','Support agent. If this sounds like you, apply today.','How can you sound more upbeat on a call?'],
	['sound too is not unlocked by this sounds like you','Support agent. If this sounds like you, apply today.','Do you sound too young to lead a client call?'],
	['sound like is not unlocked by this sounds like you','Support agent. If this sounds like you, apply today.','Do you sound like a leader on a call?'],
	['hesitant is not unlocked by do not hesitate','Support agent. Please do not hesitate to apply.','Why are you hesitant to speak up in meetings?'],
	['hesitation is not unlocked by do not hesitate','Support agent. Please do not hesitate to apply.','Tell me about your hesitation before answering hard questions.'],
	['pronunciation is not unlocked by pronounced','Paralegal. A pronounced eye for detail.','How is your pronunciation?'],
	['pronounce is not unlocked by pronounced','Paralegal. A pronounced eye for detail.','How do you pronounce difficult client names?'],
	['sound is not unlocked by does this sound like a fit','Support agent. Does this sound like a fit? Apply now.','How can you sound more upbeat on a call?'],
	['sound is not unlocked by if that sounds like a fit','Support agent. If that sounds like a fit, apply.','How can you sound more upbeat on a call?'],
	['sound is not unlocked by sounds like your next role','Support agent. Sounds like your next role? Apply.','How can you sound more upbeat on a call?'],
	['hesitant is not unlocked by do not be hesitant','Support agent. Do not be hesitant to apply.','Why are you hesitant to speak up in meetings?'],
	['hesitant is not unlocked by a curly dont hesitate','Support agent. Don’t hesitate to reach out.','Why are you hesitant to speak up in meetings?'],
	['hesitant is not unlocked by dont hesitate','Support agent. Don\'t hesitate to reach out.','Why are you hesitant to speak up in meetings?'],
	['hesitant is not unlocked by never hesitate','Support agent. Never hesitate to ask.','Why are you hesitant to speak up in meetings?'],
	['hesitant is not unlocked by without hesitation','Firefighter. Act without hesitation.','Why are you hesitant to speak up in meetings?'],
] as const

const NO_EXEMPTION = [
	['age','Teacher. Your age group is 6 to 10. We ask how old you are.','How old are you?'],
	['marriage','Wedding planner. Are you married to your work?','Are you married?'],
	['family','Family doctor. Your family matters to us.','How is your family?'],
	['origin','Tour guide. Tell guests where are you from.','Where are you from?'],
	['our','Copywriter. You own our tone of voice.','How would you keep our tone consistent?'],
	['we','We are hiring a nurse. We value calm.','We value calm, how do you stay calm?'],
	['us','Join us as a nurse.','Why do you want to join us?'],
	['German','Wir suchen eine Pflegekraft. Unser Team ist ruhig.','Warum passt du zu unserem Team?'],
] as const

describe.each(ROUTES)('%s',(route,ask) => {
	it.each(ABOUT_THE_JOB)('keeps a word the job uses : %s',async (name,job,q) => {
		expect(await ask(job,q)).toBe(200)
	})

	it.each(STILL_BAD)('still rejects : %s',async (name,job,q) => {
		expect(await ask(job,q)).toBe(502)
	})

	it.each(NO_EXEMPTION)('has no exemption for : %s',async (name,job,q) => {
		expect(await ask(job,q)).toBe(502)
	})
})

describe('the facts count as the job text',() => {
	const FACT = 'Calm makes an app for sleep and meditation.'
	const Q = 'Why do you want to work at Calm?'

	it('a later /session',async () => {
		const {app,store} = makeApp({llm:fakeLlm({session:(c) => isLater(c.user) ? four(Q) : five('first q')})})
		const job = await addJob(store,'Marketer at a wellness app.')
		await addFact(store,job,FACT)
		expect((await post(app,'/session',{user_id:USER,job_id:job.id})).status).toBe(200)
		expect((await post(app,'/session',{user_id:USER,job_id:job.id})).status).toBe(200)
	})

	it('/session on an existing job',async () => {
		const {app,store} = makeApp({llm:fakeLlm({session:() => five(Q)})})
		const job = await addJob(store,'Marketer at a wellness app.')
		await addFact(store,job,FACT)
		expect((await post(app,'/session',{user_id:USER,job_id:job.id})).status).toBe(200)
	})

	it('/next',async () => {
		const {app,store} = makeApp({llm:fakeLlm({next:() => ({weak:[Q,'w2','w3'],new:'n1'})})})
		const {job,s} = await graded(store,'Marketer at a wellness app.')
		await addFact(store,job,FACT)
		expect((await post(app,'/next',{session_id:s.id})).status).toBe(200)
	})

	it('an apply now line in a fact allows nothing',async () => {
		const {app,store} = makeApp({llm:fakeLlm({session:() => five('How can you sound more upbeat on a call?')})})
		const job = await addJob(store,'Marketer at a wellness app.')
		await addFact(store,job,'If this sounds like you, apply today.')
		expect((await post(app,'/session',{user_id:USER,job_id:job.id})).status).toBe(502)
	})

	it('without the fact it is rejected',async () => {
		const {app,store} = makeApp({llm:fakeLlm({session:() => five(Q)})})
		const job = await addJob(store,'Marketer at a wellness app.')
		expect((await post(app,'/session',{user_id:USER,job_id:job.id})).status).toBe(502)
	})
})

describe('only the job text counts',() => {
	it('the candidate quote and the tip do not allow a word in /next',async () => {
		expect(await next('Backend engineer at Acme.','How do you stay calm?',{evidence_quote:'I stayed calm and was nervous',tip:'Stay calm'})).toBe(502)
	})

	it('an earlier question does not allow a word in a later session',async () => {
		const {app} = makeApp({llm:fakeLlm({session:(c) => isLater(c.user) ? four('How do you stay calm?') : five('first q')})})
		const s = PublicSession.parse(await (await post(app,'/session',{user_id:USER,job_description:'Backend engineer at Acme. Build APIs.'})).json())
		expect((await post(app,'/session',{user_id:USER,job_id:s.job_id})).status).toBe(502)
	})

	it('one job does not allow a word for the next job',async () => {
		const {app} = makeApp({llm:fakeLlm({session:() => five('How do you stay calm?')})})
		expect((await post(app,'/session',{user_id:USER,job_description:'ICU nurse, stay calm.'})).status).toBe(200)
		expect((await post(app,'/session',{user_id:USER,job_description:'Backend engineer at Acme.'})).status).toBe(502)
	})
})

describe('the tip filter stays strict',() => {
	const TURNS = [{role:'interviewer' as const,text:'q'},{role:'candidate' as const,text:'I stayed calm and kept the tone of voice friendly.'}]
	const run = (tip:string) => ({scores:DIMS.map((dimension) => ({dimension,score:3,evidence_quote:'stayed calm',tip}))})
	const grade = (description:string,tip:string) => runGrader(fakeLlm({grade:() => run(tip)}),{description,facts:[],questions:[],turns:TURNS})

	it.each(['Stay calm','Use a friendly tone','Sound more confident'])('rejects the tip %j when the job uses the word',async (tip) => {
		await expect(grade('Support agent. Stay calm, keep a friendly tone, be confident.',tip)).rejects.toMatchObject({code:'llm_bad_output'})
	})
})
