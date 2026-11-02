const UNSTORABLE = /\0|[\uD800-\uDFFF]/gu

export const okText = (s:string) => s.search(UNSTORABLE) < 0

export const HAS_TEXT = /[\p{L}\p{N}]/u

export const hasAnswers = (turns:{role:string,text:string}[]) => turns.some((t) => t.role === 'candidate' && HAS_TEXT.test(t.text))

export const clean = (s:string,max:number) => s.replace(/\s+/g,' ').trim().slice(0,max).replace(UNSTORABLE,'').trim()

export const DISCLAIMER = 'Practice tool. Not affiliated with any company mentioned. No guarantee of job offers.'

export const BANNED = /\b(anxious|anxiety|nervous\w*|(un)?confiden(t|ce|tly)(?! interval| level| score)|emotion\w*|personalit(y|ies)|stress(ed|ful|es)?(?![ -]?test)|accents?|accented|shy|shyness|timid|insecure|hesitant|hesitat\w*|calm\w*|charisma\w*|introvert\w*|extrovert\w*|demeanou?r|mood|tone|voice(?! of| assistant| ai| api| app| agent| bot| call| interface| product| search| recognition| model)|sound(s|ing)? (more|less|like|too|very|so)|enthusias\w*|assertive\w*|fluen(cy|tly)|fluent(?! bit| api| interface)|intonation|pacing|pronunciation|pronounce\w*|grammar|grammatical\w*|body language|eye contact)\b/i

const PROTECTED = /\b(how old|your age|are you (married|pregnant|single)|(your|have) (kids|children|spouse|husband|wife|religion|family|health|nationality|ethnicity)|do you have (kids|children)|where are you from)\b/i

export const badQuestion = (s:string) => BANNED.test(s) || PROTECTED.test(s)

const same = (s:string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim()

export function allNew(texts:string[],past:string[]) {
	const seen = new Set(past.map(same))
	for (const t of texts.map(same)) {
		if (seen.has(t)) return false
		seen.add(t)
	}
	return true
}
