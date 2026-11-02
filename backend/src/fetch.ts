import {type ChildProcess,fork,type Serializable} from 'node:child_process'
import {lookup} from 'node:dns/promises'
import http from 'node:http'
import https from 'node:https'
import {BlockList,isIP,type LookupFunction} from 'node:net'
import {fileURLToPath} from 'node:url'

export type Fetched = {url:string,html:string,text?:string,retrieved_at:string}
export type Parsed = {text:string,optOut:boolean}
export type Addr = {address:string,family:number}
export type Raw = {status:number,headers:Record<string,string|string[]|undefined>,body:string}
export type Io = {
	resolve(host:string):Promise<Addr[]>
	get(u:URL,addrs:Addr[],signal:AbortSignal):Promise<Raw>
}
export type FetchOpts = {io?:Io,robots?:Map<string,Promise<string>>,timeoutMs?:number,parse?:typeof parseHtml}

const UA = 'InterviewVerseBot/0.1'
const TIMEOUT = 8000
const MAX_BYTES = 1024 * 1024
const MAX_HOPS = 3
const REDIRECTS = [301,302,303,307,308]
const DENY_ALL = 'User-agent: *\nDisallow: /'
const BLOCKED = ['linkedin','lnkd','licdn','glassdoor','indeed','indeedjobs','kununu','xing']
const PROXIES = /(^|\.)translate\.goog$|^webcache\.googleusercontent\.com$/
const AI_OFF = /\b(noai|notdm)\b/i
const PARSE_MS = 3000
const MAX_WORKERS = 4
const WORKER_MB = 256
const LOCAL_HOST = /^[^.]+$|\.(localhost|local|internal)$/

function blockList(type:'ipv4'|'ipv6',subnets:string[]) {
	const b = new BlockList()
	for (const s of subnets) {
		const [addr,bits] = s.split('/')
		b.addSubnet(addr,+bits,type)
	}
	return b
}

// two lists because a ::ffff:0:0/96 rule also matches every plain ipv4 address
const V4 = blockList('ipv4',['0.0.0.0/8','10.0.0.0/8','100.64.0.0/10','127.0.0.0/8','168.63.129.16/32','169.254.0.0/16','172.16.0.0/12','192.0.0.0/24','192.0.2.0/24','192.168.0.0/16','198.18.0.0/15','198.51.100.0/24','203.0.113.0/24','224.0.0.0/4','240.0.0.0/4'])
const V6 = blockList('ipv6',['::/96','::ffff:0:0/96','::ffff:0:0:0/96','64:ff9b::/96','64:ff9b:1::/48','100::/64','2001::/32','2001:db8::/32','2002::/16','fc00::/7','fe80::/10','fec0::/10','ff00::/8'])

export function isPrivate(ip:string) {
	const a = ip.split('%')[0]
	const fam = isIP(a)
	if (fam === 4) return V4.check(a,'ipv4')
	if (fam === 6) return V6.check(a,'ipv6')
	return true
}

const hostOf = (u:URL) => u.hostname.replace(/^\[|\]$/g,'').replace(/\.$/,'')

export const keyOf = (u:URL) => hostOf(u).replace(/^www\./,'')

export function checkUrl(raw:string,key?:string) {
	const u = URL.parse(raw)
	if (!u || !/^https?:$/.test(u.protocol)) throw new Error('bad_url')
	if (u.port) throw new Error('bad_port')
	if (u.username || u.password) throw new Error('credentials')
	const host = hostOf(u)
	if (host.split('.').some((l) => BLOCKED.includes(l)) || PROXIES.test(host)) throw new Error('blocklisted')
	if (isIP(host) ? isPrivate(host) : LOCAL_HOST.test(host)) throw new Error('private')
	if (key && keyOf(u) !== key) throw new Error('off_site')
	return u
}

export const realIo:Io = {
	resolve:(host) => lookup(host,{all:true}),
	get(u,addrs,signal) {
		// connect only to the addresses we checked, a second dns answer could point anywhere
		const pinned:LookupFunction = (h,o,cb) => o.all ? cb(null,addrs) : cb(null,addrs[0].address,addrs[0].family)
		const headers = {'user-agent':UA,accept:'text/html,text/plain;q=0.9,*/*;q=0.1','accept-encoding':'identity'}
		return new Promise((done,fail) => {
			const req = (u.protocol === 'https:' ? https : http).request(u,{lookup:pinned,signal,agent:false,headers},(res) => {
				const enc = res.headers['content-encoding']
				if (enc && enc !== 'identity') {
					res.destroy()
					return fail(new Error('encoded'))
				}
				const parts:Buffer[] = []
				let size = 0
				const finish = () => done({status:res.statusCode ?? 0,headers:res.headers,body:Buffer.concat(parts).subarray(0,MAX_BYTES).toString()})
				res.on('data',(b:Buffer) => {
					parts.push(b)
					size += b.length
					if (size < MAX_BYTES) return
					res.destroy()
					finish()
				})
				res.on('end',finish)
				res.on('error',fail)
			})
			req.on('error',fail)
			req.end()
		})
	},
}

