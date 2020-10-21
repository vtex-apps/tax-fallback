export const FALLBACK_ENTITY_PREFIX = 'taxFallback_'
export const SUPPORTED_PROVIDERS = ['avalara']
export const AVALARA_FIELDS = [
  'id',
  'date',
  'ZIP_CODE',
  'STATE_ABBREV',
  'COUNTY_NAME',
  'CITY_NAME',
  'STATE_SALES_TAX',
  'STATE_USE_TAX',
  'COUNTY_SALES_TAX',
  'COUNTY_USE_TAX',
  'CITY_SALES_TAX',
  'CITY_USE_TAX',
  'TOTAL_SALES_TAX',
  'TOTAL_USE_TAX',
  'TAX_SHIPPING_ALONE',
  'TAX_SHIPPING_AND_HANDLING_TOGETHER',
]
export const SCHEMA_VERSION = 'v1'
export const AVALARA_SCHEMA = {
  properties: {
    date: {
      type: 'string',
      title: 'Date',
    },
    STATE_ABBREV: {
      type: 'string',
      title: 'State Abbreviation',
    },
    COUNTY_NAME: {
      type: 'string',
      title: 'County Name',
    },
    CITY_NAME: {
      type: 'string',
      title: 'City Name',
    },
    STATE_SALES_TAX: {
      type: 'number',
      title: 'State Sales Tax',
    },
    STATE_USE_TAX: {
      type: 'number',
      title: 'State Use Tax',
    },
    COUNTY_SALES_TAX: {
      type: 'number',
      title: 'County Sales Tax',
    },
    COUNTY_USE_TAX: {
      type: 'number',
      title: 'County Use Tax',
    },
    CITY_SALES_TAX: {
      type: 'number',
      title: 'City Sales Tax',
    },
    CITY_USE_TAX: {
      type: 'number',
      title: 'City Use Tax',
    },
    TOTAL_SALES_TAX: {
      type: 'number',
      title: 'Total Sales Tax',
    },
    TOTAL_USE_TAX: {
      type: 'number',
      title: 'Total Use Tax',
    },
    TAX_SHIPPING_ALONE: {
      type: 'boolean',
      title: 'Shipping is Taxable',
    },
    TAX_SHIPPING_AND_HANDLING_TOGETHER: {
      type: 'boolean',
      title: 'Shipping and Handling Together are Taxable',
    },
  },
  'v-indexed': [
    'date',
    'ZIP_CODE',
    'STATE_ABBREV',
    'COUNTY_NAME',
    'CITY_NAME',
    'STATE_SALES_TAX',
    'STATE_USE_TAX',
    'COUNTY_SALES_TAX',
    'COUNTY_USE_TAX',
    'CITY_SALES_TAX',
    'CITY_USE_TAX',
    'TOTAL_SALES_TAX',
    'TOTAL_USE_TAX',
    'TAX_SHIPPING_ALONE',
    'TAX_SHIPPING_AND_HANDLING_TOGETHER',
  ],
  'v-default-fields': [
    'date',
    'ZIP_CODE',
    'STATE_ABBREV',
    'COUNTY_NAME',
    'CITY_NAME',
    'STATE_SALES_TAX',
    'STATE_USE_TAX',
    'COUNTY_SALES_TAX',
    'COUNTY_USE_TAX',
    'CITY_SALES_TAX',
    'CITY_USE_TAX',
    'TOTAL_SALES_TAX',
    'TOTAL_USE_TAX',
    'TAX_SHIPPING_ALONE',
    'TAX_SHIPPING_AND_HANDLING_TOGETHER',
  ],
  'v-cache': false,
}
