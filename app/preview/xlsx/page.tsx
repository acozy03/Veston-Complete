"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import dynamic from "next/dynamic"
// xlsx-preview has no types; import dynamically to avoid SSR issues
const useXlsxPreview = () => {
  const mod = useMemo(() => import("xlsx-preview"), [])
  return mod
}

export default function XlsxPreviewPage() {
  const searchParams = useSearchParams()
  const src = searchParams.get("src") || ""
  const [html, setHtml] = useState<string>("")
  const [error, setError] = useState<string>("")

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!src) return
      try {
        const proxyUrl = `/api/proxy-file?src=${encodeURIComponent(src)}`
        const resp = await fetch(proxyUrl)
        if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`)
        const buf = await resp.arrayBuffer()
        const lib = await import("xlsx-preview")
        const out = await (lib as any).default.xlsx2Html(buf, { separateSheets: false })
        if (!cancelled) setHtml(typeof out === "string" ? out : "")
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to preview file")
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [src])

  return (
    <div style={{ height: "100vh", overflow: "auto", background: "#0b1220", color: "#e2e8f0", padding: 16 }}>
      {!src && <p>No file provided.</p>}
      {error && (
        <div>
          <p style={{ color: "#ef4444" }}>Preview failed: {error}</p>
          <p>
            <a href={src} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>
              Open original link
            </a>
          </p>
        </div>
      )}
      {!error && !html && <p>Loading preview…</p>}
      {!error && html && (
        <div
          className="xlsx-preview"
          dangerouslySetInnerHTML={{ __html: html }}
          style={{ background: "#ffffff", color: "#000000", padding: 12, borderRadius: 8 }}
        />
      )}
    </div>
  )
}

