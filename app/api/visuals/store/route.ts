import { NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"

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

export async function POST(req: Request) {
  try {
    const { chatId, messageId, visualizations }: { chatId?: string; messageId?: string; visualizations?: unknown } =
      await req.json()

    if (!chatId || !messageId) {
      return NextResponse.json({ error: "chatId and messageId are required" }, { status: 400 })
    }

    const normalizedVisualizations = normalizeVisualizations(visualizations)
    if (normalizedVisualizations === null) {
      return NextResponse.json({ error: "Invalid visualization payload" }, { status: 400 })
    }

    const supabase = await createServerSupabase()
    const { data: userRes, error: userErr } = await supabase.auth.getUser()
    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const user = userRes.user

    const { data: messageRow, error: messageErr } = await supabase
      .from('messages')
      .select('id')
      .eq('id', messageId)
      .eq('chat_id', chatId)
      .eq('user_email', user.email)
      .maybeSingle()

    if (messageErr || !messageRow) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 })
    }

    const { error: upsertErr } = await supabase
      .from('message_visualizations')
      .upsert(
        {
          message_id: messageId,
          chat_id: chatId,
          user_email: user.email,
          visualizations: normalizedVisualizations,
        },
        { onConflict: 'message_id,chat_id,user_email' },
      )

    if (upsertErr) {
      console.error('[visuals:store] failed to persist visualizations', upsertErr)
      return NextResponse.json({ error: "Failed to store visualizations" }, { status: 500 })
    }

    const vizSummary = Array.isArray(normalizedVisualizations)
      ? `count=${normalizedVisualizations.length}`
      : `type=${typeof normalizedVisualizations}`
    console.log('[visuals:store] stored visualizations', vizSummary)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[visuals:store] error', error)
    return NextResponse.json({ error: "Failed to store visualizations" }, { status: 500 })
  }
}
