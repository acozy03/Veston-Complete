import { NextResponse } from "next/server"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const src = searchParams.get("src")
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
    // Force inline so browsers attempt preview when possible
    headers.set("content-disposition", `inline`)
    headers.set("cache-control", "private, max-age=60")
    return new NextResponse(upstream.body as any, {
      status: 200,
      headers,
    })
  } catch (e) {
    return NextResponse.json({ error: "Proxy error" }, { status: 500 })
  }
}

