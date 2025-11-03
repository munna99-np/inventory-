import AsyncStorage from '@react-native-async-storage/async-storage'

export function formatCurrency(value: number, currency: string = 'INR', locale: string = 'en-IN') {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: currency, maximumFractionDigits: 2 }).format(value)
  } catch {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value)
  }
}

export async function formatCurrencyAsync(value: number, currency?: string, locale?: string) {
  try {
    const cur = currency || (await AsyncStorage.getItem('app_currency')) || 'INR'
    const loc = locale || (await AsyncStorage.getItem('app_locale')) || 'en-IN'
    return formatCurrency(value, cur, loc)
  } catch {
    return formatCurrency(value)
  }
}

export function parseMoney(input: string): number | null {
  const cleaned = input.replace(/[^0-9.-]/g, '')
  if (!cleaned) return null
  const num = Number(cleaned)
  return Number.isFinite(num) ? num : null
}
