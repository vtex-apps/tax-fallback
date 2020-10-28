import {
  ExternalClient,
  InstanceOptions,
  IOContext,
  Apps,
  // IOResponse,
} from '@vtex/api'

function createBasicAuthHeader(account: string, licenseKey: string) {
  const base64Encoded = Buffer.from(`${account}:${licenseKey}`).toString(
    'base64'
  )

  return `Basic ${base64Encoded}`
}

export default class Avalara extends ExternalClient {
  constructor(context: IOContext, options?: InstanceOptions) {
    super('http://sandbox-rest.avatax.com/api/v2/', context, options)
  }

  public async downloadTaxRatesByZipCode(date: string): Promise<string> {
    const apps = new Apps(this.context)
    const appId = process.env.VTEX_APP_ID as string
    const settings = await apps.getAppSettings(appId)

    if (!settings.avalaraLogin || !settings.avalaraPassword) return ''

    const authorization = createBasicAuthHeader(
      settings.avalaraLogin,
      settings.avalaraPassword
    )

    return this.http.get(`taxratesbyzipcode/download/${date}`, {
      headers: {
        Authorization: authorization,
        'X-Vtex-Use-Https': true,
        'Content-Type': 'application/json;charset=UTF-8',
      },
      metric: 'downloadTaxRatesByZipCode',
    })
  }
}
