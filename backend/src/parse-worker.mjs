import * as cheerio from 'cheerio'
import robotsParser from 'robots-parser'

const SKIP = new Set(['script','style','nav','footer','noscript','template','svg'])
const BLOCK = new Set(['p','div','li','h1','h2','h3','h4','h5','h6','td','th','br','section','article','header','main','aside','blockquote'])
const AI_OFF = /\b(noai|notdm)\b/i
const HIDDEN_STYLE = /(^|;)\s*(display\s*:\s*none|visibility\s*:\s*hidden)\b/i
// react streaming renders a page into <div hidden id="S:0"> and its script moves that into place, so the reader does see it
const STREAMED = /^S:[0-9a-f]+$/i

const hidden = ({attribs:a}) => a && ((a.hidden !== undefined && !STREAMED.test(a.id ?? '')) || a['aria-hidden']?.trim().toLowerCase() === 'true' || HIDDEN_STYLE.test(a.style ?? ''))

// one pass with a stack : .after() is quadratic and .text() recurses
function textOf(root) {
	const parts = []
	const todo = root ? [root] : []
	while (todo.length) {
		const n = todo.pop()
		if (typeof n === 'string') parts.push(n)
		else if (n.type === 'text') parts.push(n.data)
		else if (n.children && !SKIP.has(n.name) && !hidden(n)) {
			if (BLOCK.has(n.name)) todo.push(' ')
			for (let i = n.children.length - 1; i >= 0; i--) todo.push(n.children[i])
		}
	}
	return parts.join('').replace(/\s+/g,' ').trim()
}

function optedOut($) {
	return $('meta').toArray().some((m) => {
		const name = (m.attribs.name ?? '').trim().toLowerCase()
		const v = m.attribs.content ?? ''
		if (name === 'tdm-reservation') return v.trim() === '1'
		return (name === 'robots' || name === 'interviewversebot') && AI_OFF.test(v)
	})
}

process.on('message',(job) => {
	if (job?.txt) {
		const bot = robotsParser(new URL('/robots.txt',job.url).href,job.txt)
		return process.send({allowed:bot.isAllowed(job.url,job.ua) === true})
	}
	const $ = cheerio.load(job)
	process.send({text:textOf($('body')[0]),optOut:optedOut($)})
})
