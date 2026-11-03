import {isIP} from 'node:net'
import {getConnInfo} from '@hono/node-server/conninfo'
import type {Context,MiddlewareHandler} from 'hono'
import type {Deps} from './deps'
import {ApiErr} from './errors'
import {llmClient} from './llm'

const WIN = 60000
const MAX:Record<string,number> = {'/research':10,'/session':20,'/grade':10,'/next':10}

// one ipv6 host usually holds a whole /64, and the two loopbacks are one machine
function clientKey(addr:string) {
	const ip = addr.split('%')[0].toLowerCase().replace(/^::ffff:(?=\d+\.)/,'')
	if (ip === '::1' || ip.startsWith('127.')) return 'local'
	if (isIP(ip) !== 6) return ip
	const [head,tail] = ip.split('::').map((p) => p ? p.split(':') : [])
	const groups = tail ? [...head,...Array(8 - head.length - tail.length).fill('0'),...tail] : head
	return groups.slice(0,4).map((g) => parseInt(g,16).toString(16)).join(':') + '::/64'
}

function clientOf(c:Context,hops:number) {
	// each trusted proxy appends one entry, anything further left is client supplied
	const fwd = hops ? c.req.header('x-forwarded-for')?.split(',').at(-hops)?.trim() : ''
	if (fwd) return clientKey(fwd)
	try {
		return clientKey(getConnInfo(c).remote.address ?? 'local')
	} catch {
		return 'local'
	}
}

export function limits(deps:Deps):MiddlewareHandler {
	const hits = new Map<string,number[]>()
	let swept = 0

	return async (c,next) => {
		const max = MAX[c.req.path]
		if (!max) return next()

		const now = deps.now().getTime()
		if (now - swept >= WIN) {
			swept = now
			for (const [k,v] of hits) {
				if (now - v[v.length - 1] >= WIN) hits.delete(k)
			}
		}

		const client = clientOf(c,deps.env.TRUST_PROXY)
		const k = client + ' ' + c.req.path
		const live = (hits.get(k) ?? []).filter((t) => now - t < WIN)
		if (live.length >= max) {
			const secs = Math.ceil((live[0] + WIN - now) / 1000)
			c.header('Retry-After',String(secs))
			throw new ApiErr('rate_limited','too many requests',{retry_after:secs})
		}
		live.push(now)
		hits.set(k,live)
		return llmClient.run(client,next)
	}
}
