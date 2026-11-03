import {createServer,type ServerResponse} from 'node:http'
import type {AddressInfo} from 'node:net'
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest'
import {checkUrl,type Io,isPrivate,keyOf,type Raw,realIo,safeFetch} from '../src/fetch'

const HTML = '<html><head><title>t</title></head><body><p>hello</p></body></html>'
const PUBLIC = [{address:'93.184.216.34',family:4}]

const page = (body = HTML,headers:Raw['headers'] = {}):Raw => ({status:200,headers:{'content-type':'text/html; charset=utf-8',...headers},body})
const moved = (location:string,status = 302):Raw => ({status,headers:{location},body:''})
const missing:Raw = {status:404,headers:{},body:''}

function fakeIo(routes:Record<string,Raw|Error>,dns:Record<string,string[]> = {}) {
	const asked:string[] = []
	const io:Io = {
		async resolve(host) {
			if (host in dns) return dns[host].map((address) => ({address,family:address.includes(':') ? 6 : 4}))
			return PUBLIC
		},
		async get(u) {
			asked.push(u.href)
			const r = routes[u.href] ?? (u.pathname === '/robots.txt' ? missing : undefined)
			if (!r) throw new Error('no route ' + u.href)
			if (r instanceof Error) throw r
			return r
		},
	}
	return {io,asked}
}

describe('isPrivate',() => {
	it.each([
		'0.0.0.0','10.0.0.1','100.64.0.1','100.127.255.255','100.100.100.200','127.0.0.1','127.255.255.254','168.63.129.16','169.254.169.254','172.16.0.1','172.31.255.255','192.0.0.192','192.168.1.1','198.18.0.1','224.0.0.1','239.255.255.255','240.0.0.1','255.255.255.255',
		'::','::1','::7f00:1','::ffff:127.0.0.1','::ffff:7f00:1','::ffff:a9fe:a9fe','::ffff:8.8.8.8','64:ff9b::7f00:1','2002:7f00:1::','2001:0:4136:e378::1','fc00::1','fd00:ec2::254','fe80::1','fe80::1%eth0','fec0::1','ff02::1',
		'not an ip','',
	])('blocks %s',(ip) => {
		expect(isPrivate(ip)).toBe(true)
	})

	it.each(['8.8.8.8','93.184.216.34','9.255.255.255','11.0.0.1','100.63.255.255','100.128.0.1','172.15.255.255','172.32.0.1','192.169.0.1','223.255.255.255','2606:4700:4700::1111','2a00:1450:4001:81a::200e'])('allows %s',(ip) => {
		expect(isPrivate(ip)).toBe(false)
	})
})

describe('checkUrl',() => {
	it.each([
		['http://localhost/','private'],
		['http://LOCALHOST./','private'],
		['http://foo.localhost/','private'],
		['http://metadata.google.internal/','private'],
		['http://printer.local/','private'],
		['http://intranet/','private'],
		['http://127.0.0.1/','private'],
		['http://127.0.0.1./','private'],
		['http://169.254.169.254/latest/meta-data/','private'],
		['http://10.1.2.3/','private'],
		['http://192.168.0.1/','private'],
		['http://100.64.0.1/','private'],
		['http://[::1]/','private'],
		['http://[::ffff:127.0.0.1]/','private'],
		['http://[::ffff:7f00:1]/','private'],
		['http://[fe80::1]/','private'],
		['http://[fd00:ec2::254]/','private'],
		['http://2130706433/','private'],
		['http://2852039166/','private'],
		['http://0x7f.0.0.1/','private'],
		['http://0x7f000001/','private'],
		['http://0177.0.0.1/','private'],
		['http://127.1/','private'],
		['http://0/','private'],
		['https://acme.test:8443/','bad_port'],
		['http://acme.test:443/','bad_port'],
		['https://acme.test:80/','bad_port'],
		['http://8.8.8.8:8080/','bad_port'],
		['https://user:pw@acme.test/','credentials'],
		['https://user@acme.test/','credentials'],
		['ftp://acme.test/','bad_url'],
		['file:///etc/passwd','bad_url'],
		['gopher://acme.test/','bad_url'],
		['javascript:alert(1)','bad_url'],
		['nope','bad_url'],
		['https://www.linkedin.com/company/acme','blocklisted'],
		['https://de.linkedin.com/','blocklisted'],
		['https://lnkd.in/abc','blocklisted'],
		['https://www.glassdoor.co.uk/','blocklisted'],
		['https://fr.indeed.com/','blocklisted'],
		['https://www.kununu.com/de/acme','blocklisted'],
		['https://XING.com/','blocklisted'],
		['https://linkedin.com./','blocklisted'],
	])('rejects %s as %s',(url,why) => {
		expect(() => checkUrl(url)).toThrow(why)
	})

	it.each(['https://acme.test/','http://acme.test:80/x','https://acme.test:443/x','https://boxing.com/','https://notlinkedin.com/','https://8.8.8.8/'])('allows %s',(url) => {
		expect(checkUrl(url).protocol).toMatch(/^https?:$/)
	})

	it('enforces the company key, www is the same site',() => {
		expect(checkUrl('https://www.acme.test/','acme.test').href).toBe('https://www.acme.test/')
		expect(() => checkUrl('https://careers.acme.test/','acme.test')).toThrow('off_site')
		expect(() => checkUrl('https://acme.test.evil.test/','acme.test')).toThrow('off_site')
	})

	it('the english subdomain is the same site, zalando sends an english reader there',() => {
		expect(checkUrl('https://en.acme.test/','acme.test').href).toBe('https://en.acme.test/')
		expect(keyOf(new URL('https://en.acme.co.uk/'))).toBe('acme.co.uk')
		expect(keyOf(new URL('https://en.com/'))).toBe('en.com')
		expect(() => checkUrl('https://de.acme.test/','acme.test')).toThrow('off_site')
		expect(() => checkUrl('https://en.acme.test.evil.test/','acme.test')).toThrow('off_site')
	})

	it('keyOf strips www, case and the trailing dot',() => {
		expect(keyOf(new URL('https://WWW.Acme.Test./x'))).toBe('acme.test')
	})
})

