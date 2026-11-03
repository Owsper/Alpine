import type {z} from 'zod'

const UNSTORABLE = /\0|[\uD800-\uDFFF]/gu

export const okText = (s:string) => s.search(UNSTORABLE) < 0

export const HAS_TEXT = /[\p{L}\p{N}]/u

export const hasAnswers = (turns:{role:string,text:string}[]) => turns.some((t) => t.role === 'candidate' && HAS_TEXT.test(t.text))

export const clean = (s:string,max:number) => s.replace(/\s+/g,' ').trim().slice(0,max).replace(UNSTORABLE,'').trim()

export const DISCLAIMER = 'Practice tool. Not affiliated with any company mentioned. No guarantee of job offers.'

export const BANNED = /\b(anxi\w*|nervous\w*|(un)?confiden(t|ce|tly)(?! interval| level| score)|emotion\w*|personalit(y|ies)|stress(ed|ful|es|ing)?(?![ -]?test)|accents?|accented|shy(ly|ness)?|timid\w*|insecur\w*|hesita\w*|calm\w*|charisma\w*|introvert\w*|extrovert\w*|demeanou?r|moods?|tones?|voices?(?! (of|assistant|ai|api|app|application|agent|bot|call|calling|interface|product|search|recognition|model)s?\b)|sound(s|ing)? (more|less|like|too|very|so)|sounded (more|less|too|very|so)|enthusias\w*|assertive\w*|fluen(cy|tly)|fluent(?! bit| api| interface)|intonation|pacing|pronunciation|pronounce\w*|grammar|grammatical\w*|body[ -]language|eye[ -]contact)\b/i

const PROTECTED = /\b(how old|your age|are you (married|pregnant|single)|(your|have) (kids|children|spouse|husband|wife|religion|family|health|nationality|ethnicity)|do you have (kids|children)|where are you from)\b/i

// the intro says not affiliated, so a question can not talk as the company. Questions follow the language of the job. US in capitals is the country
const AS_COMPANY = /(?<![\p{L}\p{N}])(we|our|ours|ourselves|wir|uns|unser\p{L}*|nous|notre|nos)(?![\p{L}\p{N}])/iu
const AS_COMPANY_US = /(?<![\p{L}\p{N}])[Uu]s(?![\p{L}\p{N}])/u

export const NOT_THE_COMPANY = 'Never speak as the company or its hiring team, you do not work there. Never use we, us, our or here for it, or the same words in any other language, even where the job description or facts do. Use its name, or say this role or this team.'

const ALL_BANNED = new RegExp(BANNED.source,'gi')
// whole BANNED matches, so milestone does not allow tone
const softWords = (s:string) => (s.match(ALL_BANNED) ?? []).map((w) => w.toLowerCase())
// the first letters, so stress allows stressful. A pronounced eye for detail is not pronunciation
const family = (w:string) => w === 'pronounced' ? w : w.slice(0,4)
// apply now lines say nothing about the job. Copy that sounds like the brand or a child who hesitates in speech does
const FILLER = /\bsounds? like you|\b(this|(if|does) (that|it)) sounds?|(not|never|without|n['’]t)( be)? hesita\w*/gi

export const jobWords = (job:string,facts:{claim:string}[]) => new Set([job,...facts.map((f) => f.claim)].flatMap((t) => softWords(t.replace(/\s+/g,' ').replace(FILLER,' '))).map(family))

export const QUESTION_CHARS = 300

// a banned word can end in any suffix, and the named ones go back to the model
const MAX_NAMED = 10
const MAX_LETTERS = 20

// a banned word the job's own text uses is about the job. The grader's tips have no such exemption. The messages go to the model on its retry, so they name the problem
export function checkQuestions(raw:string[],allowed:Set<string>,ctx:z.RefinementCtx) {
	// check what gets shown : clean() can join a phrase back up or cut voice assistants down to voice
	const texts = raw.map((t) => clean(t,QUESTION_CHARS))
	const add = (message:string) => ctx.addIssue({code:'custom',message})
	const words = [...new Set(texts.flatMap((t) => softWords(t)).filter((w) => !allowed.has(family(w))))].slice(0,MAX_NAMED).map((w) => w.slice(0,MAX_LETTERS))
	if (words.length) add('Do not use these words : ' + words.join(', ') + '.')
	if (texts.some((t) => PROTECTED.test(t))) add('Do not ask about age, family, health, religion or origin.')
	if (texts.some((t) => AS_COMPANY.test(t) || AS_COMPANY_US.test(t))) add(NOT_THE_COMPANY)
}

const same = (s:string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim()

export function allNew(texts:string[],past:string[]) {
	const seen = new Set(past.map(same))
	for (const t of texts.map(same)) {
		if (seen.has(t)) return false
		seen.add(t)
	}
	return true
}
