import type {Env} from '../env'
import {memStore} from './mem'
import {supabaseStore} from './supabase'
import type {Store} from './types'

export function pickStore(env:Env):Store {
	if (!env.SUPABASE_URL) {
		console.warn('SUPABASE_URL not set : using memory store, data is not persisted')
		return memStore()
	}
	if (env.DEMO_MODE) {
		console.warn('DEMO_MODE=1 : using memory store so an outage can not stop the demo, data is not persisted')
		return memStore()
	}
	return supabaseStore(env)
}
