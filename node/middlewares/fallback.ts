/* eslint-disable no-console */
import { Apps, NotFoundError, UserInputError } from '@vtex/api'
import parse from 'csv-parse/lib/sync'

import {
  FALLBACK_ENTITY_PREFIX,
  SUPPORTED_PROVIDERS,
  AVALARA_FIELDS,
  AVALARA_SCHEMA,
  SCHEMA_VERSION,
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

  // await setupFallbackSchema(ctx)
  try {
    result = await masterdata.searchDocuments({
      dataEntity: `${FALLBACK_ENTITY_PREFIX}${provider}`,
      fields: provider === 'avalara' ? AVALARA_FIELDS : [],
      schema: SCHEMA_VERSION,
      where: `ZIP_CODE=${postalCode}`,
      pagination: { page: 1, pageSize: 10 },
    })
  } catch (e) {
    console.log(`Failed to find taxes for ${postalCode}`)
    console.log(e)
  }

  const [data] = result

  // eslint-disable-next-line no-console
  console.log(data)

  ctx.status = 200
  ctx.body = data
  ctx.set('Cache-Control', headers['cache-control'])

  await next()
}

export async function downloadFallbackTable(
  ctx: Context,
  next: () => Promise<any>
) {
  const {
    headers,
    clients: { masterdata, avalara },
  } = ctx

  const { provider } = ctx.vtex.route.params

  if (!provider) {
    throw new UserInputError('Provider must be provided')
  }

  if (!SUPPORTED_PROVIDERS.includes(provider.toString())) {
    throw new UserInputError('Invalid provider provided')
  }

  const updatedPostalCodes: string[] = []
  const failedPostalCodes: string[] = []

  await setupFallbackSchema(ctx)

  if (provider === 'avalara') {
    const date = new Date()
    const formattedDate = date.toISOString().slice(0, 10)

    console.log('start avalara')

    await avalara
      .downloadTaxRatesByZipCode(formattedDate)
      .catch(e => {
        console.log(e)
        throw new NotFoundError('Failed to download new fallback table')
      })
      .then(response => {
        if (!response)
          throw new NotFoundError('Failed to download new fallback table')

        return parse(response, {
          columns: true,
        })
      })
      .then(async (parsed: any[]) => {
        await Promise.all(
          parsed.map(async row => {
            const [existingDocument] = (await masterdata.searchDocuments({
              dataEntity: `${FALLBACK_ENTITY_PREFIX}${provider}`,
              fields: provider === 'avalara' ? AVALARA_FIELDS : [],
              schema: SCHEMA_VERSION,
              where: `ZIP_CODE=${row.ZIP_CODE}`,
              pagination: { page: 1, pageSize: 10 },
            })) as any

            try {
              await masterdata.createOrUpdateEntireDocument({
                dataEntity: `${FALLBACK_ENTITY_PREFIX}${provider}`,
                fields: {
                  date: formattedDate,
                  TAX_SHIPPING_ALONE: row.TAX_SHIPPING_ALONE === 'Y',
                  TAX_SHIPPING_AND_HANDLING_TOGETHER:
                    row.TAX_SHIPPING_AND_HANDLING_TOGETHER === 'Y',
                  ...row,
                },
                schema: SCHEMA_VERSION,
                id: existingDocument?.id,
              })
              updatedPostalCodes.push(row.ZIP_CODE)
            } catch (e) {
              failedPostalCodes.push(row.ZIP_CODE)
              console.log(`Failed to update postal code ${row.ZIP_CODE}`)
              console.log(e)
            }
          })
        )
      })
  }

  ctx.status = 200
  ctx.body = { updated: updatedPostalCodes, failed: failedPostalCodes }
  ctx.set('Cache-Control', headers['cache-control'])

  await next()
}
