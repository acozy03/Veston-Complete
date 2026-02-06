import { NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { createAdminSupabase } from "@/lib/supabase/admin"
import { isAllowedDomain } from "@/lib/auth-utils"

const N8N_CLASSIFIER_URL = process.env.N8N_CLASSIFIER_URL



const PLACEHOLDER_KEY_PATTERN = /^patientId_\d+$/
const PATIENT_ID_MAP_TABLE = "patient_id_maps"
const PATIENT_ID_MAP_TTL_MS = 5 * 60 * 1000

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const sanitizePatientIdMap = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    console.log("[patientIdMap] received invalid payload for map; defaulting to empty", {
      valueType: Array.isArray(value) ? "array" : typeof value,
    })
    return {}
  }

  const rawEntries = Object.entries(value)
  const out: Record<string, string> = {}
  for (const [key, raw] of rawEntries) {
    if (!PLACEHOLDER_KEY_PATTERN.test(key)) continue
    if (typeof raw !== "string") continue
    const trimmed = raw.trim()
    if (!trimmed) continue
    out[key] = trimmed
  }

  console.log("[patientIdMap] sanitize result", {
    incomingEntries: rawEntries.length,
    acceptedEntries: Object.keys(out).length,
    acceptedKeys: Object.keys(out),
    map: out,
  })
  return out
}

const replacePatientPlaceholdersInText = (text: string, patientIdMap: Record<string, string>): string => {
  if (!text) return text
  const entries = Object.entries(patientIdMap)
  if (entries.length === 0) return text

  let out = text
  for (const [placeholder, rawPatientId] of entries) {
    const pattern = new RegExp(`\\b${escapeRegExp(placeholder)}\\b`, "g")
    const hasMatch = pattern.test(out)
    pattern.lastIndex = 0

    if (!hasMatch) {
      console.log("[patientIdMap] replacement skipped (placeholder missing)", { placeholder })
      continue
    }

    const before = out
    out = out.replace(pattern, rawPatientId)
    console.log("[patientIdMap] replacement applied", {
      placeholder,
      rawPatientId,
      inputPreview: before.slice(0, 200),
      outputPreview: out.slice(0, 200),
    })
  }
  return out
}


const replacePatientPlaceholdersDeep = (value: unknown, patientIdMap: Record<string, string>): unknown => {
  if (typeof value === "string") {
    return replacePatientPlaceholdersInText(value, patientIdMap)
  }
  if (Array.isArray(value)) {
    return value.map((entry) => replacePatientPlaceholdersDeep(entry, patientIdMap))
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
        key,
        replacePatientPlaceholdersDeep(nestedValue, patientIdMap),
      ]),
    )
  }
  return value
}

const normalizeVisualizations = (value: unknown): unknown | null => {
  console.log(value); 
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return typeof parsed === 'object' && parsed !== null ? parsed : null
    } catch {
      return null
    }
  }
  if (value && typeof value === 'object') return value
  return null
}

