import { NextResponse } from "next/server"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const src = searchParams.get("src")
  const asDownload = searchParams.get("download") === "1"
  if (!src) {
    return NextResponse.json({ error: "Missing src" }, { status: 400 })
  }
  try {
    const upstream = await fetch(src)
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: "Upstream fetch failed", status: upstream.status }, { status: 502 })
    }
    const headers = new Headers(upstream.headers)
    const ct = headers.get("content-type") || "application/octet-stream"
    // Inline by default (preview), or force attachment when download=1
    if (asDownload) {
      // Try to infer a filename from URL
      let filename = "file"
      try {
        const u = new URL(src)
        const qpName = u.searchParams.get("filename")
        if (qpName) filename = qpName
        else {
          const last = u.pathname.split("/").pop() || "file"
          filename = decodeURIComponent(last)
        }
      } catch {}
      if (!/\.[A-Za-z0-9]+$/.test(filename)) {
        // best-effort extension from content-type
        if (ct.includes("spreadsheetml")) filename += ".xlsx"
      }
      headers.set("content-disposition", `attachment; filename="${filename}"`)
    } else {
      headers.set("content-disposition", `inline`)
    }
    headers.set("cache-control", "private, max-age=60")
    return new NextResponse(upstream.body as any, {
      status: 200,
      headers,
    })
  } catch (e) {
    return NextResponse.json({ error: "Proxy error" }, { status: 500 })
  }
}
