import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface ChartVisualizationLoaderProps {
  className?: string
}

export function ChartVisualizationLoader({ className }: ChartVisualizationLoaderProps) {
  return (
    <div
      className={cn(
        "rounded-md border border-border/60 bg-background/80 p-3 text-sm text-muted-foreground",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted/60">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">Generating chart visualization</span>
        </div>
        <div className="leading-tight">
          <div className="font-medium text-foreground/80">Generating visualization…</div>
          <div className="text-xs text-muted-foreground">We’ll render your chart in a moment.</div>
        </div>
      </div>
    </div>
  )
}
