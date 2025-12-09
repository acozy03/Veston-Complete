# Export chart manual repro

Use these steps to verify pie, bar, and line charts export correctly after the sizing normalization updates.

1. Open the chart playground page that renders multiple chart types. In this project, the `ChartVisualizations` component (used in data visualization views) provides pie, bar, and line examples.
2. For each chart, trigger the export action and confirm that PNG and SVG downloads include the full chart without clipped edges.
   - Pie: ensure the full circle is visible and respects its viewBox.
   - Bar: verify bars and axes remain aligned and labels are present.
   - Line: confirm the plotted line and grid render at the expected dimensions.
3. Repeat with a single-chart render (mount `ChartVisualizations` with one `ChartSpec`) to confirm the export still succeeds when only one `<svg>` exists and when `[data-chart-canvas]` is unavailable.