const idle:ChildProcess[] = []
const waiting:(() => void)[] = []
let busy = 0

// a process and not a worker thread : a 16 KB page can run v8 out of heap, and in a thread that aborts the whole server
function newWorker() {
	const w = fork(fileURLToPath(new URL('./parse-worker.mjs',import.meta.url)),{execArgv:['--max-old-space-size=' + WORKER_MB],env:{},stdio:['ignore','ignore','ignore','ipc']})
	w.unref()
	w.channel?.unref()
	w.on('error',(e:NodeJS.ErrnoException) => console.error('parser failed',e.code ?? e.name))
	w.once('exit',() => {
		if (idle.includes(w)) idle.splice(idle.indexOf(w),1)
	})
	return w
}

function nextJob() {
	while (busy < MAX_WORKERS && waiting.length) {
		busy++
		waiting.shift()!()
	}
}

// untrusted input can take minutes and synchronous code can not be interrupted, so it runs elsewhere with a hard stop. Each worker costs memory and a burst must not add up, so there are a few and the rest wait in line
function inWorker<T>(job:unknown,ms:number,signal?:AbortSignal) {
	return new Promise<T|null>((done) => {
		waiting.push(() => {
			// its fetch gave up while it waited, running it only keeps honest pages in line longer
			if (signal?.aborted) {
				busy--
				return done(null)
			}
			const w = idle.pop() ?? newWorker()
			const finish = (out:T|null) => {
				clearTimeout(stop)
				w.off('message',finish)
				w.off('error',fail)
				w.off('exit',died)
				if (out) idle.push(w)
				else w.kill()
				busy--
				done(out)
				nextJob()
			}
			const fail = () => finish(null)
			const died = (code:number|null) => {
				console.error('parser exited',code)
				fail()
			}
			const stop = setTimeout(() => {
				console.error('parser stopped after',ms,'ms')
				fail()
			},ms)
			w.once('message',finish as (m:unknown) => void)
			w.once('error',fail)
			w.once('exit',died)
			w.send(job as Serializable)
		})
		nextJob()
	})
}

export const parseHtml = (html:string,ms = PARSE_MS,signal?:AbortSignal) => inWorker<Parsed>(html,ms,signal)

const robotsAllow = async (txt:string,url:string,signal:AbortSignal) => (await inWorker<{allowed:boolean}>({txt,url,ua:UA},PARSE_MS,signal))?.allowed === true

async function follow(start:string,key:string,io:Io,signal:AbortSignal,guard?:(u:URL) => Promise<void>) {
	let url = start
	for (let hop = 0; hop <= MAX_HOPS; hop++) {
		const u = checkUrl(url,key)
		const host = hostOf(u)
		const addrs = isIP(host) ? [{address:host,family:isIP(host)}] : await io.resolve(host)
		if (!addrs.length || addrs.some((a) => isPrivate(a.address))) throw new Error('private')
		await guard?.(u)
		const r = await io.get(u,addrs,signal)
		if (!REDIRECTS.includes(r.status)) return {...r,url:u.href}
		const next = r.headers.location && URL.parse(String(r.headers.location),u)
		if (!next) throw new Error('bad_redirect')
		url = next.href
	}
	throw new Error('too_many_redirects')
}

async function loadRobots(url:string,key:string,io:Io,signal:AbortSignal) {
	let txt = DENY_ALL
	try {
		const r = await follow(url,key,io,signal)
		if (r.status === 404) txt = ''
		if (r.status === 200) txt = r.body
	} catch {}
	return txt
}

export async function safeFetch(url:string,companyKey?:string,o:FetchOpts = {}):Promise<Fetched> {
	const io = o.io ?? realIo
	const robots = o.robots ?? new Map<string,Promise<string>>()
	const key = companyKey ?? keyOf(checkUrl(url))
	const signal = AbortSignal.timeout(o.timeoutMs ?? TIMEOUT)
	const timedOut = new Promise<never>((ok,no) => signal.addEventListener('abort',() => no(new Error('timeout'))))

	async function run() {
		const r = await follow(url,key,io,signal,async (u) => {
			if (!robots.has(u.origin)) robots.set(u.origin,loadRobots(u.origin + '/robots.txt',key,io,signal))
			const txt = await robots.get(u.origin)
			if (txt && !await robotsAllow(txt,u.href,signal)) throw new Error('robots')
		})
		if (r.status !== 200) throw new Error('status_' + r.status)
		if (!/^\s*(text\/html|application\/xhtml\+xml)/i.test(String(r.headers['content-type']))) throw new Error('not_html')
		if (String(r.headers['tdm-reservation']).trim() === '1' || AI_OFF.test(String(r.headers['x-robots-tag']))) throw new Error('tdm_reserved')
		const parsed = await (o.parse ?? parseHtml)(r.body,PARSE_MS,signal)
		if (!parsed) throw new Error('unparseable')
		if (parsed.optOut) throw new Error('tdm_reserved')
		return {url:r.url,html:r.body,text:parsed.text,retrieved_at:new Date().toISOString()}
	}

	return Promise.race([run(),timedOut])
}
