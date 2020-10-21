import {
  ClientsConfig,
  LRUCache,
  method,
  Service,
  ServiceContext,
  RecorderState,
} from '@vtex/api'
// import * as parse from 'csv-parse/lib/sync'

import { Clients } from './clients'
import {
  getFallbackByPostalCode,
  downloadFallbackTable,
} from './middlewares/fallback'

const TIMEOUT_MS = 800

// Create a LRU memory cache for the Status client.
// The @vtex/api HttpClient respects Cache-Control headers and uses the provided cache.
const memoryCache = new LRUCache<string, any>({ max: 5000 })

metrics.trackCache('tax-fallback', memoryCache)

// This is the configuration for clients available in `ctx.clients`.
const clients: ClientsConfig<Clients> = {
  // We pass our custom implementation of the clients bag, containing the Status client.
  implementation: Clients,
  options: {
    // All IO Clients will be initialized with these options, unless otherwise specified.
    default: {
      retries: 2,
      timeout: TIMEOUT_MS,
    },
    // This key will be merged with the default options and add this cache to our Status client.
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
