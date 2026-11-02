import {z} from 'zod'

const flag = z.enum(['0','1']).default('0').transform((v) => v === '1')

const Schema = z.object({
	LLM_BASE_URL:z.url(),
	LLM_API_KEY:z.string(),
	LLM_MODEL:z.string().default('zai-org/GLM-5.3-Flash'),
	LLM_FALLBACK_MODEL:z.string().default('deepseek-ai/DeepSeek-V4.1-Flash'),
	LLM_TIMEOUT_MS:z.coerce.number().int().positive().default(60000),
	LLM_DAILY_CALL_CAP:z.coerce.number().int().positive().default(2000),
	SUPABASE_URL:z.url().optional(),
	SUPABASE_SERVICE_ROLE_KEY:z.string().optional(),
	CORS_ORIGIN:z.string().default('http://localhost:5173'),
	DEMO_MODE:flag,
	PORT:z.coerce.number().int().positive().default(8787),
	HOST:z.string().default('127.0.0.1'),
	TRUST_PROXY:z.coerce.number().int().min(0).default(0),
})

export type Env = z.infer<typeof Schema>

export function readEnv(src:Record<string,string|undefined> = process.env):Env {
	const vals = Object.fromEntries(Object.entries(src).filter(([k,v]) => v !== ''))
	return Schema.parse(vals)
}