describe('safeFetch ssrf',() => {
	it('returns the page with a server timestamp',async () => {
		vi.useFakeTimers({toFake:['Date']})
		vi.setSystemTime(new Date('2026-03-04T05:06:07.000Z'))
		const {io} = fakeIo({'https://acme.test/':page()})
		await expect(safeFetch('https://acme.test/',undefined,{io})).resolves.toEqual({url:'https://acme.test/',html:HTML,text:'hello',retrieved_at:'2026-03-04T05:06:07.000Z'})
		vi.useRealTimers()
	})

	it.each(['http://localhost/','http://127.0.0.1/','http://169.254.169.254/','http://10.0.0.1/','http://[::1]/','http://[::ffff:127.0.0.1]/','http://2130706433/','http://0x7f.1/','https://acme.test:8443/','https://u:p@acme.test/','https://linkedin.com/'])('never connects to %s',async (url) => {
		const {io,asked} = fakeIo({})
		await expect(safeFetch(url,undefined,{io})).rejects.toThrow()
		expect(asked).toEqual([])
	})

	it.each([
		[['127.0.0.1']],
		[['169.254.169.254']],
		[['10.0.0.1']],
		[['100.64.0.1']],
		[['::1']],
		[['::ffff:127.0.0.1']],
		[['fe80::1']],
		[['93.184.216.34','10.0.0.1']],
		[['2606:4700:4700::1111','::1']],
		[[]],
	])('rejects a hostname resolving to %j',async (ips) => {
		const {io,asked} = fakeIo({},{'acme.test':ips})
		await expect(safeFetch('https://acme.test/',undefined,{io})).rejects.toThrow('private')
		expect(asked).toEqual([])
	})

	it('passes the checked addresses to the connection',async () => {
		const seen:unknown[] = []
		const {io} = fakeIo({'https://acme.test/':page()})
		const get = io.get
		io.get = (u,addrs,signal) => {
			seen.push(addrs)
			return get(u,addrs,signal)
		}
		await safeFetch('https://acme.test/',undefined,{io})
		expect(seen).toEqual([PUBLIC,PUBLIC])
	})

	it('dns failure rejects',async () => {
		const {io,asked} = fakeIo({})
		io.resolve = async () => {
			throw new Error('ENOTFOUND')
		}
		await expect(safeFetch('https://acme.test/',undefined,{io})).rejects.toThrow('ENOTFOUND')
		expect(asked).toEqual([])
	})
})

