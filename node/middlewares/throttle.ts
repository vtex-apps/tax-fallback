import { TooManyRequestsError } from '@vtex/api'

const MAX_REQUEST = 10
let COUNTER = 0

export async function throttle(_ctx: EventCtx, next: () => Promise<unknown>) {
  COUNTER++

  try {
    if (COUNTER > MAX_REQUEST) {
      throw new TooManyRequestsError()
    }

    await next()
  } finally {
    COUNTER--
  }
}
