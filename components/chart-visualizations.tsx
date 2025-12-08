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

  if (hydrated.type === "pie") {
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
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    )
  }

  const xKey = hydrated.xKey || "label"
  const yKeys = hydrated.yKeys && hydrated.yKeys.length > 0 ? hydrated.yKeys : [{ key: "value", label: "value" }]

  const ChartComponent = hydrated.type === "area" ? AreaChart : hydrated.type === "line" ? LineChart : BarChart
  const SeriesComponent = hydrated.type === "area" ? Area : hydrated.type === "line" ? Line : Bar
  const isLine = hydrated.type === "line"
  const isArea = hydrated.type === "area"
  const isBar = hydrated.type === "bar"

  const categoriesCount = hydrated.data.length
  const computedWidth = Math.max(categoriesCount * 80, 600)

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

  return (
    <div data-chart-root className="flex h-full w-full">
      <div className="relative z-10 h-full flex-none">
        <ResponsiveContainer width={70} height="100%">
          <ChartComponent data={hydrated.data} margin={{ top: 10, right: 0, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} vertical={false} />
            <XAxis
              dataKey={xKey}
              width={0}
              height={0}
              tickLine={false}
              axisLine={false}
              tick={false}
              padding={{ left: 0, right: 0 }}
            />
            <YAxis allowDecimals tickLine={false} axisLine={false} tickMargin={8} />
            {renderSeries(true)}
          </ChartComponent>
        </ResponsiveContainer>
      </div>

      <div className="flex-1 overflow-x-auto">
        <div data-chart-canvas style={{ width: computedWidth, minWidth: "100%", height: "100%" }}>
          <ResponsiveContainer width="100%" height="100%">
            <ChartComponent data={hydrated.data} margin={{ top: 10, right: 20, bottom: 32, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
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
              <YAxis allowDecimals tickLine={false} axisLine={false} tickMargin={8} width={0} tick={false} />
              <Tooltip
                cursor={{ fill: "var(--muted)", opacity: .70, stroke: "var(--border)" }}
                content={<ChartTooltipContent />}
              />
              <Legend />
              {renderSeries()}
            </ChartComponent>
          </ResponsiveContainer>
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
            <div className="h-72 w-full">
              <ChartRenderer chart={chart} />
            </div>
            {exportError?.id === chartDomId && <p className="mt-2 text-xs text-destructive">{exportError.message}</p>}
          </div>
        )
      })}
    </div>
  )
}