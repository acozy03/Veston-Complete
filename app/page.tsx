import ChatInterface from "@/components/chat-interface.client"
import type { Chat, Message } from "@/components/chat-interface"
import { createServerSupabase } from "@/lib/supabase/server"

type PageProps = {
  searchParams?: Promise<{ chatId?: string | string[] }>
}

export default async function Home({ searchParams }: PageProps) {
  const resolvedSearchParams = (await searchParams) || {}
  let initialChats: Chat[] = []
  const requestedChatId = Array.isArray(resolvedSearchParams.chatId)
    ? resolvedSearchParams.chatId?.[0]
    : resolvedSearchParams.chatId
  let initialChatId = requestedChatId || ""
  let initialMessages: Message[] = []
  let user: { name?: string; email?: string; avatarUrl?: string } | undefined

  try {
    const supabase = await createServerSupabase()
    const { data: userRes } = await supabase.auth.getUser()
    if (userRes?.user) {
      const u = userRes.user
      const meta = (u.user_metadata || {}) as Record<string, unknown>
      const name = String((meta.name as string) || (meta.full_name as string) || u.email || "")
      const avatarUrl = String((meta.picture as string) || (meta.avatar_url as string) || "")
      user = { name, email: u.email ?? undefined, avatarUrl: avatarUrl || undefined }
      const { data: chats } = await supabase
        .from("chats")
        .select("id, title, created_at, updated_at")
        .eq("user_email", u.email)
        .order("updated_at", { ascending: false })
      initialChats = (chats || []).map((c: { id: string; title: string | null; created_at: string }) => ({
        id: c.id,
        title: c.title || "New Chat",
        createdAt: new Date(c.created_at),
        messages: [],
      }))
      const resolvedInitialChatId =
        (requestedChatId && initialChats.find((chat) => chat.id === requestedChatId)?.id) || initialChats[0]?.id || ""
      if (resolvedInitialChatId) {
        initialChatId = resolvedInitialChatId
        const { data: msgs } = await supabase
          .from("messages")
          .select("id, role, content, created_at")
          .eq("chat_id", resolvedInitialChatId)
          .eq("user_email", u.email)
          .order("created_at", { ascending: true })
        initialMessages = (msgs || []).map((m: { id: string; role: string; content: string; created_at: string }) => ({
          id: m.id,
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
          timestamp: new Date(m.created_at),
        }))
      }
    }
  } catch {
  }

  return (
    <ChatInterface initialChats={initialChats} initialChatId={initialChatId} initialMessages={initialMessages} user={user} />
  )
}
