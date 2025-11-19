import { NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"

// Single n8n classifier webhook endpoint
const N8N_CLASSIFIER_URL = process.env.N8N_CLASSIFIER_URL

export async function POST(req: Request) {
  try {
    const {
      question,
      chatId,
      fast,
      slow,
      mode,
      radmapping,
      RAG,
      noWorkflow,
    }: {
      question?: string
      chatId?: string
      fast?: boolean
      slow?: boolean
      mode?: "fast" | "slow" | string
      radmapping?: boolean
      RAG?: boolean
      noWorkflow?: boolean
    } = await req.json()

    // Server-side debug log of incoming request fields
    try {
      const preview = typeof question === 'string' ? (question.length > 80 ? question.slice(0, 80) + '...' : question) : ''
      console.log('[api/chat] request', {
        chatId,
        mode,
        fast: fast === true,
        slow: slow === true,
        radmapping: radmapping === true,
        RAG: RAG === true,
        noWorkflow: noWorkflow === true,
        questionPreview: preview,
      })
    } catch {}

    if (!question || !question.trim()) {
      return NextResponse.json({ error: "Question is required" }, { status: 400 })
    }

    // Identify the signed-in user (RLS)
    const supabase = await createServerSupabase()
    const { data: userRes, error: userErr } = await supabase.auth.getUser()
    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const user = userRes.user

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

    // Skip intermediate clarifier/memory step for speed
    const effectiveQuestion = question
    if (!N8N_CLASSIFIER_URL) {
      return NextResponse.json({ error: "Missing N8N_CLASSIFIER_URL" }, { status: 500 })
    }

    // Route directly to the single n8n classifier webhook
    const workflowResponse = await fetch(N8N_CLASSIFIER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        question: effectiveQuestion,
        // forward mode flags so n8n can choose models
        mode,
        fast: fast === true,
        slow: slow === true,
        radmapping: radmapping === true,
        RAG: RAG === true,
        noWorkflow: noWorkflow === true,
        // helpful context
        chatId: effectiveChatId,
        timestamp: new Date().toISOString(),
      }),
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
      payload: {
        question: effectiveQuestion,
        mode,
        fast: fast === true,
        slow: slow === true,
        radmapping: radmapping === true,
        RAG: RAG === true,
        noWorkflow: noWorkflow === true,
      },
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