describe('safeFetch redirects',() => {
	it('follows same site redirects and reports the final url',async () => {
		const {io} = fakeIo({'https://acme.test/about':moved('/about/'),'https://acme.test/about/':moved('https://www.acme.test/about/',301),'https://www.acme.test/about/':page()})
		expect((await safeFetch('https://acme.test/about',undefined,{io})).url).toBe('https://www.acme.test/about/')
	})

	it('allows 3 hops and refuses a 4th',async () => {
		const chain = (n:number) => Object.fromEntries(Array.from({length:n},(x,i) => ['https://acme.test/' + i,moved('/' + (i + 1))]))
		const ok = fakeIo({...chain(3),'https://acme.test/3':page()})
		expect((await safeFetch('https://acme.test/0',undefined,{io:ok.io})).url).toBe('https://acme.test/3')
		const tooFar = fakeIo({...chain(4),'https://acme.test/4':page()})
		await expect(safeFetch('https://acme.test/0',undefined,{io:tooFar.io})).rejects.toThrow('too_many_redirects')
		expect(tooFar.asked).not.toContain('https://acme.test/4')
	})

	it.each([
		['private ip','http://127.0.0.1/','private'],
		['metadata ip','http://169.254.169.254/latest/','private'],
		['decimal ip','http://2130706433/','private'],
		['v6 loopback','http://[::1]/','private'],
		['off site','https://evil.test/','off_site'],
		['subdomain','https://careers.acme.test/','off_site'],
		['blocklisted','https://www.linkedin.com/company/acme','blocklisted'],
		['non default port','https://acme.test:8443/','bad_port'],
		['credentials','https://u:p@acme.test/','credentials'],
		['other scheme','file:///etc/passwd','bad_url'],
	])('refuses a redirect to %s',async (name,to,why) => {
		const {io,asked} = fakeIo({'https://acme.test/':moved(to)})
		await expect(safeFetch('https://acme.test/',undefined,{io})).rejects.toThrow(why)
		expect(asked.filter((u) => !u.endsWith('/robots.txt'))).toEqual(['https://acme.test/'])
	})

	it('follows a redirect to the english subdomain and keeps its address',async () => {
		const {io} = fakeIo({'https://www.acme.test/':moved('https://en.acme.test/?_rfl=de'),'https://en.acme.test/?_rfl=de':page()})
		await expect(safeFetch('https://www.acme.test/',undefined,{io})).resolves.toMatchObject({url:'https://en.acme.test/?_rfl=de'})
	})

	it('still checks the dns of the english subdomain',async () => {
		const {io} = fakeIo({'https://acme.test/':moved('https://en.acme.test/')},{'en.acme.test':['127.0.0.1']})
		await expect(safeFetch('https://acme.test/',undefined,{io})).rejects.toThrow('private')
	})

	it('refuses a same host redirect once dns turns private',async () => {
		const {io} = fakeIo({'https://acme.test/':moved('https://www.acme.test/')},{'www.acme.test':['127.0.0.1']})
		await expect(safeFetch('https://acme.test/',undefined,{io})).rejects.toThrow('private')
	})

	it('holds an explicit company key from the first hop',async () => {
		const {io,asked} = fakeIo({'https://other.test/':page()})
		await expect(safeFetch('https://other.test/','acme.test',{io})).rejects.toThrow('off_site')
		expect(asked).toEqual([])
	})

	it('refuses a redirect with no location',async () => {
		const {io} = fakeIo({'https://acme.test/':{status:302,headers:{},body:''}})
		await expect(safeFetch('https://acme.test/',undefined,{io})).rejects.toThrow('bad_redirect')
	})
})

