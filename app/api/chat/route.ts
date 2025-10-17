import { NextResponse } from "next/server"
import OpenAI from "openai"
import { createServerSupabase } from "@/lib/supabase/server"

const GOOGLE_BUCKET_URL =
  process.env.N8N_GOOGLE_BUCKET_SCRAPER_URL ??
  "http://34.57.10.93:5678/webhook/5ba2b170-557f-4f18-a2c1-2921f5308bf5"
const RADMAPPING_URL =
  process.env.N8N_RADMAPPING_PLUS_URL ??
  "http://34.57.10.93:5678/webhook/a09c94a6-7929-48ad-b9e6-c532ffcbac20"

const CLASSIFICATION_GUIDELINES =
  process.env.CLASSIFICATION_PROMPT ??
  "<<< TODO: Provide the detailed rules that decide between google bucket scrape and radmapping+. >>>"

const WORKFLOW_URLS = {
  GOOGLE_BUCKET_SCRAPER: GOOGLE_BUCKET_URL,
  RADMAPPING_PLUS: RADMAPPING_URL,
} as const

const CLASSIFICATION_SCHEMA = {
  type: "object",
  properties: {
    label: { type: "string", enum: ["GOOGLE_BUCKET_SCRAPER", "RADMAPPING_PLUS"] },
    confidence: { type: "string" },
    rationale: { type: "string" },
  },
  required: ["label", "confidence", "rationale"],  
  additionalProperties: false,
} as const;

interface ClassifierResult {
  label: keyof typeof WORKFLOW_URLS
  confidence?: string
  rationale?: string
}

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

    // Create or retrieve chat row (scoped by user email as well)
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

Goal: Make the question self-contained by replacing ONLY referential terms (e.g., he, she, they, it, this, that, these, those, here, there, the company, the hospital, the facility, the model, the repo, etc.) with explicit entities from context.

Strict rules:
- If there is no reference to resolve or no matching entity in context, return the original question unchanged with needs_clarification=false.
- DO NOT replace date or time references (e.g. DO NOT replace 'yesterday' or 'tomorrow' with the actual date).
- DO NOT rephrase, reorder, add, or remove any other words.
- Preserve original spelling, punctuation, and casing.
- Replace only the referential tokens themselves. Keep the rest of the question identical.
- If a reference has multiple plausible entities, set needs_clarification=true and ask a concise clarifying_question.
- Only replace references with entities that are explicity mentioned and stated by the user.

Output must follow this JSON schema exactly:
{
  "resolved_question": "string",
  "needs_clarification": boolean,
  "clarifying_question": "string | null"
}
`

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
    console.log(CLASSIFICATION_GUIDELINES)
    const classifierResponse = await client.responses.create({
  model: "gpt-4.1-mini",
  input: [
    { role: "system", content: `You are a strict classification engine. Pick exactly one workflow label for each message. Use these rules:\n${CLASSIFICATION_GUIDELINES}\nRespond as JSON that matches the provided schema.` },
    { role: "user", content: `User message: ${question}` },
  ],
  text: {
    format: {
      type: "json_schema",
      name: "workflow_classifier",
      schema: CLASSIFICATION_SCHEMA,
      strict: true,
    },
  },
});

    const rawOutput = classifierResponse.output_text  
    console.log(rawOutput); 
    let classifierResult: ClassifierResult | null = null

    if (rawOutput) {
      try {
        classifierResult = JSON.parse(rawOutput) as ClassifierResult
      } catch (parseError) {
        console.error("Failed to parse classifier output", parseError)
      }
    }

    const label = classifierResult?.label ?? "GOOGLE_BUCKET_SCRAPER"
    const workflowUrl = WORKFLOW_URLS[label]

    if (!workflowUrl) {
      return NextResponse.json({ error: `No workflow URL configured for label ${label}` }, { status: 500 })
    }

    // Only ask for clarification when classifier confidence is low
    const normalizeConfidence = (c?: string): number => {
      if (!c) return 0.5
      const n = parseFloat(c)
      if (!Number.isNaN(n)) {
        // Treat values in 0-1 as-is, 0-100 as percentage
        if (n > 1 && n <= 100) return Math.max(0, Math.min(1, n / 100))
        return Math.max(0, Math.min(1, n))
      }
      const lc = c.toLowerCase()
      if (lc.includes('low')) return 0.25
      if (lc.includes('medium')) return 0.55
      if (lc.includes('high')) return 0.85
      return 0.5
    }
    const confidenceScore = normalizeConfidence(classifierResult?.confidence)
    const LOW_CONFIDENCE_THRESHOLD = 0.6
    if (confidenceScore < LOW_CONFIDENCE_THRESHOLD) {
      const ask = clarifyingQuestion || 'Could you share a bit more detail so I can route this correctly?'
      await supabase
        .from('messages')
        .insert({ chat_id: effectiveChatId, user_email: user.email, role: 'assistant', content: ask })

      return NextResponse.json({
        reply: ask,
        workflow: 'clarification',
        classifier: classifierResult,
        chatId: effectiveChatId,
      })
    }

    const workflowResponse = await fetch(workflowUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ question: effectiveQuestion, history, classifier: classifierResult, timestamp: new Date().toISOString() }),
    })

    const workflowText = await workflowResponse.text()
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
const obj = (typeof workflowJson === "object" && workflowJson !== null
  ? (workflowJson as JsonRecord)
  : null);

// Handle Google Bucket Scraper array payloads that contain a markdown `message` field
let reply: string;
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
}
    // Save assistant reply to messages
    await supabase
      .from('messages')
      .insert({ chat_id: effectiveChatId, user_email: user.email, role: 'assistant', content: reply })

    // Log workflow run
    await supabase.from('workflow_runs').insert({
      user_id: user.id,
      user_email: user.email,
      chat_id: effectiveChatId,
      message_id: userMessageId,
      classifier_path: label,
      payload: { question: effectiveQuestion, history },
      status: 'succeeded',
      llm_prompt: CLASSIFICATION_GUIDELINES,
      llm_response: classifierResult as any,
    })

    return NextResponse.json({
      reply,
      workflow: label,
      classifier: classifierResult,
      raw: workflowJson ?? workflowText,
      chatId: effectiveChatId,
    })
    
  } catch (error) {
    console.error("Chat API error", error)
    return NextResponse.json({ error: "Failed to process question" }, { status: 500 })
  }
}
