"use client"

import { useMemo } from "react"
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
import type { ChartSpec } from "@/lib/visualization"
import { enrichChartSpec } from "@/lib/visualization"
import { cn } from "@/lib/utils"

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
          <Tooltip />
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

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ChartComponent data={hydrated.data} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
        <XAxis dataKey={xKey} tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis allowDecimals tickLine={false} axisLine={false} tickMargin={8} />
        <Tooltip />
        <Legend />
        {yKeys.map((series, idx) => (
          <SeriesComponent
            key={`${series.key}-${idx}`}
            dataKey={series.key}
            name={series.label || series.key}
            stroke={series.color || COLORS[idx % COLORS.length]}
            fill={series.color || COLORS[idx % COLORS.length]}
            strokeWidth={2}
            {...(isLine || isArea ? { type: "monotone" } : {})}
            {...(isLine ? { activeDot: { r: 5 } } : {})}
            {...(isBar ? { barSize: 16 } : {})}
            {...(isArea ? { stackId: "stack" } : {})}
          />
        ))}
      </ChartComponent>
    </ResponsiveContainer>
  )
}

type ChartVisualizationsProps = {
  charts: ChartSpec[]
  className?: string
}

export function ChartVisualizations({ charts, className }: ChartVisualizationsProps) {
  if (!charts.length) return null

  return (
    <div className={cn("space-y-4", className)}>
      {charts.map((chart, idx) => (
        <div key={chart.id || idx} className="rounded-lg border border-border/70 bg-muted/30 p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-foreground">{chart.title || "Visualization"}</div>
              {chart.description && <p className="text-xs text-muted-foreground">{chart.description}</p>}
            </div>
            <div className="rounded-md bg-background px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              {chart.type} chart
            </div>
          </div>
          <div className="h-72 w-full">
            <ChartRenderer chart={chart} />
          </div>
        </div>
      ))}
    </div>
  )
}
