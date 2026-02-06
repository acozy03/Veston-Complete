import { NextResponse } from "next/server"
import { createAdminSupabase } from "@/lib/supabase/admin"
const HASH_PID_API_KEY = process.env.HASH_PID_API_KEY
const PATIENT_ID_MAP_TABLE = "patient_id_maps"
const PATIENT_ID_MAP_TTL_MS = 5 * 60 * 1000

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

const readExecutionId = (request: Request) =>
  request.headers.get("execution-id") || request.headers.get("x-execution-id")

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

    const executionId = readExecutionId(request)
    if (!executionId) {
      return NextResponse.json({ error: "Missing execution-id header" }, { status: 400 })
    }

    const patientIdMap: Record<string, string> = {}
    for (const entry of payload) {
      for (const [key, value] of Object.entries(entry)) {
        if (typeof value === "string" && value.trim().length > 0) {
          patientIdMap[key] = value.trim()
        }
      }
    }

    const adminSupabase = createAdminSupabase()
    const { error: upsertErr } = await adminSupabase
      .from(PATIENT_ID_MAP_TABLE)
      .upsert(
        {
          execution_id: executionId,
          patient_id_map: patientIdMap,
        },
        { onConflict: "execution_id" },
      )
    if (upsertErr) {
      console.error("[hash-pid] failed to store patientId map", upsertErr)
      return NextResponse.json({ error: "Failed to store patientId map" }, { status: 500 })
    }

    const cutoff = new Date(Date.now() - PATIENT_ID_MAP_TTL_MS).toISOString()
    const cleanupResult = await adminSupabase.from(PATIENT_ID_MAP_TABLE).delete().lt("created_at", cutoff)
    if (cleanupResult.error) {
      console.warn("[hash-pid] cleanup failed", cleanupResult.error)
    } else {
      console.log("[hash-pid] cleanup complete", { cutoff })
    }

    console.log("[hash-pid] stored patientId map", {
      executionId,
      entries: Object.keys(patientIdMap).length,
    })

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
