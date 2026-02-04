import { NextResponse } from "next/server"
const HASH_PID_API_KEY = process.env.HASH_PID_API_KEY

type PayloadEntry = Record<string, unknown>

const isRecord = (value: unknown): value is PayloadEntry =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

const readApiKey = (request: Request) => {
  const headerKey = request.headers.get("x-api-key")
  if (headerKey) return headerKey
  const auth = request.headers.get("authorization")
  if (!auth) return null
  const [scheme, token] = auth.split(" ")
  if (scheme?.toLowerCase() === "bearer" && token) return token
  return null
}

export async function POST(request: Request) {
  try {
    if (!HASH_PID_API_KEY) {
      return NextResponse.json({ error: "Missing HASH_PID_API_KEY" }, { status: 500 })
    }
    const apiKey = readApiKey(request)
    if (!apiKey || apiKey !== HASH_PID_API_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const payload = await request.json()
    if (!Array.isArray(payload) || !payload.every(isRecord)) {
      return NextResponse.json({ error: "Body must be an array of objects" }, { status: 400 })
    }

    const tokenizedPayload = payload.map((entry) => {
      const tokenizedEntry: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(entry)) {
        if (typeof value === "string" && value.length > 0) {
          tokenizedEntry[key] = key
        } else {
          tokenizedEntry[key] = value
        }
      }
      return tokenizedEntry
    })

    return NextResponse.json({ ok: true, tokenizedPayload })
  } catch (error) {
    console.error("[hash-pid] failed", error)
    return NextResponse.json({ error: "Failed to tokenize payload" }, { status: 500 })
  }
}
