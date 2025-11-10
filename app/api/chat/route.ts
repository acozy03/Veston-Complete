import { NextResponse } from "next/server"
import OpenAI from "openai"
import { createServerSupabase } from "@/lib/supabase/server"

// Single n8n classifier webhook endpoint
const N8N_CLASSIFIER_URL = process.env.N8N_CLASSIFIER_URL

export async function POST(req: Request) {
  try {
    const {
      question,
      history = [],
      chatId,
    }: {
      question?: string
      history?: Array<{ role: string; content: string }>
      chatId?: string
    } = await req.json()

    if (!question || !question.trim()) {
      return NextResponse.json({ error: "Question is required" }, { status: 400 })
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 })
    }

    // Identify the signed-in user (RLS)
    const supabase = await createServerSupabase()
    const { data: userRes, error: userErr } = await supabase.auth.getUser()
    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const user = userRes.user

    const client = new OpenAI({ apiKey })

    // Create or retrieve chat row (scoped by user)
    let effectiveChatId = chatId
    if (!effectiveChatId) {
      const title = question.length > 30 ? question.slice(0, 30) + "..." : question
      const { data: chatInsert, error: chatErr } = await supabase
        .from('chats')
        .insert({ user_id: user.id, user_email: user.email, title })
        .select('id')
        .single()
      if (chatErr) {
        console.error('Failed to create chat', chatErr)
        return NextResponse.json({ error: "Failed to create chat" }, { status: 500 })
      }
      effectiveChatId = chatInsert.id as string
    }

    // Ensure chat title is updated from default on first message
    try {
      const { data: chatRow } = await supabase
        .from('chats')
        .select('id, title')
        .eq('id', effectiveChatId)
        .eq('user_email', user.email)
        .single()
      const desiredTitle = question.length > 30 ? question.slice(0, 30) + '...' : question
      if (chatRow && (!chatRow.title || chatRow.title === 'New Chat')) {
        await supabase
          .from('chats')
          .update({ title: desiredTitle })
          .eq('id', effectiveChatId)
          .eq('user_email', user.email)
      }
    } catch (e) {
      // non-fatal
    }

    // Insert user message
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

    // Fetch recent context from this chat (memory)
    const { data: contextMessages, error: ctxErr } = await supabase
      .from('messages')
      .select('id, role, content, created_at')
      .eq('chat_id', effectiveChatId)
      .eq('user_email', user.email)
      .order('created_at', { ascending: false })
      .limit(20)
    if (ctxErr) {
      console.error('Failed to fetch context', ctxErr)
    }

    // Rewrite question based on context; capture possible clarifying question but do not use it yet
       const rewriteSystem = `You resolve coreferences in the user's latest question using prior conversation context.

CRITICAL RULES (top priority):
- DO NOT add, infer, convert, or insert any dates/times. Keep phrases like "now", "today", "yesterday", "in an hour", "tomorrow", etc. EXACTLY AS WRITTEN.
- If the latest question contains any relative time expression, DO NOT make it self-contained by introducing absolute dates/times.

Goal: Make the question self-contained ONLY for entity references (people, places, products, repos, documents). Never for dates/times.

Strict rules:
- If there is no reference to resolve or no matching entity in context, return the original question unchanged with needs_clarification=false.
- DO NOT replace date or time references.
- DO NOT rephrase, reorder, add, or remove any other words.
- Replace only the referential tokens themselves. Keep the rest of the question identical.
- If a reference has multiple plausible entities, set needs_clarification=true and ask a concise clarifying_question.
- Only replace references with entities that are explicitly mentioned and stated by the user.

Output must follow this JSON schema exactly:
{
  "effective_question": "string",
  "needs_clarification": boolean,
  "clarifying_question": "string | null"
}`;

    const rewriteSchema = {
      type: 'object',
      properties: {
        effective_question: { type: 'string' },
        needs_clarification: { type: 'boolean' },
        clarifying_question: { type: 'string' },
      },
      required: ['effective_question', 'needs_clarification', 'clarifying_question'],
      additionalProperties: false,
    } as const

    const contextText = (contextMessages ?? [])
      .slice() // copy
      .reverse() // oldest first
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n')

    const rewriteResp = await client.responses.create({
      model: 'gpt-4.1-mini',
      input: [
        { role: 'system', content: rewriteSystem },
        { role: 'user', content: `Context:\n${contextText}\n\nQuestion: ${question}` },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'rewrite_schema',
          schema: rewriteSchema,
          strict: true,
        },
      },
    })

    const rewriteRaw = rewriteResp.output_text
    let effectiveQuestion = question
    let needsClarification = false
    let clarifyingQuestion = ''

    if (rewriteRaw) {
      try {
        const parsed = JSON.parse(rewriteRaw) as {
          effective_question: string
          needs_clarification: boolean
          clarifying_question?: string
        }
        effectiveQuestion = parsed.effective_question || question
        needsClarification = !!parsed.needs_clarification
        clarifyingQuestion = parsed.clarifying_question || ''
      } catch (e) {
        console.warn('Failed to parse rewrite JSON; proceeding with original question')
      }
    }
    console.log('Effective question:', effectiveQuestion, 'Needs clarification:', needsClarification, 'Clarifying question:', clarifyingQuestion)
    // Persist rewrite and context links
    if (effectiveQuestion !== question) {
      await supabase
        .from('message_rewrites')
        .insert({ original_message_id: userMessageId, user_email: user.email, rewritten_content: effectiveQuestion, method: 'llm' })
    }
    if (contextMessages && contextMessages.length) {
      const rows = contextMessages.map((m, idx) => ({
        message_id: userMessageId,
        user_email: user.email,
        context_message_id: m.id,
        score: Math.max(0, 1 - idx * 0.05),
      }))
      await supabase.from('message_contexts').insert(rows)
    }
    if (!N8N_CLASSIFIER_URL) {
      return NextResponse.json({ error: "Missing N8N_CLASSIFIER_URL" }, { status: 500 })
    }

    // Route directly to the single n8n classifier webhook
    const workflowResponse = await fetch(N8N_CLASSIFIER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ question: effectiveQuestion, history, timestamp: new Date().toISOString() }),
    })

    const workflowText = await workflowResponse.text()
    try {
      console.log('[chat] workflow status:', workflowResponse.status)
      console.log('[chat] workflow raw text (first 1000 chars):', workflowText.slice(0, 1000))
    } catch {}
    let workflowJson: unknown = null

    try {
      workflowJson = JSON.parse(workflowText)
    } catch {
      // response was plain text; keep raw text
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

// n8n sometimes wraps the real JSON inside an `output` key
// Handle both stringified and object forms
if (obj && typeof (obj as any).output === 'string') {
  try {
    const inner = JSON.parse((obj as any).output);
    if (typeof inner === 'object' && inner !== null) {
      obj = inner as JsonRecord;
    }
  } catch {
    // keep original obj if parse fails
  }
}

if (obj && typeof (obj as any).output === 'object' && (obj as any).output !== null) {
  obj = (obj as any).output as JsonRecord;
}

// Also unwrap common containers like `{ data: {...} }`
if (obj && typeof (obj as any).data === 'object' && (obj as any).data !== null) {
  obj = (obj as any).data as JsonRecord;
}

try {
  console.log('[chat] unwrapped object keys:', obj ? Object.keys(obj) : null)
} catch {}

// Handle Google Bucket Scraper array payloads that contain a markdown `message` field
let reply: string;
let sources: Array<{ url: string; title?: string; snippet?: string; score?: number }> | undefined;
if (Array.isArray(workflowJson)) {
  const first = workflowJson[0] as JsonRecord | undefined;
  const arrMessage = typeof first?.message === "string" ? (first!.message as string) : null;
  reply = arrMessage || workflowText;
} else {
  reply =
    (obj?.reply && typeof obj.reply === "string" && obj.reply) ||
    (obj?.message && typeof obj.message === "string" && obj.message) ||
    (obj?.response && typeof obj.response === "string" && obj.response) ||
    (typeof workflowText === "string" ? workflowText : JSON.stringify(workflowJson));

  // Optional structured sources passthrough
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
}

try {
  console.log('[chat] parsed reply length:', typeof reply === 'string' ? reply.length : -1, 'sources count:', Array.isArray(sources) ? sources.length : 0)
  if (Array.isArray(sources) && sources[0]) {
    console.log('[chat] first source sample:', sources[0])
  }
} catch {}

// If sources are present, strip their URLs from the reply so links only appear in the Sources box
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
  // Clean up leftover extra spaces but PRESERVE newlines
  out = out
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\[\s*\]/g, '')
    .replace(/\(\s*\)/g, '')
    .replace(/[ \t]+\n/g, '\n') // trim spaces before newline
    .replace(/\n{3,}/g, '\n\n') // collapse 3+ newlines to 2
    .trim()
  return out
}

if (Array.isArray(sources) && sources.length > 0 && typeof reply === 'string') {
  for (const s of sources) {
    if (s?.url) reply = stripUrlFromText(reply, s.url)
  }
}
    // Save assistant reply to messages (capture id for source linking)
    const { data: assistantInsert, error: assistantErr } = await supabase
      .from('messages')
      .insert({ chat_id: effectiveChatId, user_email: user.email, role: 'assistant', content: reply })
      .select('id')
      .single()

    if (assistantErr) {
      console.error('Failed to insert assistant message', assistantErr)
    }

    // Opportunistically persist sources if available (ignore if table doesn't exist)
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

    // Log workflow run
    await supabase.from('workflow_runs').insert({
      user_id: user.id,
      user_email: user.email,
      chat_id: effectiveChatId,
      message_id: userMessageId,
      classifier_path: 'N8N_CLASSIFIER',
      payload: { question: effectiveQuestion, history },
      status: 'succeeded',
    })

    return NextResponse.json({
      reply,
      raw: workflowJson ?? workflowText,
      chatId: effectiveChatId,
      sources,
    })
    
  } catch (error) {
    console.error("Chat API error", error)
    return NextResponse.json({ error: "Failed to process question" }, { status: 500 })
  }
}
