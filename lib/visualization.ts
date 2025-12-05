export type ChartSeries = {
  key: string
  label?: string
  color?: string
}

export type ChartSpec = {
  id: string
  type: "line" | "bar" | "area" | "pie"
  title?: string
  description?: string
  data: Array<Record<string, string | number>>
  xKey?: string
  yKeys?: ChartSeries[]
  categoryKey?: string
  valueKey?: string
}

const palette = [
  "#7C3AED",
  "#2563EB",
  "#16A34A",
  "#EA580C",
  "#0891B2",
  "#F59E0B",
  "#EC4899",
  "#6366F1",
]

const isNumeric = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value)
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return false
    const num = Number(trimmed)
    return Number.isFinite(num)
  }
  return false
}

const normalizeRow = (row: unknown) => {
  if (!row || typeof row !== "object") return {}
  return Object.fromEntries(
    Object.entries(row as Record<string, unknown>).map(([key, value]) => {
      if (isNumeric(value)) {
        const num = Number(value)
        return [key, Number.isFinite(num) ? num : value]
      }
      return [key, value as string | number]
    }),
  ) as Record<string, string | number>
}

export const normalizeChartSpecs = (raw: unknown): ChartSpec[] => {
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") return null
      const obj = entry as Record<string, unknown>
      const data = Array.isArray(obj.data) ? obj.data.map(normalizeRow) : []
      if (data.length === 0) return null

      const type =
        obj.type === "line" || obj.type === "bar" || obj.type === "area" || obj.type === "pie"
          ? obj.type
          : "bar"

      const yKeys: ChartSeries[] | undefined = Array.isArray(obj.yKeys)
        ? (obj.yKeys as unknown[])
            .map((y, i) => {
              if (!y || typeof y !== "object") return null
              const item = y as Record<string, unknown>
              const key = typeof item.key === "string" ? item.key : undefined
              if (!key) return null
              return {
                key,
                label: typeof item.label === "string" ? item.label : undefined,
                color: typeof item.color === "string" ? item.color : palette[i % palette.length],
              }
            })
            .filter(Boolean) as ChartSeries[]
        : undefined

      const chart: ChartSpec = {
        id: typeof obj.id === "string" && obj.id ? obj.id : `chart-${index + 1}`,
        type,
        data,
        xKey: typeof obj.xKey === "string" && obj.xKey ? obj.xKey : undefined,
        yKeys,
        categoryKey: typeof obj.categoryKey === "string" && obj.categoryKey ? obj.categoryKey : undefined,
        valueKey: typeof obj.valueKey === "string" && obj.valueKey ? obj.valueKey : undefined,
        title: typeof obj.title === "string" ? obj.title : undefined,
        description: typeof obj.description === "string" ? obj.description : undefined,
      }

      return chart
    })
    .filter(Boolean) as ChartSpec[]
}

export const enrichChartSpec = (chart: ChartSpec): ChartSpec => {
  if (chart.type === "pie") {
    const firstRow = chart.data[0] || {}
    const entries = Object.entries(firstRow)
    const defaultCategory =
      chart.categoryKey || entries.find(([, v]) => !isNumeric(v))?.[0] || entries[0]?.[0]
    const defaultValue = chart.valueKey || entries.find(([, v]) => isNumeric(v))?.[0] || entries[1]?.[0] || entries[0]?.[0]
    return {
      ...chart,
      categoryKey: defaultCategory,
      valueKey: defaultValue,
    }
  }

  const firstRow = chart.data[0] || {}
  const defaultXKey = chart.xKey || Object.keys(firstRow).find((key) => !isNumeric(firstRow[key])) || Object.keys(firstRow)[0]
  const numericKeys = Object.keys(firstRow).filter((key) => isNumeric(firstRow[key]))

  const defaultYKeys = chart.yKeys && chart.yKeys.length
    ? chart.yKeys
    : (numericKeys.length > 0
        ? numericKeys
        : Object.keys(firstRow).filter(Boolean)
      ).map((key, idx) => ({ key, label: key, color: palette[idx % palette.length] }))

  return {
    ...chart,
    xKey: defaultXKey,
    yKeys: defaultYKeys,
  }
}

export const prepareChartSpecs = (raw: unknown): ChartSpec[] => {
  const normalized = normalizeChartSpecs(raw)
  return normalized.map((chart) => enrichChartSpec(chart)).filter((chart) => chart.data.length > 0)
}

export const stringifyForPrompt = (raw: unknown, limit = 3000) => {
  try {
    const text = typeof raw === "string" ? raw : JSON.stringify(raw)
    if (!text) return ""
    return text.length > limit ? `${text.slice(0, limit)}...` : text
  } catch {
    return ""
  }
}
