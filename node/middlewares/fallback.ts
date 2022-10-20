/* eslint-disable no-console */
import {
  Apps,
  AuthenticationError,
  NotFoundError,
  UserInputError,
  TooManyRequestsError,
} from '@vtex/api'
import parse from 'csv-parse/lib/sync'

import {
  TAX_UPDATE_EVENT,
  VBASE_BUCKET,
  AVALARA_LOCK_PATH,
  FALLBACK_ENTITY_PREFIX,
  SUPPORTED_PROVIDERS,
  AVALARA_SCHEMA,
  SCHEMA_VERSION,
  MS_PER_DAY,
  DAYS_TO_TRIGGER_DOWNLOAD,
} from '../constants'

interface TaxEntry {
  provider: string
  date: string
  TAX_SHIPPING_ALONE: boolean
  TAX_SHIPPING_AND_HANDLING_TOGETHER: boolean
  ZIP_CODE: string
  STATE_ABBREV: string
  COUNTY_NAME: string
  CITY_NAME: string
  STATE_SALES_TAX: number
  STATE_USE_TAX: number
  COUNTY_SALES_TAX: number
  COUNTY_USE_TAX: number
  CITY_SALES_TAX: number
  CITY_USE_TAX: number
  TOTAL_SALES_TAX: number
  TOTAL_USE_TAX: number
}

interface TaxLock {
  locked: boolean
}

const getAppId = (): string => {
  return process.env.VTEX_APP_ID ?? ''
}

