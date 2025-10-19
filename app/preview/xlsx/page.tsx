"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import * as XLSX from "xlsx"

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
        const wb = XLSX.read(buf, { type: "array" })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const html = XLSX.utils.sheet_to_html(ws, { header: "", footer: "" })
        if (!cancelled) setHtml(html)
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
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#0b1220",
        color: "#e2e8f0",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          background: "#0f172a",
        }}
      >
        <strong>Excel Preview</strong>
        {src && (
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              textDecoration: "underline",
              color: "#60a5fa",
              fontSize: "0.9rem",
            }}
          >
            Open Original
          </a>
        )}
      </header>

      <div
        style={{
          flex: 1,
          overflow: "auto",
          background: "#ffffff",
          color: "#111827",
          padding: 16,
        }}
      >
        {error && <p style={{ color: "red" }}>{error}</p>}
        {!error && !html && <p>Loading preview…</p>}
        {!error && html && (
          <div
            className="xlsx-html"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </div>

      <style jsx global>{`
        .xlsx-html table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
          line-height: 1.5;
        }

        .xlsx-html th,
        .xlsx-html td {
          border: 1px solid #e5e7eb;
          padding: 8px 12px;
          text-align: left;
          vertical-align: top;
        }

        /* Make header row stand out */
        .xlsx-html thead tr:first-child th {
          background-color: #f3f4f6;
          font-weight: 600;
          color: #111827;
          position: sticky;
          top: 0;
          z-index: 1;
        }

        /* Zebra striping for readability */
        .xlsx-html tbody tr:nth-child(even) {
          background-color: #f9fafb;
        }

        .xlsx-html tbody tr:hover {
          background-color: #f1f5f9;
        }

        /* Allow wrapping for long cells */
        .xlsx-html td {
          white-space: normal;
          word-break: break-word;
        }
      `}</style>
    </div>
  )
}
