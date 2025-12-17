"use client"

import { useMemo, useRef, useState } from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Cell,
  Sankey,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { TooltipProps } from "recharts"
import type { ChartSpec } from "@/lib/visualization"
import { enrichChartSpec } from "@/lib/visualization"
import { cn } from "@/lib/utils"
import { exportChartImage } from "@/lib/export-chart"
import { ImageDown, Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const COLORS = [
  "#7C3AED",
  "#2563EB",
  "#16A34A",
  "#EA580C",
  "#0891B2",
  "#F59E0B",
  "#EC4899",
  "#6366F1",
]

type ChartRendererProps = {
  chart: ChartSpec
}

const truncateLabel = (label: string | number, maxLength = 12) => {
  if (typeof label !== "string") return label
  return label.length > maxLength ? `${label.slice(0, maxLength - 1)}…` : label
}

const wrapText = (text: string | undefined, maxChars = 16, maxLines = 2) => {
  if (!text) return [] as string[]

  const words = text.split(/\s+/)
  const lines: string[] = []
  let currentLine = ""

  words.forEach((word) => {
    const tentative = currentLine ? `${currentLine} ${word}` : word
    if (tentative.length <= maxChars) {
      currentLine = tentative
    } else {
      if (currentLine) lines.push(currentLine)
      currentLine = word
    }
  })

  if (currentLine) lines.push(currentLine)

  if (lines.length > maxLines) {
    const condensed = lines.slice(0, maxLines)
    const last = condensed[maxLines - 1]
    condensed[maxLines - 1] = truncateLabel(last, maxChars)
    return condensed
  }

  return lines
}

const ChartTooltipContent = ({ active, payload, label }: TooltipProps<number, string>) => {
  if (!active || !payload?.length) return null

  const safeLabel = typeof label === "string" || typeof label === "number" ? label : undefined

  return (
    <div className="border-border/60 bg-background text-foreground/90 min-w-[8rem] rounded-lg border px-3 py-2 text-xs shadow-lg ">
      {safeLabel !== undefined && <div className="mb-1 text-[11px] font-medium text-foreground">{safeLabel}</div>}
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={entry.dataKey} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-sm"
                style={{ backgroundColor: (entry.payload as any)?.fill || entry.color || "var(--chart-1)" }}
                aria-hidden
              />
              <span className="text-muted-foreground">{entry.name || entry.dataKey}</span>
            </div>
            <span className="font-mono text-foreground">
              {typeof entry.value === "number" ? entry.value.toLocaleString() : entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

const ChartRenderer = ({ chart }: ChartRendererProps) => {
  const hydrated = useMemo(() => enrichChartSpec(chart), [chart])
  const isPie = hydrated.type === "pie"
  const isSankey = hydrated.type === "sankey"
  const categoriesCount = hydrated.data.length
  const sankeyNodeCount = hydrated.nodes?.length || 0
  const sankeyContainerRef = useRef<HTMLDivElement | null>(null)
  const [selectedSankeyNode, setSelectedSankeyNode] = useState<any | null>(null)
  const [sankeyTooltip, setSankeyTooltip] = useState<
    | {
        type: "node" | "link"
        data: any
        x: number
        y: number
      }
    | null
  >(null)
  const computedWidth = Math.max(
    categoriesCount * 80,
    isPie ? 420 : isSankey ? Math.max(sankeyNodeCount * 180, 760) : 600,
  )

  const renderPieChart = () => {
    const categoryKey = hydrated.categoryKey || "label"
    const valueKey = hydrated.valueKey || "value"

    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={hydrated.data}
            dataKey={valueKey}
            nameKey={categoryKey}
            cx="50%"
            cy="50%"
            outerRadius={90}
            label
          >
            {hydrated.data.map((_, index) => (
              <Cell key={`${categoryKey}-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltipContent />} />
        
        </PieChart>
      </ResponsiveContainer>
    )
  }

  const renderSankeyChart = () => {
    const nodes = hydrated.nodes || []
    const links = hydrated.links || []
    const nodeIds = new Set(nodes.map((n) => n.id))
    const missingSources = links.map((l) => l.source).filter((id) => id && !nodeIds.has(id))
    const missingTargets = links.map((l) => l.target).filter((id) => id && !nodeIds.has(id))
    const idToIndex = new Map(nodes.map((n, idx) => [n.id, idx]))
    const updateSankeyTooltip = (type: "node" | "link", data: any, event?: any) => {
      const container = sankeyContainerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const x = event?.clientX ? event.clientX - rect.left : rect.width / 2
      const y = event?.clientY ? event.clientY - rect.top : rect.height / 2
      setSankeyTooltip({ type, data, x, y })
    }

    const hideSankeyTooltip = (event?: any, events?: any) => {
      events?.onMouseLeave?.(event)
      setSankeyTooltip(null)
    }
    const resolvedLinks = links
      .map((link) => {
        const sourceIdx = idToIndex.get(link.source)
        const targetIdx = idToIndex.get(link.target)
        if (sourceIdx === undefined || targetIdx === undefined) return null
        return { ...link, source: sourceIdx, target: targetIdx }
      })
      .filter(Boolean) as Array<{ source: number; target: number; value: number; color?: string }>

    if (!nodes.length || !resolvedLinks.length || missingSources.length || missingTargets.length) {
      const missing = [...new Set([...missingSources, ...missingTargets])]
      return (
        <div className="flex h-full items-center justify-center rounded-md border border-dashed border-border/60 bg-muted/40 text-xs text-muted-foreground">
          Unable to render sankey chart: missing valid nodes/links{missing.length ? ` (missing ids: ${missing.join(", ")})` : ""}.
        </div>
      )
    }

    const nodeLabelLimit = 18
    const labelPadding = 6
    const SankeyNode = (props: any) => {
      const { x, y, width, height, index, payload, ...events } = props
      const chartWidth = computedWidth || 0
      const approxLabelWidth = Math.min(payload.name?.length || 0, nodeLabelLimit) * 6
      const totalRightSpace = x + width + approxLabelWidth + 12
      const showLeft = chartWidth ? totalRightSpace > chartWidth : false
      const labelX = showLeft ? Math.max(labelPadding, x - labelPadding) : x + width + labelPadding
      const anchor = showLeft ? "end" : "start"
      const color = payload.color || COLORS[index % COLORS.length]
      const labelLines = wrapText(payload.name, nodeLabelLimit, 2)
      const descriptionLines = wrapText(payload.description, nodeLabelLimit + 6, 2)
      const totalLines = labelLines.length + descriptionLines.length
      const lineHeight = 12
      const startY = y + height / 2 - ((totalLines - 1) * lineHeight) / 2
      return (
        <g
          {...events}
          onClick={() => setSelectedSankeyNode(payload)}
          onMouseEnter={(e) => {
            events?.onMouseEnter?.(e)
            updateSankeyTooltip("node", payload, e)
          }}
          onMouseMove={(e) => {
            updateSankeyTooltip("node", payload, e)
          }}
          onMouseLeave={(e) => hideSankeyTooltip(e, events)}
        >
          <rect x={x} y={y} width={width} height={height} fill={color} stroke="#f8fafc" strokeWidth={1.25} />
          {payload.name && (
            <text x={labelX} y={startY} textAnchor={anchor} className="fill-foreground" style={{ fontSize: 11 }}>
              {labelLines.map((line: string, idx: number) => (
                <tspan key={`${payload.id}-label-${idx}`} x={labelX} dy={idx === 0 ? 0 : lineHeight} className="font-medium">
                  {line}
                </tspan>
              ))}
              {descriptionLines.map((line: string, idx: number) => (
                <tspan
                  key={`${payload.id}-desc-${idx}`}
                  x={labelX}
                  dy={lineHeight}
                  className="fill-muted-foreground"
                  style={{ fontSize: 10 }}
                >
                  {line}
                </tspan>
              ))}
            </text>
          )}
        </g>
      )
    }

    const SankeyLink = (props: any) => {
      const { sourceX, sourceY, sourceControlX, targetX, targetY, targetControlX, linkWidth, payload, ...events } = props
      const stroke = payload?.color || "#333"
      return (
        <path
          className="recharts-sankey-link"
          d={`
          M${sourceX},${sourceY}
          C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}
        `}
          fill="none"
          stroke={stroke}
          strokeWidth={linkWidth}
          strokeOpacity="0.25"
          {...events}
          onMouseEnter={(e) => {
            events?.onMouseEnter?.(e)
            updateSankeyTooltip("link", payload, e)
          }}
          onMouseMove={(e) => {
            updateSankeyTooltip("link", payload, e)
          }}
          onMouseLeave={(e) => hideSankeyTooltip(e, events)}
        />
      )
    }

    const renderSankeyTooltip = () => {
      if (!sankeyTooltip) return null
      const { data, type, x, y } = sankeyTooltip
      const isNode = type === "node"

      const resolveNode = (nodeRef: any) => {
        if (nodeRef?.id || nodeRef?.name) return nodeRef
        if (typeof nodeRef === "number") return nodes[nodeRef]
        if (typeof nodeRef === "string") return nodes[idToIndex.get(nodeRef) ?? -1]
        return undefined
      }

      const resolveNodeLabel = (nodeRef: any) => resolveNode(nodeRef)?.name || resolveNode(nodeRef)?.id || nodeRef

      const linkTitle = [resolveNodeLabel(data?.source), resolveNodeLabel(data?.target)]
        .filter(Boolean)
        .join(" → ")

      const title = isNode ? data.name || resolveNodeLabel(data.id) : linkTitle || data.name
      const linkDescriptions = !isNode
        ? [
            resolveNode(data?.source)?.description && {
              label: resolveNodeLabel(data?.source),
              description: resolveNode(data?.source)?.description,
            },
            resolveNode(data?.target)?.description && {
              label: resolveNodeLabel(data?.target),
              description: resolveNode(data?.target)?.description,
            },
          ].filter(Boolean)
        : []

      return (
        <div
          className="pointer-events-none absolute z-10 min-w-[12rem] rounded-lg border border-border/60 bg-background px-3 py-2 text-xs text-foreground/90 shadow-lg"
          style={{ left: x + 12, top: y + 12 }}
        >
          {title && <div className="mb-1 text-[11px] font-semibold text-foreground">{title}</div>}
          {isNode ? (
            data.description && <div className="text-[11px] text-muted-foreground">{data.description}</div>
          ) : (
            <div className="space-y-1">
              {linkDescriptions.map((item) => (
                <div key={item?.label} className="text-[11px]">
                  <div className="font-medium text-foreground">{item?.label}</div>
                  <div className="text-muted-foreground">{item?.description}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )
    }

    return (
      <div className="relative h-full w-full" ref={sankeyContainerRef}>
        <ResponsiveContainer width="100%" height="100%">
          <Sankey
            width={computedWidth}
            height={320}
            data={{ nodes, links: resolvedLinks }}
            nodePadding={50}
            nodeWidth={30}
            linkCurvature={0.5}
            node={SankeyNode}
            link={SankeyLink}
            nodeId="id"
          />
        </ResponsiveContainer>
        {renderSankeyTooltip()}
        <Dialog open={!!selectedSankeyNode} onOpenChange={(open) => !open && setSelectedSankeyNode(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{selectedSankeyNode?.name || selectedSankeyNode?.id || "Node details"}</DialogTitle>
              <DialogDescription>
                {selectedSankeyNode?.description || "No description available for this node."}
              </DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  const xKey = hydrated.xKey || "label"
  const yKeys = hydrated.yKeys && hydrated.yKeys.length > 0 ? hydrated.yKeys : [{ key: "value", label: "value" }]

  const ChartComponent = hydrated.type === "area" ? AreaChart : hydrated.type === "line" ? LineChart : BarChart
  const SeriesComponent = hydrated.type === "area" ? Area : hydrated.type === "line" ? Line : Bar
  const isLine = hydrated.type === "line"
  const isArea = hydrated.type === "area"
  const isBar = hydrated.type === "bar"

  const renderSeries = (isGhost = false) =>
    yKeys.map((series, idx) => (
      <SeriesComponent
        key={`${series.key}-${idx}`}
        dataKey={series.key}
        name={series.label || series.key}
        stroke={isGhost ? "transparent" : series.color || COLORS[idx % COLORS.length]}
        fill={isGhost ? "transparent" : series.color || COLORS[idx % COLORS.length]}
        strokeWidth={2}
        {...(isLine || isArea ? { type: "monotone" } : {})}
        {...(isLine ? { activeDot: { r: 5 } } : {})}
        {...(isBar ? { barSize: 16 } : {})}
        {...(isArea ? { stackId: "stack" } : {})}
      />
    ))

  const renderCartesianChart = () => (
    <ResponsiveContainer width="100%" height="100%">
      <ChartComponent data={hydrated.data} margin={{ top: 10, right: 20, bottom: 32, left: 12 }}>
        <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} vertical={false} />
        <XAxis
          dataKey={xKey}
          tickLine={false}
          axisLine={false}
          tickMargin={12}
          interval={0}
          angle={65}
          textAnchor="start"
          tickFormatter={(value) => truncateLabel(value)}
        />
        <YAxis
          allowDecimals
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          width={48}
          domain={[(dataMin: number) => Math.min(0, dataMin), "auto"]}
        />
        <Tooltip
          cursor={{ fill: "var(--muted)", opacity: .70, stroke: "var(--border)" }}
          content={<ChartTooltipContent />}
        />
        <Legend verticalAlign="top" height={36} />
        {renderSeries()}
      </ChartComponent>
    </ResponsiveContainer>
  )

  return (
    <div data-chart-root className="flex h-full w-full">
      <div className="flex-1 overflow-x-auto">
        <div
          data-chart-canvas
          className="h-full px-2 py-2"
          style={{ width: computedWidth, minWidth: "100%", height: "100%", minHeight: 320 }}
        >
          {isSankey ? renderSankeyChart() : isPie ? renderPieChart() : renderCartesianChart()}
        </div>
      </div>
    </div>
  )
}

type ChartVisualizationsProps = {
  charts: ChartSpec[]
  className?: string
  contextId?: string
}

export function ChartVisualizations({ charts, className, contextId }: ChartVisualizationsProps) {
  if (!charts.length) return null

  const chartRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [exportingId, setExportingId] = useState<string | null>(null)
  const [exportError, setExportError] = useState<{ id: string; message: string } | null>(null)

  const handleExport = async (chart: ChartSpec, fallbackId: string) => {
    const chartId = chart.id || fallbackId
    const container = chartRefs.current[chartId]
    setExportError(null)
    if (!container) {
      setExportError({ id: chartId, message: "Chart is not ready to export yet." })
      return
    }

    const chartRoot = container.querySelector("[data-chart-root]") as HTMLElement | null
    if (!chartRoot) {
      setExportError({ id: chartId, message: "Chart content could not be found." })
      return
    }

    setExportingId(chartId)
    try {
      await exportChartImage({
        chartRoot,
        componentRoot: container,
        chartId: contextId ? `${contextId}-${chartId}` : chartId,
        title: chart.title,
        description: chart.description,
      })
    } catch (error) {
      console.error("Failed to export chart", error)
      setExportError({ id: chartId, message: "Export failed. Please try again." })
    } finally {
      setExportingId(null)
    }
  }

  return (
    <div className={cn("space-y-4", className)}>
      {charts.map((chart, idx) => {
        const chartDomId = chart.id || `chart-${idx + 1}`

        return (
          <div
            key={chartDomId}
            className="rounded-lg border border-border/70 bg-muted/30 p-4"
            ref={(el) => {
              chartRefs.current[chartDomId] = el
            }}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-foreground">{chart.title || "Visualization"}</div>
                {chart.description && <p className="text-xs text-muted-foreground">{chart.description}</p>}
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground shadow-sm transition hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => handleExport(chart, chartDomId)}
                  disabled={exportingId === chartDomId}
                >
                  {exportingId === chartDomId ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Exporting…
                    </>
                  ) : (
                    <>
                      <ImageDown className="h-3.5 w-3.5" /> Export chart
                    </>
                  )}
                </button>
              </div>
            </div>
            <div className="h-100 w-full">
              <ChartRenderer chart={chart} />
            </div>
            {exportError?.id === chartDomId && <p className="mt-2 text-xs text-destructive">{exportError.message}</p>}
          </div>
        )
      })}
    </div>
  )
}