describe('safeFetch robots',() => {
	const robots = (body:string):Raw => ({status:200,headers:{'content-type':'text/plain'},body})

	it.each([
		['everyone','User-agent: *\nDisallow: /'],
		['our agent','User-agent: InterviewVerseBot\nDisallow: /'],
		['the path','User-agent: *\nDisallow: /about'],
	])('skips a page disallowed for %s',async (name,txt) => {
		const {io,asked} = fakeIo({'https://acme.test/robots.txt':robots(txt),'https://acme.test/about':page()})
		await expect(safeFetch('https://acme.test/about',undefined,{io})).rejects.toThrow('robots')
		expect(asked).toEqual(['https://acme.test/robots.txt'])
	})

	it('allows paths that robots allows, other agents do not count',async () => {
		const {io} = fakeIo({'https://acme.test/robots.txt':robots('User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /private'),'https://acme.test/about':page()})
		await expect(safeFetch('https://acme.test/about',undefined,{io})).resolves.toMatchObject({url:'https://acme.test/about'})
	})

	it('404 is allowed',async () => {
		const {io} = fakeIo({'https://acme.test/':page()})
		await expect(safeFetch('https://acme.test/',undefined,{io})).resolves.toMatchObject({url:'https://acme.test/'})
	})

	it.each([
		['500',{status:500,headers:{},body:''}],
		['503',{status:503,headers:{},body:''}],
		['403',{status:403,headers:{},body:''}],
		['network failure',new Error('ECONNRESET')],
		['off site redirect',moved('https://evil.test/robots.txt')],
	] as [string,Raw|Error][])('%s on robots.txt means disallowed',async (name,r) => {
		const {io,asked} = fakeIo({'https://acme.test/robots.txt':r,'https://acme.test/':page()})
		await expect(safeFetch('https://acme.test/',undefined,{io})).rejects.toThrow('robots')
		expect(asked).not.toContain('https://acme.test/')
	})

	it.each([
		['403',{status:403,headers:{},body:''}],
		['429',{status:429,headers:{},body:''}],
		['disallow all',robots('User-agent: *\nDisallow: /')],
	] as [string,Raw][])('%s on robots.txt is the site saying no',async (name,r) => {
		const {io} = fakeIo({'https://acme.test/robots.txt':r,'https://acme.test/':page()})
		await expect(safeFetch('https://acme.test/',undefined,{io})).rejects.toThrow(/^robots$/)
	})

	it.each([
		['500',{status:500,headers:{},body:''}],
		['503',{status:503,headers:{},body:''}],
		['network failure',new Error('ECONNRESET')],
		['off site redirect',moved('https://evil.test/robots.txt')],
	] as [string,Raw|Error][])('%s on robots.txt is no answer, not a refusal',async (name,r) => {
		const {io} = fakeIo({'https://acme.test/robots.txt':r,'https://acme.test/':page()})
		await expect(safeFetch('https://acme.test/',undefined,{io})).rejects.toThrow(/^robots_unknown$/)
	})

	it('checks robots on every hop of a redirect',async () => {
		const {io,asked} = fakeIo({'https://www.acme.test/robots.txt':robots('User-agent: *\nDisallow: /'),'https://acme.test/':moved('https://www.acme.test/'),'https://www.acme.test/':page()})
		await expect(safeFetch('https://acme.test/',undefined,{io})).rejects.toThrow('robots')
		expect(asked).not.toContain('https://www.acme.test/')
	})

	it('a shared map loads robots.txt once per origin',async () => {
		const {io,asked} = fakeIo({'https://acme.test/a':page(),'https://acme.test/b':page()})
		const shared = new Map()
		await Promise.all(['a','b'].map((p) => safeFetch('https://acme.test/' + p,undefined,{io,robots:shared})))
		expect(asked.filter((u) => u.endsWith('/robots.txt'))).toHaveLength(1)
	})
})

describe('safeFetch content',() => {
	it.each(['1',' 1 '])('skips tdm-reservation %j',async (v) => {
		const {io} = fakeIo({'https://acme.test/':page(HTML,{'tdm-reservation':v})})
		await expect(safeFetch('https://acme.test/',undefined,{io})).rejects.toThrow('tdm_reserved')
	})

	it('tdm-reservation 0 is fine',async () => {
		const {io} = fakeIo({'https://acme.test/':page(HTML,{'tdm-reservation':'0'})})
		await expect(safeFetch('https://acme.test/',undefined,{io})).resolves.toMatchObject({html:HTML})
	})

	it.each([
		'<meta name="robots" content="noai">',
		'<meta name="robots" content="index, follow, NoAI">',
		'<meta name="ROBOTS" content="notdm">',
		'<meta content="noai" name="Robots">',
	])('skips %s',async (meta) => {
		const {io} = fakeIo({'https://acme.test/':page('<html><head>' + meta + '</head><body>x</body></html>')})
		await expect(safeFetch('https://acme.test/',undefined,{io})).rejects.toThrow('tdm_reserved')
	})

	it.each(['<meta name="robots" content="index, follow">','<meta name="robots" content="noimageai">','<meta name="description" content="noai">'])('keeps %s',async (meta) => {
		const {io} = fakeIo({'https://acme.test/':page('<html><head>' + meta + '</head><body>x</body></html>')})
		await expect(safeFetch('https://acme.test/',undefined,{io})).resolves.toMatchObject({url:'https://acme.test/'})
	})

	it.each(['application/pdf','application/json','text/plain','image/png'])('refuses %s',async (type) => {
		const {io} = fakeIo({'https://acme.test/':page('x',{'content-type':type})})
		await expect(safeFetch('https://acme.test/',undefined,{io})).rejects.toThrow('not_html')
	})

	it('refuses a missing content type',async () => {
		const {io} = fakeIo({'https://acme.test/':{status:200,headers:{},body:'x'}})
		await expect(safeFetch('https://acme.test/',undefined,{io})).rejects.toThrow('not_html')
	})

	it('accepts xhtml',async () => {
		const {io} = fakeIo({'https://acme.test/':page(HTML,{'content-type':'application/xhtml+xml'})})
		await expect(safeFetch('https://acme.test/',undefined,{io})).resolves.toMatchObject({html:HTML})
	})

	it.each([404,500])('refuses status %i',async (status) => {
		const {io} = fakeIo({'https://acme.test/':{status,headers:{'content-type':'text/html'},body:HTML}})
		await expect(safeFetch('https://acme.test/',undefined,{io})).rejects.toThrow('status_' + status)
	})

	it('times out on a stuck connection and a stuck resolver',async () => {
		const stuck = fakeIo({})
		stuck.io.get = () => new Promise(() => {})
		await expect(safeFetch('https://acme.test/',undefined,{io:stuck.io,timeoutMs:30})).rejects.toThrow('timeout')
		const dns = fakeIo({})
		dns.io.resolve = () => new Promise(() => {})
		await expect(safeFetch('https://acme.test/',undefined,{io:dns.io,timeoutMs:30})).rejects.toThrow('timeout')
	})
})

