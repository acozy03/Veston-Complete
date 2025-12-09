import ChatInterface from "@/components/chat-interface.client"
import { createServerSupabase } from "@/lib/supabase/server"

type PageProps = {
  searchParams?: { chatId?: string | string[] }
}

export default async function Home({ searchParams }: PageProps) {
  let initialChats: Array<{ id: string; title: string; createdAt: Date }> = []
  const requestedChatId = Array.isArray(searchParams?.chatId)
    ? searchParams?.chatId?.[0]
    : searchParams?.chatId
  let initialChatId = requestedChatId || ""
  let initialMessages: Array<{ id: string; role: "user" | "assistant"; content: string; timestamp: Date }> = []
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
      initialChats = (chats || []).map((c) => ({ id: c.id as string, title: (c.title as string) || "New Chat", createdAt: new Date(c.created_at as string) }))
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
        initialMessages = (msgs || []).map((m) => ({
          id: m.id as string,
          role: (m.role as string) === 'assistant' ? 'assistant' : 'user',
          content: m.content as string,
          timestamp: new Date(m.created_at as string),
        }))
      }
    }
  } catch {
    // ignore; user may not be authenticated yet (AuthGate will trigger)
  }

  return (
    <ChatInterface initialChats={initialChats} initialChatId={initialChatId} initialMessages={initialMessages} user={user} />
  )
}
