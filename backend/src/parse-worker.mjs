import {parentPort} from 'node:worker_threads'
import * as cheerio from 'cheerio'

const SKIP = new Set(['script','style','nav','footer','noscript','template'])
const BLOCK = new Set(['p','div','li','h1','h2','h3','h4','h5','h6','td','th','br','section','article','header','main','aside','blockquote'])
const AI_OFF = /\b(noai|notdm)\b/i

// one pass with a stack : .after() is quadratic and .text() recurses
function textOf(root) {
	const parts = []
	const todo = root ? [root] : []
	while (todo.length) {
		const n = todo.pop()
		if (typeof n === 'string') parts.push(n)
		else if (n.type === 'text') parts.push(n.data)
		else if (n.children && !SKIP.has(n.name)) {
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

parentPort.on('message',(html) => {
	const $ = cheerio.load(html)
	parentPort.postMessage({text:textOf($('body')[0]),optOut:optedOut($)})
})