// the real transport, pinned to loopback : the hostname acme.test is never looked up
describe('real transport',() => {
	let port = 0
	let seen:Record<string,string|string[]|undefined>[] = []
	const open = new Set<ServerResponse>()
	const server = createServer((req,res) => {
		seen.push({...req.headers,path:req.url})
		const path = req.url ?? ''
		if (path === '/robots.txt') {
			res.writeHead(404)
			return res.end()
		}
		if (path === '/big') {
			res.writeHead(200,{'content-type':'text/html'})
			return res.end('x'.repeat(4 * 1024 * 1024))
		}
		if (path === '/gz') {
			res.writeHead(200,{'content-type':'text/html','content-encoding':'gzip'})
			return res.end('zzz')
		}
		if (path === '/hang') {
			res.writeHead(200,{'content-type':'text/html'})
			res.write('<html>')
			open.add(res)
			return
		}
		if (path === '/moved') {
			res.writeHead(302,{location:'/'})
			return res.end()
		}
		res.writeHead(200,{'content-type':'text/html'})
		res.end(HTML)
	})

	beforeAll(async () => {
		await new Promise<void>((done) => server.listen(0,'127.0.0.1',done))
		port = (server.address() as AddressInfo).port
	})

	afterAll(async () => {
		for (const r of open) r.destroy()
		await new Promise((done) => server.close(done))
	})

	const pinned = [{address:'127.0.0.1',family:4}]
	const get = (path:string,signal = AbortSignal.timeout(5000)) => realIo.get(new URL('http://acme.test:' + port + path),pinned,signal)

	it('connects to the pinned address and keeps the hostname in the host header',async () => {
		seen = []
		const r = await get('/')
		expect(r.status).toBe(200)
		expect(r.body).toBe(HTML)
		expect(seen[0].host).toBe('acme.test:' + port)
		expect(seen[0]['user-agent']).toBe('InterviewVerseBot/0.1')
		expect(seen[0]['accept-encoding']).toBe('identity')
	})

	it('asks for english, a site that redirects by ip otherwise picks the language of this server',async () => {
		seen = []
		await get('/')
		expect(seen[0]['accept-language']).toBe('en')
	})

	it('stops reading at 3MB',async () => {
		const r = await get('/big')
		expect(r.status).toBe(200)
		expect(r.body.length).toBe(3 * 1024 * 1024)
	})

	it('does not follow redirects by itself',async () => {
		seen = []
		const r = await get('/moved')
		expect(r.status).toBe(302)
		expect(r.headers.location).toBe('/')
		expect(seen).toHaveLength(1)
	})

	it('refuses a compressed body it did not ask for',async () => {
		await expect(get('/gz')).rejects.toThrow('encoded')
	})

	it('aborts a stuck body on the signal',async () => {
		await expect(get('/hang',AbortSignal.timeout(50))).rejects.toThrow()
	})
})
