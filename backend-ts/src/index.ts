import {serve} from '@hono/node-server'
import {createApp} from './app'
import {createDemo} from './demo'
import {readEnv} from './env'
import {createLlm} from './llm'
import {pickStore} from './store/pick'

const env = readEnv()
const store = pickStore(env)
const demo = env.DEMO_MODE ? createDemo() : undefined
const app = createApp({store,llm:createLlm(env),env,demo,now:() => new Date()})

serve({fetch:app.fetch,port:env.PORT,hostname:env.HOST},(i) => console.log('listening on',env.HOST,i.port))
