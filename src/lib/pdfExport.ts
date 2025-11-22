/**
 * Professional PDF Export Utility
 * Handles responsive table layouts, page breaks, and consistent styling for all PDF exports
 */

import jsPDF from 'jspdf'
import autoTable, { UserOptions } from 'jspdf-autotable'

type ColorRGB = [number, number, number]

export interface PDFExportOptions {
  title: string
  subtitle?: string
  generatedAt?: Date
  orientation?: 'portrait' | 'landscape'
  pageFormat?: 'a4' | 'letter'
}

export interface TableConfig {
  head: string[]
  body: (string | number)[][]
  columnWidths?: number[]
  columnStyles?: Record<number, any>
  alternateRows?: boolean
  title?: string
}

interface PdfColors {
  primary: ColorRGB
  secondary: ColorRGB
  text: ColorRGB
  border: ColorRGB
  headerText: ColorRGB
  accentGreen: ColorRGB
  accentRed: ColorRGB
}

const DEFAULT_COLORS: PdfColors = {
  primary: [54, 158, 219], // Professional blue
  secondary: [108, 117, 125], // Gray
  text: [45, 55, 72], // Dark gray
  border: [229, 231, 235], // Light gray
  headerText: [255, 255, 255],
  accentGreen: [16, 128, 67],
  accentRed: [220, 38, 38],
}

/**
 * Generate professional PDF document with proper styling
 */
export function createProfessionalPDF(options: PDFExportOptions): jsPDF {
  const {
    title,
    subtitle,
    generatedAt = new Date(),
    orientation = 'landscape',
    pageFormat = 'a4',
  } = options

  const finalColors = DEFAULT_COLORS

  // Create document with optimized margins
  const doc = new jsPDF({
    orientation,
    unit: 'pt',
    format: pageFormat,
  })

  const marginLeft = 40
  const marginRight = 40
  const marginTop = 50

  // Add professional header
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(finalColors.text[0], finalColors.text[1], finalColors.text[2])
  doc.text(title, marginLeft, marginTop)

  if (subtitle) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(12)
    doc.setTextColor(finalColors.secondary[0], finalColors.secondary[1], finalColors.secondary[2])
    doc.text(subtitle, marginLeft, marginTop + 25)
  }

  // Add metadata footer
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(finalColors.secondary[0], finalColors.secondary[1], finalColors.secondary[2])
  const dateStr = generatedAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  doc.text(`Generated on ${dateStr}`, marginLeft, marginTop + 42)

  // Return configured document for further use
  ;(doc as any)._margins = { left: marginLeft, right: marginRight, top: marginTop }
  ;(doc as any)._colors = finalColors

  return doc
}

/**
 * Add a professional table to the PDF with automatic page breaks
 */
