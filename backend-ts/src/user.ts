import {Hono} from 'hono'
import {Id} from './contracts'
import type {Deps} from './deps'
import {ApiErr} from './errors'

const MAX_MARKS = 10000

export const genOf = (deps:Deps,id:string) => deps.gone?.get(id) ?? 0

// a call that started before a delete must not write the user back after the delete answered
export function stillThere(deps:Deps,id:string,gen:number) {
	if (genOf(deps,id) !== gen) throw new ApiErr('not_found','user was deleted while this request ran')
}

export function userRoutes(deps:Deps) {
	const r = new Hono()

	r.get('/user/:id/export',async (c) => c.json(await deps.store.exportUser(Id.parse(c.req.param('id')))))

	r.delete('/user/:id',async (c) => {
		const id = Id.parse(c.req.param('id'))
		if (deps.gone && deps.gone.size >= MAX_MARKS) deps.gone.clear()
		deps.gone?.set(id,genOf(deps,id) + 1)
		return c.json({deleted:await deps.store.deleteUser(id)})
	})

	return r
}
