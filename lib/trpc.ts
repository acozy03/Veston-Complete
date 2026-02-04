import { initTRPC, TRPCError } from "@trpc/server"
import { isIP } from "node:net"
import { z } from "zod"
import { createServerSupabase } from "@/lib/supabase/server"
import { isAllowedDomain } from "@/lib/auth-utils"
import { prepareChartSpecs, stringifyForPrompt } from "@/lib/visualization"
import { VertexAI } from "@google-cloud/vertexai"

const t = initTRPC.create()

const N8N_CLASSIFIER_URL = process.env.N8N_CLASSIFIER_URL

const project = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || "veston-complete"
const location = process.env.GCP_LOCATION || "us-central1"
const VISUAL_CLASSIFIER_MODEL = process.env.VISUAL_CLASSIFIER_MODEL || "gemini-2.5-flash"
const VISUAL_GENERATOR_MODEL = process.env.VISUAL_GENERATOR_MODEL || "gemini-2.5-flash"
const CHAT_TITLE_MODEL = process.env.CHAT_TITLE_MODEL || "gemini-2.5-flash"
const CHAT_TITLE_TIMEOUT_MS = Number(process.env.CHAT_TITLE_TIMEOUT_MS || 8000)

const vertexAI = new VertexAI({ project, location })
const visualClassifierModel = vertexAI.getGenerativeModel({ model: VISUAL_CLASSIFIER_MODEL })
const visualGeneratorModel = vertexAI.getGenerativeModel({ model: VISUAL_GENERATOR_MODEL })
const chatTitleModel = vertexAI.getGenerativeModel({ model: CHAT_TITLE_MODEL })

const TRUSTED_PROXY_HOSTS = (process.env.PROXY_FILE_ALLOWED_HOSTS ?? "")
  .split(",")
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean)
const TRUSTED_PROXY_SCHEMES = (process.env.PROXY_FILE_ALLOWED_SCHEMES ?? "")
  .split(",")
  .map((scheme) => scheme.trim().toLowerCase())
  .filter(Boolean)

const isPrivateHostname = (hostname: string) => {
  const normalized = hostname.toLowerCase()
  if (normalized === "localhost" || normalized.endsWith(".localhost")) return true

  const ipVersion = isIP(normalized)
  if (ipVersion === 4) {
    const parts = normalized.split(".").map((part) => Number.parseInt(part, 10))
    const [a, b] = parts
    if (a === 10) return true
    if (a === 127) return true
    if (a === 0) return true
    if (a === 169 && b === 254) return true
    if (a === 192 && b === 168) return true
    if (a === 172 && b >= 16 && b <= 31) return true
  }
  if (ipVersion === 6) {
    if (normalized === "::1") return true
    if (normalized.startsWith("fd") || normalized.startsWith("fc")) return true
    if (normalized.startsWith("fe80")) return true
  }

  return false
}

const isAllowedProxyUrl = (url: URL) => {
  const scheme = url.protocol.replace(":", "").toLowerCase()
  if (!["http", "https"].includes(scheme)) return false
  if (isPrivateHostname(url.hostname)) return false

  const hostname = url.hostname.toLowerCase()
  const hostAllowed =
    TRUSTED_PROXY_HOSTS.length > 0
      ? TRUSTED_PROXY_HOSTS.some((allowed) =>
          allowed.startsWith("*.") ? hostname.endsWith(allowed.slice(1)) : hostname === allowed,
        )
      : false
  const schemeAllowed = TRUSTED_PROXY_SCHEMES.length > 0 ? TRUSTED_PROXY_SCHEMES.includes(scheme) : false

  return hostAllowed || schemeAllowed
}

const normalizeVisualizations = (value: unknown): unknown | null => {
  if (Array.isArray(value)) return value
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      return typeof parsed === "object" && parsed !== null ? parsed : null
    } catch {
      return null
    }
  }
  if (value && typeof value === "object") return value
  return null
}

const stripUrlFromText = (text: string, url: string) => {
  if (!text || !url) return text
  let out = text
  const variants = [url, `[${url}]`, `(${url})`, `<${url}>`]
  for (const v of variants) {
    out = out.split(v).join("")
  }
  out = out
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\[\s*\]/g, "")
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return out
}

const buildFallbackTitle = (value?: string) => {
  if (value && value.trim()) {
    const trimmed = value.trim()
    return trimmed.length > 50 ? `${trimmed.slice(0, 50)}...` : trimmed
  }
  return "New Chat"
}