export function addProfessionalTable(
  doc: jsPDF,
  tableConfig: TableConfig,
  startY?: number
): number {
  const margins = (doc as any)._margins || { left: 40, right: 40, top: 50 }
  const colors = (doc as any)._colors || DEFAULT_COLORS
  const pageWidth = doc.internal.pageSize.getWidth()
  const contentWidth = pageWidth - margins.left - margins.right

  // Calculate auto column widths if not provided
  const columnCount = tableConfig.head.length
  // Default column width proportions (sums to 1): Date, Type, Accounts, Details, Source, Amount, Notes
  const defaultProportions = [0.10, 0.09, 0.18, 0.30, 0.08, 0.10, 0.15]
  const proportions =
    tableConfig.columnWidths && tableConfig.columnWidths.length === columnCount
      ? tableConfig.columnWidths.map((w) => Number(w) || 0)
      : defaultProportions.slice(0, columnCount)
  const totalProp = proportions.reduce((s, p) => s + p, 0) || 1
  const columnWidthsPx = proportions.map((p) => (p / totalProp) * contentWidth)

  // Map computed widths into columnStyles
  const computedColumnStyles: Record<number, any> = columnWidthsPx.reduce((acc, w, i) => {
    acc[i] = { ...(tableConfig.columnStyles?.[i] || {}), cellWidth: w }
    return acc
  }, {} as Record<number, any>)

  // Define table styles
  const tableOptions: UserOptions = {
    startY: startY || margins.top + 60,
    margin: { left: margins.left, right: margins.right, top: 10, bottom: 20 },
    head: [tableConfig.head],
    body: tableConfig.body,
    columnStyles: {
      ...(tableConfig.columnStyles || {}),
      ...computedColumnStyles,
    },
    styles: {
      fontSize: 10,
      cellPadding: 6,
      textColor: colors.text,
      lineColor: colors.border,
      lineWidth: 0.5,
      overflow: 'linebreak',
      cellWidth: 'wrap',
      halign: 'left',
      valign: 'middle',
    },
    headStyles: {
      fillColor: colors.primary,
      textColor: colors.headerText,
      fontStyle: 'bold',
      fontSize: 11,
      cellPadding: 10,
      halign: 'center',
      valign: 'middle',
    },
    alternateRowStyles: tableConfig.alternateRows
      ? {
          fillColor: [245, 247, 255],
        }
      : {},
    didDrawPage: () => {
      // Add page number at bottom
      const pageSize = doc.internal.pageSize
      const pageHeightVal = pageSize.getHeight()
      const pageWidthVal = pageSize.getWidth()
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(colors.secondary[0], colors.secondary[1], colors.secondary[2])
      // Safe page count retrieval to support different jsPDF versions
      const getPageCount = (d: jsPDF) => {
        const anyDoc = d as any
        try {
          if (typeof anyDoc.internal?.getNumberOfPages === 'function') return anyDoc.internal.getNumberOfPages()
        } catch (_) {}
        try {
          if (typeof anyDoc.internal?.getPages === 'function') return anyDoc.internal.getPages().length
        } catch (_) {}
        try {
          if (anyDoc.internal?.pages && typeof anyDoc.internal.pages === 'object') return Object.keys(anyDoc.internal.pages).length
        } catch (_) {}
        // Fallback: if jsPDF exposes getNumberOfPages at top level
        try {
          if (typeof (anyDoc as any).getNumberOfPages === 'function') return (anyDoc as any).getNumberOfPages()
        } catch (_) {}
        return 1
      }

      const pageNum = getPageCount(doc)
      doc.text(
        `Page ${pageNum}`,
        pageWidthVal / 2,
        pageHeightVal - 15,
        { align: 'center' }
      )
    },
    didParseCell: (cellData) => {
      // Add subtle borders between cells and color specific columns
      if (cellData.section === 'body') {
        cellData.cell.styles.lineWidth = 0.5
        cellData.cell.styles.lineColor = colors.border

        const colIndex = cellData.column.index
        const cellText = Array.isArray(cellData.cell.text) ? cellData.cell.text.join('') : String(cellData.cell.text)

        // Amount column styling (index 5 by convention) - color positive green, negative red
        if (colIndex === 5) {
          if (cellText.trim().startsWith('+')) {
            cellData.cell.styles.textColor = colors.accentGreen
          } else if (cellText.trim().startsWith('-')) {
            cellData.cell.styles.textColor = colors.accentRed
          } else {
            cellData.cell.styles.textColor = colors.text
          }
          cellData.cell.styles.halign = 'right'
        }

        // Accounts column (index 2) - highlight transfers (contains arrow) with primary color
        if (colIndex === 2 && cellText.includes('→')) {
          cellData.cell.styles.textColor = colors.primary
        }
      }
    },
  }

  // Add title to table if provided
  if (tableConfig.title) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(colors.text[0], colors.text[1], colors.text[2])
    doc.text(tableConfig.title, margins.left, (tableOptions.startY as number) - 15)
    ;(tableOptions.startY as number) -= 10
  }

  // Generate the table
  autoTable(doc, tableOptions)

  // Return the Y position after the table for next content
  const docAny = doc as any
  return (docAny.lastAutoTable?.finalY ?? (tableOptions.startY as number)) + 10
}

/**
 * Add a summary section with key-value pairs
 */
export function addSummarySection(
  doc: jsPDF,
  title: string,
  items: Array<[label: string, value: string]>,
  startY: number
): number {
  const margins = (doc as any)._margins || { left: 40, right: 40 }
  const colors = (doc as any)._colors || DEFAULT_COLORS

  // Add section title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(colors.text[0], colors.text[1], colors.text[2])
  doc.text(title, margins.left, startY)

  // Add summary items in a simple table-like format
  const summaryBody = items.map((item) => [item[0], item[1]])

  autoTable(doc, {
    startY: startY + 10,
    margin: { left: margins.left, right: margins.right },
    head: [],
    body: summaryBody,
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 'auto', halign: 'left' },
      1: { halign: 'right', fontStyle: 'bold' },
    },
    styles: {
      fontSize: 10,
      cellPadding: 6,
      textColor: colors.text,
      lineWidth: 0,
      overflow: 'linebreak',
    },
    alternateRowStyles: {
      fillColor: [250, 251, 252],
    },
  })

  const docAny = doc as any
  return (docAny.lastAutoTable?.finalY ?? startY) + 15
}

/**
 * Add a new page to the PDF with header
 */
export function addNewPage(doc: jsPDF, title?: string): number {
  const margins = (doc as any)._margins || { left: 40, right: 40, top: 50 }
  const colors = (doc as any)._colors || DEFAULT_COLORS

  doc.addPage()

  if (title) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.setTextColor(colors.text[0], colors.text[1], colors.text[2])
    doc.text(title, margins.left, margins.top)
    return margins.top + 25
  }

  return margins.top
}

/**
 * Check if content will fit on current page, add new page if needed
 */
export function ensurePageSpace(doc: jsPDF, currentY: number, spaceNeeded: number = 100): number {
  const pageHeight = doc.internal.pageSize.getHeight()
  const bottomMargin = 40

  if (currentY + spaceNeeded > pageHeight - bottomMargin) {
    return addNewPage(doc)
  }

  return currentY
}

/**
 * Format currency for PDF export
 */
export function formatCurrencyForPDF(value: number | string, currency: string = 'NPR'): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

/**
 * Format date for PDF export
 */
export function formatDateForPDF(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Save PDF with professional filename
 */
export function savePDF(doc: jsPDF, filename: string): void {
  const sanitized = filename
    .replace(/[^a-z0-9]/gi, '_')
    .replace(/_+/g, '_')
    .toLowerCase()
  doc.save(`${sanitized}_${new Date().getTime()}.pdf`)
}
