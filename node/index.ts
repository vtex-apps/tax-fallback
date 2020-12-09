import {
  ClientsConfig,
  LRUCache,
  method,
  Service,
  ServiceContext,
  RecorderState,
} from '@vtex/api'

import { Clients } from './clients'
import {
  getFallbackByPostalCode,
  downloadFallbackTable,
} from './middlewares/fallback'

const TIMEOUT_MS = 10000

const memoryCache = new LRUCache<string, any>({ max: 5000 })

metrics.trackCache('tax-fallback', memoryCache)

const clients: ClientsConfig<Clients> = {
  implementation: Clients,
  options: {
    default: {
      retries: 2,
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
})