export const appRouter = t.router({
  chat: t.router({
    ask: t.procedure
      .input(
        z.object({
          question: z.string().optional(),
          chatId: z.string().optional(),
          fast: z.boolean().optional(),
          slow: z.boolean().optional(),
          mode: z.string().optional(),
          openai: z.boolean().optional(),
          gemini: z.boolean().optional(),
          radmapping: z.boolean().optional(),
          RAG: z.boolean().optional(),
          studyAnalysis: z.boolean().optional(),
          noWorkflow: z.boolean().optional(),
        }),
      )
      .mutation(async ({ input }) => {
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
        } = input

        if (!question || !question.trim()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Question is required" })
        }

        const supabase = await createServerSupabase()
        const { data: userRes, error: userErr } = await supabase.auth.getUser()
        if (userErr || !userRes?.user) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Unauthorized" })
        }
        const user = userRes.user

        // Domain restriction check
        if (!isAllowedDomain(user.email)) {
          console.warn(`Unauthorized tRPC access attempt from domain: ${user.email}`)
          throw new TRPCError({ code: "FORBIDDEN", message: "Unauthorized domain" })
        }

        let effectiveChatId = chatId
        if (!effectiveChatId) {
          const { data: chatInsert, error: chatErr } = await supabase
            .from("chats")
            .insert({ user_id: user.id, user_email: user.email, title: "New Chat" })
            .select("id")
            .single()
          if (chatErr) {
            console.error("Failed to create chat", chatErr)
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create chat" })
          }
          effectiveChatId = chatInsert.id as string
        }

        const { data: msgInsert, error: msgErr } = await supabase
          .from("messages")
          .insert({ chat_id: effectiveChatId, user_email: user.email, role: "user", content: question })
          .select("id, created_at")
          .single()
        if (msgErr) {
          console.error("Failed to insert message", msgErr)
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create message" })
        }
        const userMessageId = msgInsert.id as string

        if (!N8N_CLASSIFIER_URL) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Missing N8N_CLASSIFIER_URL" })
        }

        const workflowResponse = await fetch(N8N_CLASSIFIER_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            question,
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

        const workflowText = await workflowResponse.text()
        let workflowJson: unknown = null

        try {
          workflowJson = JSON.parse(workflowText)
        } catch {
          workflowJson = null
        }

        if (!workflowResponse.ok) {
          throw new TRPCError({
            code: "BAD_GATEWAY",
            message: "Workflow request failed",
            cause: {
              status: workflowResponse.status,
              body: workflowJson ?? workflowText,
            },
          })
        }

        type JsonRecord = Record<string, unknown>
        let obj =
          typeof workflowJson === "object" && workflowJson !== null ? (workflowJson as JsonRecord) : null

        if (obj && typeof (obj as any).output === "string") {
          try {
            const inner = JSON.parse((obj as any).output)
            if (typeof inner === "object" && inner !== null) {
              obj = inner as JsonRecord
            }
          } catch {
            // ignore
          }
        }

        if (obj && typeof (obj as any).output === "object" && (obj as any).output !== null) {
          obj = (obj as any).output as JsonRecord
        }

        if (obj && typeof (obj as any).data === "object" && (obj as any).data !== null) {
          obj = (obj as any).data as JsonRecord
        }

        let reply: string
        let sources:
          | Array<{ url: string; title?: string; snippet?: string; score?: number }>
          | undefined
        let visualizations: unknown

        if (Array.isArray(workflowJson)) {
          const first = workflowJson[0] as JsonRecord | undefined
          const arrMessage = typeof first?.message === "string" ? (first!.message as string) : null
          reply = arrMessage || workflowText
        } else {
          reply =
            (obj?.reply && typeof obj.reply === "string" && obj.reply) ||
            (obj?.message && typeof obj.message === "string" && obj.message) ||
            (obj?.response && typeof obj.response === "string" && obj.response) ||
            (typeof workflowText === "string" ? workflowText : JSON.stringify(workflowJson))

          const rawSources = Array.isArray((obj as any)?.sources) ? (obj as any).sources : undefined
          if (rawSources) {
            sources = rawSources
              .map((s: any) => ({
                url: typeof s?.url === "string" ? s.url : typeof s?.link === "string" ? s.link : undefined,
                title: typeof s?.title === "string" ? s.title : undefined,
                snippet: typeof s?.snippet === "string" ? s.snippet : undefined,
                score:
                  typeof s?.score === "number"
                    ? s.score
                    : typeof s?.score === "string"
                      ? Number(s.score)
                      : undefined,
              }))
              .filter((s: any) => typeof s.url === "string" && !!s.url)
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

        if (Array.isArray(sources) && sources.length > 0 && typeof reply === "string") {
          for (const s of sources) {
            if (s?.url) reply = stripUrlFromText(reply, s.url)
          }
        }

        const normalizedVisualizations = normalizeVisualizations(visualizations)
        if (normalizedVisualizations !== null) {
          visualizations = normalizedVisualizations
        }

        const { data: assistantInsert, error: assistantErr } = await supabase
          .from("messages")
          .insert({ chat_id: effectiveChatId, user_email: user.email, role: "assistant", content: reply })
          .select("id")
          .single()

        if (assistantErr) {
          console.error("Failed to insert assistant message", assistantErr)
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
              score: typeof s.score === "number" ? s.score : null,
            }))
            await supabase.from("message_sources").insert(rows)
          } catch (e) {
            console.warn("Skipping source persistence (table missing or RLS blocked):", e)
          }
        }

        return {
          reply,
          raw: workflowJson ?? workflowText,
          chatId: effectiveChatId,
          sources,
          visualizations,
          userMessageId,
          assistantMessageId: assistantInsert?.id ?? null,
        }
      }),
    title: t.procedure
      .input(
        z.object({
          message: z.string().optional(),
          fallback: z.string().optional(),
        }),
      )
      .mutation(async ({ input }) => {
        const { message, fallback } = input
        const baseTitle = buildFallbackTitle(fallback || message)

        if (!message || !message.trim()) {
          return { title: baseTitle, reason: "missing-message" }
        }

        try {
          const completionPromise = chatTitleModel.generateContent({
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: [
                      "Create a concise, human-friendly chat title (max 8 words) for the first user message.",
                      "Return only the title text without quotes or punctuation at the end.",
                      `Message: ${message}`,
                    ].join("\n"),
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.4,
            },
          })

          const completion = await Promise.race([
            completionPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), CHAT_TITLE_TIMEOUT_MS)),
          ])

          const text =
            (completion as any)?.response?.candidates?.[0]?.content?.parts
              ?.map((part: any) => part.text || "")
              .join("")
              ?.trim() || ""
          const candidate = buildFallbackTitle(text || message)

          return { title: candidate }
        } catch (error) {
          console.error("[chat:title] failed", error)
          return { title: baseTitle, reason: "unavailable" }
        }
      }),
  }),
  visuals: t.router({
    classify: t.procedure
      .input(z.object({ question: z.string().optional() }))
      .mutation(async ({ input }) => {
        const { question } = input
        if (!question || !question.trim()) {
          return { shouldVisualize: false, reason: "missing-question" }
        }

        try {
          const completion = await visualClassifierModel.generateContent({
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: [
                      "Return a single word `yes` or `no` indicating whether the user's query facilitates a data visualization (chart/graph) in the response.",
                      "This can be through any sort of graph like a pie chart, bar chart, line graph, etc.",
                      "The answer should always be 'yes' if the user is asking about an accession number. Most of the time visualizations are good.",
                      `Question: ${question}`,
                    ].join("\n"),
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.4,
            },
          })

          const text =
            completion.response.candidates?.[0]?.content?.parts
              ?.map((part: any) => part.text || "")
              .join("")
              ?.toLowerCase() || ""
          const shouldVisualize = /yes|chart|graph/.test(text)

          return { shouldVisualize, raw: text }
        } catch (error) {
          console.error("[visuals:classify] failed", error)
          return { shouldVisualize: false, reason: "error" }
        }
      }),
    generate: t.procedure
      .input(
        z.object({
          question: z.string().optional(),
          answer: z.string().optional(),
          raw: z.unknown().optional(),
          preview: z.string().optional(),
        }),
      )
      .mutation(async ({ input }) => {
        const { question, answer, raw, preview } = input
        if (!question || !answer) {
          return { charts: [], reason: "missing-context" }
        }

        try {
          const promptContext = preview || stringifyForPrompt(raw, 3000)

          const completion = await visualGeneratorModel.generateContent({
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: [
                      "You create concise JSON chart specs for Recharts with a top-level `charts` array.",
                      "Each chart has id, type (line|bar|area|pie|sankey), title, description, data (array of objects), xKey, yKeys (array of {key,label,color}), categoryKey, valueKey.",
                      "Sankey charts instead use nodes (array of {id,name,color,description}) and links (array of {source,target,value,color}) to describe flows.",
                      "When type is sankey, do not include data/xKey/yKeys/categoryKey/valueKey; provide only nodes and links.",
                      "Each sankey node needs a unique string id and name (with an optional description string shown with the label); every link must reference those ids exactly (never indexes or labels) and must include a numeric value.",
                      "For sankey nodes, include the most relevant timestamp or date from the case (e.g., admission time, procedure date) in the node name or description so the flow reads like a timeline.",
                      "Drop any link that points to a missing node; always return at least two nodes for a sankey chart.",
                      'Example sankey: {"charts":[{"id":"accession-flow","type":"sankey","title":"Accession flow","nodes":[{"id":"source","name":"Source"},{"id":"lab","name":"Lab"},{"id":"archive","name":"Archive"}],"links":[{"source":"source","target":"lab","value":120},{"source":"lab","target":"archive","value":95}]}]}',
                      "Always provide a distinct hex color for every yKeys entry. Only include data you can derive from the provided context.",
                      "Respond with strict JSON that follows this schema and contains only the `charts` key.",
                      `User question: ${question}`,
                      `Assistant reply: ${answer}`,
                      `Context: ${promptContext || "(none)"}`,
                    ].join("\n"),
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.2,
              responseMimeType: "application/json",
            },
          })

          const content =
            completion.response.candidates?.[0]?.content?.parts?.map((part: any) => part.text || "").join("") || "{}"
          let parsed: unknown
          try {
            parsed = JSON.parse(content)
          } catch (error) {
            console.warn("[visuals:generate] failed to parse model output", error)
            parsed = null
          }

          const charts = prepareChartSpecs((parsed as any)?.charts || (parsed as any)?.visualizations)
          return { charts }
        } catch (error) {
          console.error("[visuals:generate] failed", error)
          return { charts: [], reason: "error" }
        }
      }),
    store: t.procedure
      .input(
        z.object({
          chatId: z.string().optional(),
          messageId: z.string().optional(),
          visualizations: z.unknown().optional(),
        }),
      )
      .mutation(async ({ input }) => {
        const { chatId, messageId, visualizations } = input
        if (!chatId || !messageId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "chatId and messageId are required" })
        }

        const normalizedVisualizations = normalizeVisualizations(visualizations)
        if (normalizedVisualizations === null) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid visualization payload" })
        }

        const supabase = await createServerSupabase()
        const { data: userRes, error: userErr } = await supabase.auth.getUser()
        if (userErr || !userRes?.user) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Unauthorized" })
        }
        const user = userRes.user

        const { data: messageRow, error: messageErr } = await supabase
          .from("messages")
          .select("id")
          .eq("id", messageId)
          .eq("chat_id", chatId)
          .eq("user_email", user.email)
          .maybeSingle()

        if (messageErr || !messageRow) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" })
        }

        const { error: upsertErr } = await supabase
          .from("message_visualizations")
          .upsert(
            {
              message_id: messageId,
              chat_id: chatId,
              user_email: user.email,
              visualizations: normalizedVisualizations,
            },
            { onConflict: "message_id,chat_id,user_email" },
          )

        if (upsertErr) {
          console.error("[visuals:store] failed to persist visualizations", upsertErr)
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to store visualizations" })
        }

        return { ok: true }
      }),
  }),
  proxyFile: t.router({
    fetch: t.procedure
      .input(
        z.object({
          src: z.string(),
          download: z.boolean().optional(),
        }),
      )
      .query(async ({ input }) => {
        const { src, download } = input
        if (!src) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Missing src" })
        }

        const supabase = await createServerSupabase()
        const { data: userRes, error: userErr } = await supabase.auth.getUser()
        if (userErr || !userRes?.user) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Unauthorized" })
        }

        let targetUrl: URL
        try {
          targetUrl = new URL(src)
        } catch {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid src URL" })
        }

        // TODO: Replace proxying with short-lived signed URLs for safer access control.
        if (!isAllowedProxyUrl(targetUrl)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "URL not allowed" })
        }

        let upstream: Response
        try {
          upstream = await fetch(targetUrl)
        } catch (error) {
          throw new TRPCError({ code: "BAD_GATEWAY", message: "Upstream fetch failed", cause: error })
        }

        if (!upstream.ok || !upstream.body) {
          throw new TRPCError({
            code: "BAD_GATEWAY",
            message: "Upstream fetch failed",
            cause: { status: upstream.status },
          })
        }

        const headers = new Headers(upstream.headers)
        const ct = headers.get("content-type") || "application/octet-stream"

        let filename: string | null = null
        if (download) {
          try {
            const u = new URL(src)
            const qpName = u.searchParams.get("filename")
            if (qpName) filename = qpName
            else {
              const last = u.pathname.split("/").pop() || "file"
              filename = decodeURIComponent(last)
            }
          } catch {
            filename = "file"
          }
          if (filename && !/\.[A-Za-z0-9]+$/.test(filename)) {
            if (ct.includes("spreadsheetml")) filename += ".xlsx"
          }
        }

        const arrayBuffer = await upstream.arrayBuffer()
        const base64 = Buffer.from(arrayBuffer).toString("base64")

        return {
          data: base64,
          contentType: ct,
          filename,
          contentDisposition: download ? "attachment" : "inline",
        }
      }),
  }),
})

export type AppRouter = typeof appRouter
