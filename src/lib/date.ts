import NepaliDate from "nepali-date-converter"

import { getCalendar, getLocale } from "./settings"

export type CalendarPreference = "ad" | "bs"

function resolveCalendar(): CalendarPreference {
  try {
    return getCalendar()
  } catch {
    return "ad"
  }
}

function resolveLocale(): string {
  try {
    return getLocale()
  } catch {
    return "en-IN"
  }
}

function parseDate(input: Date | string | number | null | undefined): Date | null {
  if (!input) return null
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input
  }
  if (typeof input === "number") {
    const date = new Date(input)
    return Number.isNaN(date.getTime()) ? null : date
  }
  const date = new Date(input)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatAD(date: Date, withTime: boolean, localeOverride?: string): string {
  const locale = localeOverride || resolveLocale()
  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    ...(withTime ? { timeStyle: "short" } : {}),
  })
  return formatter.format(date)
}

function formatBS(date: Date, withTime: boolean, localeOverride?: string): string {
  NepaliDate.language = "en"
  const bsDate = new NepaliDate(date)
  const datePart = bsDate.format("MMMM DD, YYYY")
  if (!withTime) return `${datePart} BS`

  const locale = localeOverride || resolveLocale()
  const timePart = new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(date)
  return `${datePart} BS, ${timePart}`
}

type FormatOptions = {
  calendar?: CalendarPreference
  locale?: string
}

export function formatAppDate(input: Date | string | number | null | undefined, options?: FormatOptions): string {
  const date = parseDate(input)
  if (!date) return ""
  const calendar = options?.calendar || resolveCalendar()
  const locale = options?.locale
  if (calendar === "bs") {
    return formatBS(date, false, locale)
  }
  return formatAD(date, false, locale)
}

export function formatAppDateTime(input: Date | string | number | null | undefined, options?: FormatOptions): string {
  const date = parseDate(input)
  if (!date) return ""
  const calendar = options?.calendar || resolveCalendar()
  const locale = options?.locale
  if (calendar === "bs") {
    return formatBS(date, true, locale)
  }
  return formatAD(date, true, locale)
}

export function formatAppDateRange(
  start: Date | string | number | null | undefined,
  end: Date | string | number | null | undefined,
  options?: FormatOptions
): string {
  const startLabel = formatAppDate(start, options)
  const endLabel = formatAppDate(end, options)
  if (!startLabel && !endLabel) return ""
  if (!startLabel) return endLabel
  if (!endLabel) return startLabel
  return `${startLabel} - ${endLabel}`
}
