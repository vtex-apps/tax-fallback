/* eslint-disable no-await-in-loop */
/* eslint-disable no-console */
import { Apps, NotFoundError, UserInputError } from '@vtex/api'
import parse from 'csv-parse/lib/sync'
import asyncPool from 'tiny-async-pool'

import {
  FALLBACK_ENTITY_PREFIX,
  SUPPORTED_PROVIDERS,
  AVALARA_FIELDS,
  AVALARA_SCHEMA,
  SCHEMA_VERSION,
  MS_PER_DAY,
  DAYS_TO_TRIGGER_DOWNLOAD,
} from '../constants'

const getAppId = (): string => {
  return process.env.VTEX_APP_ID ?? ''
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
  next: () => Promise<any>
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
  next: () => Promise<any>
) {
  const {
    headers,
    clients: { masterdata },
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

  let result: any[] = []

  try {
    result = await masterdata.searchDocuments({
      dataEntity: `${FALLBACK_ENTITY_PREFIX}${provider}`,
      fields: provider === 'avalara' ? AVALARA_FIELDS : [],
      schema: SCHEMA_VERSION,
      where: `ZIP_CODE=${postalCode}`,
      pagination: { page: 1, pageSize: 10 },
    })
  } catch (e) {
    logger.error({
      message: `Avalara: Failed to find taxes for ${postalCode}`,
      error: e,
    })
    throw new NotFoundError(`Failed to find taxes for ${postalCode}`)
  }

  const [data] = result

  if (data.date) {
    const taxDate = new Date(data.date).valueOf()
    const diff = Date.now() - taxDate

    if (diff / MS_PER_DAY > DAYS_TO_TRIGGER_DOWNLOAD) {
      logger.info({
        message: 'Avalara: download of new fallback table triggered',
      })
      downloadFallbackTableAvalara(ctx)
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
    clients: { masterdata, avalara },
  } = ctx

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
    .then(response => {
      if (!response) {
        logger.error({
          message: `Avalara: Failed to download new fallback table (null response)`,
        })
        throw new NotFoundError(
          'Failed to download new fallback table (null response)'
        )
      }

      return parse(response, {
        columns: true,
      })
    })
    .then(async (parsed: any[]) => {
      await asyncPool(10, parsed, async row => {
        let existingDocument = null

        try {
          ;[existingDocument] = (await masterdata.searchDocuments({
            dataEntity: `${FALLBACK_ENTITY_PREFIX}avalara`,
            fields: AVALARA_FIELDS,
            schema: SCHEMA_VERSION,
            where: `ZIP_CODE=${row.ZIP_CODE}`,
            pagination: { page: 1, pageSize: 10 },
          })) as any
        } catch (e) {
          // console.log(`Could not find existing record for ${row.ZIP_CODE}`)
        }

        if (existingDocument?.date !== formattedDate) {
          try {
            await masterdata.createOrUpdateEntireDocument({
              dataEntity: `${FALLBACK_ENTITY_PREFIX}avalara`,
              fields: {
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
              },
              schema: SCHEMA_VERSION,
              id: existingDocument?.id,
            })
            // console.log(`Updated ${row.ZIP_CODE}`)
          } catch (e) {
            logger.error({
              message: `Avalara: Failed to update postal code ${row.ZIP_CODE}`,
              error: e,
            })
          }
        }
      })
    })
}

export async function downloadFallbackTable(
  ctx: Context,
  next: () => Promise<any>
) {
  const { headers } = ctx

  const { provider } = ctx.vtex.route.params

  if (!provider) {
    throw new UserInputError('Provider must be provided')
  }

  if (!SUPPORTED_PROVIDERS.includes(provider.toString())) {
    throw new UserInputError('Invalid provider provided')
  }

  await setupFallbackSchema(ctx)

  if (provider === 'avalara') {
    downloadFallbackTableAvalara(ctx)
  }

  ctx.status = 200
  ctx.body = { msg: 'Started download of new tax table' }
  ctx.set('Cache-Control', headers['cache-control'])

  await next()
}
