export type ChartSeries = {
  key: string
  label?: string
  color?: string
}

export type SankeyNode = {
  id: string
  name: string
  description?: string
  color?: string
}

export type SankeyLink = {
  source: string
  target: string
  value: number
  color?: string
}

export type ChartSpec = {
  id: string
  type: "line" | "bar" | "area" | "pie" | "sankey"
  title?: string
  description?: string
  data: Array<Record<string, string | number>>
  xKey?: string
  yKeys?: ChartSeries[]
  categoryKey?: string
  valueKey?: string
  nodes?: SankeyNode[]
  links?: SankeyLink[]
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

const normalizeSankeyNode = (raw: unknown, idx: number): SankeyNode | null => {
  if (!raw || typeof raw !== "object") return null
  const obj = raw as Record<string, unknown>
  const name = typeof obj.name === "string" && obj.name.trim() ? obj.name.trim() : undefined
  const id = typeof obj.id === "string" && obj.id.trim() ? obj.id.trim() : name || `node-${idx + 1}`
  if (!id || !name) return null
  const description = typeof obj.description === "string" && obj.description.trim() ? obj.description.trim() : undefined
  const color = typeof obj.color === "string" && obj.color.trim() ? obj.color.trim() : palette[idx % palette.length]
  return { id, name, description, color }
}

const normalizeSankeyLink = (raw: unknown): SankeyLink | null => {
  if (!raw || typeof raw !== "object") return null
  const obj = raw as Record<string, unknown>
  const source = typeof obj.source === "string" && obj.source.trim() ? obj.source.trim() : undefined
  const target = typeof obj.target === "string" && obj.target.trim() ? obj.target.trim() : undefined
  const value = isNumeric(obj.value) ? Number(obj.value) : undefined
  if (!source || !target || typeof value !== "number" || !Number.isFinite(value)) return null
  const color = typeof obj.color === "string" && obj.color.trim() ? obj.color.trim() : undefined
  return { source, target, value, color }
}

export const normalizeChartSpecs = (raw: unknown): ChartSpec[] => {
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") return null
      const obj = entry as Record<string, unknown>
      const data = Array.isArray(obj.data) ? obj.data.map(normalizeRow) : []

      const type =
        obj.type === "line" ||
        obj.type === "bar" ||
        obj.type === "area" ||
        obj.type === "pie" ||
        obj.type === "sankey"
          ? obj.type
          : "bar"

      const nodes =
        type === "sankey" && Array.isArray(obj.nodes)
          ? (obj.nodes as unknown[]).map(normalizeSankeyNode).filter(Boolean) as SankeyNode[]
          : undefined

      const links =
        type === "sankey" && Array.isArray(obj.links)
          ? (obj.links as unknown[]).map(normalizeSankeyLink).filter(Boolean) as SankeyLink[]
          : undefined

      if (type !== "sankey" && data.length === 0) return null
      if (type === "sankey" && (!nodes?.length || !links?.length)) return null

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
        nodes,
        links,
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
  if (chart.type === "sankey") {
    const nodes = chart.nodes || []
    const links = chart.links || []
    const nodeById = new Map(nodes.map((n) => [n.id, n]))
    const validLinks = links.filter((link) => nodeById.has(link.source) && nodeById.has(link.target))
    const colorizedLinks = validLinks.map((link, idx) => ({
      ...link,
      color: link.color || nodeById.get(link.source)?.color || palette[idx % palette.length],
    }))
    return { ...chart, nodes, links: colorizedLinks }
  }

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
  return normalized
    .map((chart) => enrichChartSpec(chart))
    .filter((chart) => (chart.type === "sankey" ? chart.nodes?.length && chart.links?.length : chart.data.length > 0))
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