export async function POST(req: Request) {
  try {
    const {
      question,
      chatId,
      fast,
      slow,
      mode,
      openai,
      gemini,
      radmapping,
      RAG,
      studyAnalysis,
      noWorkflow,
    }: {
      question?: string
      chatId?: string
      fast?: boolean
      slow?: boolean
      mode?: "fast" | "slow" | string
      openai?: boolean
      gemini?: boolean
      radmapping?: boolean
      RAG?: boolean
      studyAnalysis?: boolean
      noWorkflow?: boolean
    } = await req.json()

    try {
      const preview = typeof question === 'string' ? (question.length > 80 ? question.slice(0, 80) + '...' : question) : ''
      console.log('[api/chat] request', {
        chatId,
        mode,
        fast: fast === true,
        slow: slow === true,
        openai: openai === true,
        gemini: gemini === true,
        radmapping: radmapping === true,
        RAG: RAG === true,
        studyAnalysis: studyAnalysis === true,
        noWorkflow: noWorkflow === true,
        questionPreview: preview,
      })
    } catch {}

    if (!question || !question.trim()) {
      return NextResponse.json({ error: "Question is required" }, { status: 400 })
    }

    const supabase = await createServerSupabase()
    const { data: userRes, error: userErr } = await supabase.auth.getUser()
    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const user = userRes.user

    // Domain restriction check
    if (!isAllowedDomain(user.email)) {
      console.warn(`Unauthorized API access attempt from domain: ${user.email}`)
      return NextResponse.json({ error: "Unauthorized domain" }, { status: 403 })
    }

    let effectiveChatId = chatId
    if (!effectiveChatId) {
      const { data: chatInsert, error: chatErr } = await supabase
        .from('chats')
        .insert({ user_id: user.id, user_email: user.email, title: 'New Chat' })
        .select('id')
        .single()
      if (chatErr) {
        console.error('Failed to create chat', chatErr)
        return NextResponse.json({ error: "Failed to create chat" }, { status: 500 })
      }
      effectiveChatId = chatInsert.id as string
    }

    const { data: msgInsert, error: msgErr } = await supabase
      .from('messages')
      .insert({ chat_id: effectiveChatId, user_email: user.email, role: 'user', content: question })
      .select('id, created_at')
      .single()
    if (msgErr) {
      console.error('Failed to insert message', msgErr)
      return NextResponse.json({ error: "Failed to insert message" }, { status: 500 })
    }
    const userMessageId = msgInsert.id as string

    const effectiveQuestion = question
    if (!N8N_CLASSIFIER_URL) {
      return NextResponse.json({ error: "Missing N8N_CLASSIFIER_URL" }, { status: 500 })
    }

    const workflowResponse = await fetch(N8N_CLASSIFIER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        question: effectiveQuestion,
        mode,
        fast: fast === true,
        slow: slow === true,
        openai: openai === true,
        gemini: gemini === true,
        radmapping: radmapping === true,
        RAG: RAG === true,
        studyAnalysis: studyAnalysis === true,
        noWorkflow: noWorkflow === true,
        chatId: effectiveChatId,
        timestamp: new Date().toISOString(),
      }),
    })

    let workflowText = await workflowResponse.text()
    const executionId =
      workflowResponse.headers.get("execution-id") || workflowResponse.headers.get("x-execution-id")
    console.log("[api/chat] workflow response headers", {
      executionId,
      status: workflowResponse.status,
    })
    try {
      console.log('[chat] workflow status:', workflowResponse.status)
      console.log('[chat] workflow raw text (first 1000 chars):', workflowText.slice(0, 1000))
    } catch {}
    let workflowJson: unknown = null

    try {
      workflowJson = JSON.parse(workflowText)
    } catch {
    }

    if (!workflowResponse.ok) {
      return NextResponse.json(
        {
          error: "Workflow request failed",
          status: workflowResponse.status,
          body: workflowJson ?? workflowText,
        },
        { status: 502 },
      )
    }
type JsonRecord = Record<string, unknown>;
let obj = (typeof workflowJson === "object" && workflowJson !== null
  ? (workflowJson as JsonRecord)
  : null);

if (obj && typeof (obj as any).output === 'string') {
  try {
    const inner = JSON.parse((obj as any).output);
    if (typeof inner === 'object' && inner !== null) {
      obj = inner as JsonRecord;
    }
  } catch {
  }
}

if (obj && typeof (obj as any).output === 'object' && (obj as any).output !== null) {
  obj = (obj as any).output as JsonRecord;
}

if (obj && typeof (obj as any).data === 'object' && (obj as any).data !== null) {
  obj = (obj as any).data as JsonRecord;
}

try {
  console.log('[chat] unwrapped object keys:', obj ? Object.keys(obj) : null)
} catch {}

const getString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined

let reply: string;
let sources: Array<{ url: string; title?: string; snippet?: string; score?: number }> | undefined;
let visualizations: unknown;
if (Array.isArray(workflowJson)) {
  const first = workflowJson[0] as JsonRecord | undefined;
  const arrMessage = typeof first?.message === "string" ? (first!.message as string) : null;
  reply = arrMessage || workflowText;
} else {
  reply =
    getString(obj?.reply) ||
    getString(obj?.message) ||
    getString(obj?.response) ||
    (typeof workflowText === "string" ? workflowText : JSON.stringify(workflowJson));

  const rawSources = Array.isArray((obj as any)?.sources) ? (obj as any).sources : undefined
  if (rawSources) {
    sources = rawSources
      .map((s: any) => ({
        url: typeof s?.url === 'string' ? s.url : (typeof s?.link === 'string' ? s.link : undefined),
        title: typeof s?.title === 'string' ? s.title : undefined,
        snippet: typeof s?.snippet === 'string' ? s.snippet : undefined,
        score: typeof s?.score === 'number' ? s.score : (typeof s?.score === 'string' ? Number(s.score) : undefined),
      }))
      .filter((s: any) => typeof s.url === 'string' && !!s.url)
  }

  const rawVisualizations = Array.isArray((obj as any)?.visualizations)
    ? (obj as any).visualizations
    : Array.isArray((obj as any)?.charts)
      ? (obj as any).charts
      : undefined
  if (rawVisualizations) {
    visualizations = rawVisualizations
  }
}

const adminSupabase = createAdminSupabase()
const cutoff = new Date(Date.now() - PATIENT_ID_MAP_TTL_MS).toISOString()
const cleanupResult = await adminSupabase.from(PATIENT_ID_MAP_TABLE).delete().lt("created_at", cutoff)
if (cleanupResult.error) {
  console.warn("[patientIdMap] cleanup failed", cleanupResult.error)
} else {
  console.log("[patientIdMap] cleanup complete", { cutoff })
}

