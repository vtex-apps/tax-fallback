import {
  ClientsConfig,
  LRUCache,
  method,
  Service,
  ServiceContext,
  EventContext,
  RecorderState,
} from '@vtex/api'

import { Clients } from './clients'
import {
  getFallbackByPostalCode,
  downloadFallbackTable,
  updateTax,
} from './middlewares/fallback'
import { throttle } from './middlewares/throttle'

const TIMEOUT_MS = 10000

const memoryCache = new LRUCache<string, any>({ max: 5000 })

metrics.trackCache('tax-fallback', memoryCache)

const clients: ClientsConfig<Clients> = {
  implementation: Clients,
  options: {
    default: {
      retries: 1,
      timeout: TIMEOUT_MS,
    },
    avalara: {
      memoryCache,
    },
  },
}

declare global {
  // We declare a global Context type just to avoid re-writing ServiceContext<Clients, State> in every handler and resolver
  type Context = ServiceContext<Clients, State>
  type EventCtx = EventContext<Clients>

  // The shape of our State object found in `ctx.state`. This is used as state bag to communicate between middlewares.
  interface State extends RecorderState {
    country: string
    provider: string
    postalCode: string
  }
}

// Export a service that defines route handlers and client options.
export default new Service({
  clients,
  routes: {
    getFallbackTaxes: method({
      GET: getFallbackByPostalCode,
    }),
    downloadFallbackTaxes: method({
      POST: downloadFallbackTable,
    }),
  },
  events: {
    taxUpdate: [throttle, updateTax],
  },
})