function timeout(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function setupFallbackSchema(ctx: Context) {
  const {
    clients: { masterdata },
  } = ctx

  const { provider } = ctx.vtex.route.params

  const apps = new Apps(ctx.vtex)
  const app: string = getAppId()
  const settings = await apps.getAppSettings(app)

  if (
    settings[provider as string] &&
    settings[provider as string].hasSchema &&
    settings[provider as string].schemaVersion === SCHEMA_VERSION
  )
    return settings

  if (!settings[provider as string]) {
    settings[provider as string] = {}
  }

  try {
    await masterdata
      .createOrUpdateSchema({
        dataEntity: `${FALLBACK_ENTITY_PREFIX}${provider}`,
        schemaName: SCHEMA_VERSION,
        schemaBody: provider === 'avalara' ? AVALARA_SCHEMA : {},
      })
      .then(() => {
        settings[provider as string].hasSchema = true
        settings[provider as string].schemaVersion = SCHEMA_VERSION
      })
      .catch((e: any) => {
        settings[provider as string].hasSchema = false
        // eslint-disable-next-line vtex/prefer-early-return
        if (e.response.status === 304) {
          settings[provider as string].hasSchema = true
          settings[provider as string].schemaVersion = SCHEMA_VERSION
        }
      })
  } catch (e) {
    settings[provider as string].hasSchema = false
  }

  await apps.saveAppSettings(app, settings)

  return settings
}

export async function saveFallbackSchema(
  ctx: Context,
  next: () => Promise<void>
) {
  const { headers } = ctx

  const { provider } = ctx.vtex.route.params

  if (!provider) {
    throw new UserInputError('Provider must be provided')
  }

  if (!SUPPORTED_PROVIDERS.includes(provider.toString())) {
    throw new UserInputError('Invalid provider provided')
  }

  const settings = await setupFallbackSchema(ctx)

  settings.adminSetup.appVersion = process.env.VTEX_APP_VERSION

  ctx.status = 200
  ctx.body = settings
  ctx.set('Cache-Control', headers['cache-control'])

  await next()
}

export async function getFallbackByPostalCode(
  ctx: Context,
  next: () => Promise<void>
) {
  const {
    headers,
    clients: { vbase },
    vtex: { logger },
  } = ctx

  const { provider, postalCode } = ctx.vtex.route.params

  if (!provider) {
    throw new UserInputError('Provider must be provided')
  }

  if (!SUPPORTED_PROVIDERS.includes(provider.toString())) {
    throw new UserInputError('Invalid provider provided')
  }

  if (!postalCode) {
    throw new UserInputError('Postal code must be provided')
  }

  if (postalCode.length !== 5 || !/^\d+$/.test(postalCode.toString())) {
    throw new UserInputError(
      'Postal code must be provided as a five-digit string'
    )
  }

  const path = `${provider}-${postalCode}`

  const data: TaxEntry = await vbase.getJSON(VBASE_BUCKET, path, true)

  if (!data) throw new NotFoundError(`No taxes found for ${postalCode}`)

  if (data?.date) {
    const taxDate = new Date(data.date).valueOf()
    const diff = Date.now() - taxDate

    if (diff / MS_PER_DAY > DAYS_TO_TRIGGER_DOWNLOAD) {
      logger.info({
        message:
          'Avalara: download of new fallback table triggered (expired date)',
      })
      downloadFallbackTableAvalara(ctx).catch(() => {})
    }
  }

  ctx.status = 200
  ctx.body = data
  ctx.set('Cache-Control', headers['cache-control'])

  await next()
}

async function downloadFallbackTableAvalara(ctx: Context) {
  const {
    vtex: { logger },
    clients: { events, avalara, vbase },
  } = ctx

  const checkLock: TaxLock = await vbase.getJSON(
    VBASE_BUCKET,
    AVALARA_LOCK_PATH,
    true
  )

  if (checkLock?.locked) {
    return
  }

  const date = new Date()
  const formattedDate = date.toISOString().slice(0, 10)

  await avalara
    .downloadTaxRatesByZipCode(formattedDate)
    .catch(e => {
      logger.error({
        message: `Avalara: Failed to download new fallback table`,
        error: e,
      })
      throw new NotFoundError('Failed to download new fallback table')
    })
    .then(async response => {
      if (!response) {
        logger.error({
          message: `Avalara: Failed to download new fallback table (null response)`,
        })
        throw new NotFoundError(
          'Failed to download new fallback table (null response)'
        )
      }

      await vbase
        .saveJSON(VBASE_BUCKET, AVALARA_LOCK_PATH, { locked: true })
        .catch(() => {})

      return parse(response, {
        columns: true,
      })
    })
    .then(async (parsed: any[]) => {
      for (const row of parsed) {
        // eslint-disable-next-line no-await-in-loop
        await timeout(50)
        events.sendEvent('vtex.tax-fallback', TAX_UPDATE_EVENT, {
          provider: 'avalara',
          date: formattedDate,
          TAX_SHIPPING_ALONE: row.TAX_SHIPPING_ALONE === 'Y',
          TAX_SHIPPING_AND_HANDLING_TOGETHER:
            row.TAX_SHIPPING_AND_HANDLING_TOGETHER === 'Y',
          ZIP_CODE: row.ZIP_CODE,
          STATE_ABBREV: row.STATE_ABBREV,
          COUNTY_NAME: row.COUNTY_NAME,
          CITY_NAME: row.CITY_NAME,
          STATE_SALES_TAX: parseFloat(row.STATE_SALES_TAX),
          STATE_USE_TAX: parseFloat(row.STATE_USE_TAX),
          COUNTY_SALES_TAX: parseFloat(row.COUNTY_SALES_TAX),
          COUNTY_USE_TAX: parseFloat(row.COUNTY_USE_TAX),
          CITY_SALES_TAX: parseFloat(row.CITY_SALES_TAX),
          CITY_USE_TAX: parseFloat(row.CITY_USE_TAX),
          TOTAL_SALES_TAX: parseFloat(row.TOTAL_SALES_TAX),
          TOTAL_USE_TAX: parseFloat(row.TOTAL_USE_TAX),
        })
      }

      await vbase
        .saveJSON(VBASE_BUCKET, AVALARA_LOCK_PATH, { locked: false })
        .catch(() => {})
    })
}

export async function downloadFallbackTable(
  ctx: Context,
  next: () => Promise<void>
) {
  const {
    headers,
    clients: { apps, vbase },
  } = ctx

  const app: string = getAppId()
  const settings = await apps.getAppSettings(app)

  const { provider } = ctx.vtex.route.params

  if (!provider) {
    throw new UserInputError('Provider must be provided')
  }

  if (!SUPPORTED_PROVIDERS.includes(provider.toString())) {
    throw new UserInputError('Invalid provider provided')
  }

  if (provider === 'avalara') {
    if (!settings.avalaraLogin || !settings.avalaraPassword) {
      throw new AuthenticationError('Avalara credentials not found')
    }

    const checkLock: TaxLock = await vbase.getJSON(
      VBASE_BUCKET,
      AVALARA_LOCK_PATH,
      true
    )

    if (checkLock?.locked) {
      ctx.status = 200
      ctx.body = {
        msg: 'Update already in progress',
      }
      ctx.set('Cache-Control', headers['cache-control'])

      return next()
    }

    const date = new Date()
    const formattedDate = date.toISOString().slice(0, 10)

    const path = `avalara-98101` // this is the highest postal code in Avalara's table
    const checkDate: TaxEntry = await vbase.getJSON(VBASE_BUCKET, path, true)

    if (checkDate?.date === formattedDate) {
      ctx.status = 200
      ctx.body = {
        msg: 'Taxes are already up to date',
      }
      ctx.set('Cache-Control', headers['cache-control'])

      return next()
    }

    downloadFallbackTableAvalara(ctx)
  }

  ctx.status = 200
  ctx.body = {
    msg: 'Tax update initiated',
  }
  ctx.set('Cache-Control', headers['cache-control'])

  await next()
}

export async function updateTax(ctx: EventCtx, next: () => Promise<void>) {
  const {
    body,
    clients: { vbase },
    vtex: { logger },
  } = ctx

  if (!body.provider || !body.date || !body.ZIP_CODE || !body.TOTAL_SALES_TAX) {
    return next()
  }

  const path = `${body.provider}-${body.ZIP_CODE}`

  const existingData: TaxEntry | null = await vbase.getJSON(
    VBASE_BUCKET,
    path,
    true
  )

  if (existingData?.date) {
    const oldDate = new Date(existingData.date).valueOf()
    const newDate = new Date(body.date).valueOf()

    if (oldDate >= newDate) {
      return next()
    }
  }

  await vbase.saveJSON(VBASE_BUCKET, path, body).catch(error => {
    logger.warn({
      message: 'updateTax-error',
      error,
    })

    throw new TooManyRequestsError('Save to vbase request failed')
  })

  await next()
}