let safePatientIdMap: Record<string, string> = {}
if (executionId) {
  const { data: mapRow, error: mapErr } = await adminSupabase
    .from(PATIENT_ID_MAP_TABLE)
    .select("patient_id_map")
    .eq("execution_id", executionId)
    .maybeSingle()
  if (mapErr) {
    console.warn("[patientIdMap] lookup failed", mapErr)
  } else {
    safePatientIdMap = sanitizePatientIdMap(mapRow?.patient_id_map)
    console.log("[patientIdMap] lookup result", {
      executionId,
      hasMap: Object.keys(safePatientIdMap).length > 0,
      mapKeys: Object.keys(safePatientIdMap),
    })
  }
} else {
  console.log("[patientIdMap] missing execution id; skipping lookup")
}

console.log('[api/chat] replacement attempt starting', {
  replyPreview: typeof reply === 'string' ? reply.slice(0, 200) : null,
  sourcesCount: Array.isArray(sources) ? sources.length : 0,
  hasVisualizations: Boolean(visualizations),
  mapKeys: Object.keys(safePatientIdMap),
})
const beforeReply = reply
reply = replacePatientPlaceholdersInText(reply, safePatientIdMap)
sources = replacePatientPlaceholdersDeep(sources, safePatientIdMap) as typeof sources
visualizations = replacePatientPlaceholdersDeep(visualizations, safePatientIdMap)
workflowJson = replacePatientPlaceholdersDeep(workflowJson, safePatientIdMap)
if (typeof workflowText === "string") {
  workflowText = replacePatientPlaceholdersInText(workflowText, safePatientIdMap)
}
console.log('[api/chat] replacement output', {
  replyChanged: beforeReply !== reply,
  replyPreviewAfter: typeof reply === 'string' ? reply.slice(0, 200) : null,
  sourcesCountAfter: Array.isArray(sources) ? sources.length : 0,
  hasVisualizationsAfter: Boolean(visualizations),
})

if (executionId) {
  const deleteResult = await adminSupabase.from(PATIENT_ID_MAP_TABLE).delete().eq("execution_id", executionId)
  if (deleteResult.error) {
    console.warn("[patientIdMap] delete after use failed", deleteResult.error)
  } else {
    console.log("[patientIdMap] deleted map after use", { executionId })
  }
}

try {
  console.log('[chat] parsed reply length:', typeof reply === 'string' ? reply.length : -1, 'sources count:', Array.isArray(sources) ? sources.length : 0)
  if (Array.isArray(sources) && sources[0]) {
    console.log('[chat] first source sample:', sources[0])
  }
  if (Array.isArray(visualizations)) {
    console.log('[chat] visualizations passed through:', visualizations.length)
  }
} catch {}

const stripUrlFromText = (text: string, url: string) => {
  if (!text || !url) return text
  let out = text
  const variants = [
    url,
    `[${url}]`,
    `(${url})`,
    `<${url}>`,
  ]
  for (const v of variants) {
    out = out.split(v).join("")
  }
  out = out
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\[\s*\]/g, '')
    .replace(/\(\s*\)/g, '')
    .replace(/[ \t]+\n/g, '\n') 
    .replace(/\n{3,}/g, '\n\n') 
    .trim()
  return out
}

if (Array.isArray(sources) && sources.length > 0 && typeof reply === 'string') {
  for (const s of sources) {
    if (s?.url) reply = stripUrlFromText(reply, s.url)
  }
}

  const normalizedVisualizations = normalizeVisualizations(visualizations)
  if (normalizedVisualizations !== null) {
    visualizations = normalizedVisualizations
  }
  const { data: assistantInsert, error: assistantErr } = await supabase
    .from('messages')
    .insert({ chat_id: effectiveChatId, user_email: user.email, role: 'assistant', content: reply })
    .select('id')
    .single()

  if (assistantErr) {
    console.error('Failed to insert assistant message', assistantErr)
  }

  if (assistantInsert?.id && Array.isArray(sources) && sources.length > 0) {
    try {
      const rows = sources.map((s) => ({
        message_id: assistantInsert.id as string,
        chat_id: effectiveChatId,
        user_email: user.email,
        url: s.url,
        title: s.title ?? null,
        snippet: s.snippet ?? null,
        score: typeof s.score === 'number' ? s.score : null,
      }))
      await supabase.from('message_sources').insert(rows)
    } catch (e) {
      console.warn('Skipping source persistence (table missing or RLS blocked):', e)
    }
  }

  console.log(assistantInsert, normalizedVisualizations)
  return NextResponse.json({
    reply,
    raw: workflowJson ?? workflowText,
    chatId: effectiveChatId,
    sources,
    visualizations,
    userMessageId,
    assistantMessageId: assistantInsert?.id ?? null,
  })
    
  } catch (error) {
    console.error("Chat API error", error)
    return NextResponse.json({ error: "Failed to process question" }, { status: 500 })
  }
}
