const SVG_NS = "http://www.w3.org/2000/svg"

type ExportFormat = "png" | "svg"

type ChartExportOptions = {
  chartRoot: HTMLElement
  chartId: string
  /**
   * Optional container to use as a fallback when searching for elements
   * like the chart canvas area.
   */
  componentRoot?: HTMLElement
  title?: string
  description?: string
  format?: ExportFormat
}

const createSvgElement = <K extends keyof SVGElementTagNameMap>(tag: K) =>
  document.createElementNS(SVG_NS, tag)

export async function exportChartImage({
  chartRoot,
  chartId,
  componentRoot,
  title,
  description,
  format = "png",
}: ChartExportOptions) {
  const svgs = Array.from(chartRoot.querySelectorAll("svg")) as SVGSVGElement[]
  if (!svgs.length) {
    throw new Error(
      `No <svg> elements found in ${chartId || "the chart"}. Make sure the chart has finished rendering before exporting.`,
    )
  }

  const chartBounds = chartRoot.getBoundingClientRect()
  const svgRects = svgs.map((svg) => svg.getBoundingClientRect())
  const canvasArea =
    chartRoot.querySelector<HTMLElement>("[data-chart-canvas]") ??
    componentRoot?.querySelector<HTMLElement>("[data-chart-canvas]") ??
    null
  const canvasWidth = canvasArea ? Math.max(canvasArea.scrollWidth, canvasArea.clientWidth) : 0
  const canvasHeight = canvasArea ? Math.max(canvasArea.scrollHeight, canvasArea.clientHeight) : 0

  const maxX = Math.max(
    ...svgRects.map((rect) => rect.left - chartBounds.left + rect.width),
    canvasWidth,
    chartRoot.scrollWidth || chartRoot.clientWidth,
  )
  const maxY = Math.max(
    ...svgRects.map((rect) => rect.top - chartBounds.top + rect.height),
    canvasHeight,
    chartRoot.scrollHeight || chartRoot.clientHeight,
  )

  const paddingX = 32
  const paddingY = 20

  const fontFamily = getComputedStyle(document.body).fontFamily || "Inter, system-ui, sans-serif"
  const styles = getComputedStyle(document.documentElement)
  const background = styles.getPropertyValue("--background").trim() || "#ffffff"
  const foreground = styles.getPropertyValue("--foreground").trim() || "#0f172a"
  const muted = styles.getPropertyValue("--muted-foreground").trim() || foreground

  const titleHeight = title ? 22 : 0
  const descriptionHeight = description ? 16 : 0
  const headerSpacing = title && description ? 6 : 0
  const headerPadding = title || description ? 10 : 0
  const headerHeight = headerPadding * 2 + titleHeight + descriptionHeight + headerSpacing

  const contentWidth = Math.round(maxX)
  const contentHeight = Math.round(maxY)
  const totalWidth = contentWidth + paddingX * 2
  const totalHeight = headerHeight + contentHeight + paddingY

  const composedSvg = createSvgElement("svg")
  composedSvg.setAttribute("xmlns", SVG_NS)
  composedSvg.setAttribute("width", `${totalWidth}`)
  composedSvg.setAttribute("height", `${totalHeight}`)
  composedSvg.setAttribute("viewBox", `0 0 ${totalWidth} ${totalHeight}`)

  const backgroundRect = createSvgElement("rect")
  backgroundRect.setAttribute("width", "100%")
  backgroundRect.setAttribute("height", "100%")
  backgroundRect.setAttribute("fill", background)
  composedSvg.appendChild(backgroundRect)

  let cursorY = paddingY
  if (title || description) {
    cursorY = headerPadding + (title ? titleHeight : 0)
    if (title) {
      const titleText = createSvgElement("text")
      titleText.setAttribute("x", `${paddingX}`)
      titleText.setAttribute("y", `${headerPadding + titleHeight}`)
      titleText.setAttribute("fill", foreground)
      titleText.setAttribute("font-family", fontFamily)
      titleText.setAttribute("font-size", "18")
      titleText.setAttribute("font-weight", "700")
      titleText.textContent = title
      composedSvg.appendChild(titleText)
    }
    if (description) {
      const descText = createSvgElement("text")
      const descY = headerPadding + titleHeight + headerSpacing + descriptionHeight
      descText.setAttribute("x", `${paddingX}`)
      descText.setAttribute("y", `${descY}`)
      descText.setAttribute("fill", muted)
      descText.setAttribute("font-family", fontFamily)
      descText.setAttribute("font-size", "13")
      descText.setAttribute("font-weight", "500")
      descText.textContent = description
      composedSvg.appendChild(descText)
      cursorY = descY
    }
    cursorY += headerPadding
  }

  const serializer = new XMLSerializer()

  svgs.forEach((svg, idx) => {
    const rect = svgRects[idx]
    const clonedSvg = svg.cloneNode(true) as SVGSVGElement
    const xOffset = paddingX + rect.left - chartBounds.left
    const yOffset = cursorY + rect.top - chartBounds.top

    clonedSvg.setAttribute("x", `${xOffset}`)
    clonedSvg.setAttribute("y", `${yOffset}`)
    const width = rect.width || svg.viewBox.baseVal?.width || svg.clientWidth || 0
    const height = rect.height || svg.viewBox.baseVal?.height || svg.clientHeight || 0

    clonedSvg.setAttribute("width", `${width}`)
    clonedSvg.setAttribute("height", `${height}`)

    const viewBox =
      clonedSvg.getAttribute("viewBox") ||
      (svg.viewBox.baseVal?.width && svg.viewBox.baseVal?.height
        ? `0 0 ${svg.viewBox.baseVal.width} ${svg.viewBox.baseVal.height}`
        : `0 0 ${width} ${height}`)
    clonedSvg.setAttribute("viewBox", viewBox)

    composedSvg.appendChild(clonedSvg)
  })

  const svgString = serializer.serializeToString(composedSvg)
  const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" })

  if (format === "svg") {
    const link = document.createElement("a")
    const svgUrl = URL.createObjectURL(svgBlob)
    link.href = svgUrl
    link.download = `${chartId || "chart"}.svg`
    link.click()
    URL.revokeObjectURL(svgUrl)
    return
  }

  const svgUrl = URL.createObjectURL(svgBlob)
  try {
    const exportImage = new window.Image()
    await new Promise<void>((resolve, reject) => {
      exportImage.onload = () => resolve()
      exportImage.onerror = (err) => reject(err)
      exportImage.src = svgUrl
    })

    const canvas = document.createElement("canvas")
    canvas.width = totalWidth
    canvas.height = totalHeight
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Canvas not supported")

    ctx.drawImage(exportImage, 0, 0, totalWidth, totalHeight)

    const pngUrl = canvas.toDataURL("image/png")
    const link = document.createElement("a")
    link.href = pngUrl
    link.download = `${chartId || "chart"}.png`
    link.click()
  } finally {
    URL.revokeObjectURL(svgUrl)
  }
}
