"use client"

import { useEffect, useMemo, useState } from "react"
import { ChatSidebar } from "./chat-sidebar"
import { ChatMessages } from "./chat-messages"
import { ChatInput } from "./chat-input"
import { Button } from "./ui/button"
import { Menu } from "lucide-react"
import { ThemeToggle } from "./theme-toggle"
import { createClient } from "@/lib/supabase/client"

export type Message = {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
}

export type Chat = {
  id: string
  title: string
  messages: Message[]
  createdAt: Date
}

const generateId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`

const INITIAL_CHATS: Chat[] = []

type ChatInterfaceProps = {
  initialChats?: Chat[]
  initialChatId?: string
  initialMessages?: Message[]
  user?: { name?: string; email?: string; avatarUrl?: string }
}

export default function ChatInterface({ initialChats = [], initialChatId = "", initialMessages = [], user }: ChatInterfaceProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [chats, setChats] = useState<Chat[]>(
    initialChatId && initialMessages.length
      ? initialChats.map((c) => (c.id === initialChatId ? { ...c, messages: initialMessages } : c))
      : initialChats.length
        ? initialChats
        : INITIAL_CHATS,
  )
  const [currentChatId, setCurrentChatId] = useState<string>(initialChatId || "")
  const [isTyping, setIsTyping] = useState(false)
  const [serverChatId, setServerChatId] = useState<string>(initialChatId || "")
  const [userId, setUserId] = useState<string>("")

  const supabase = useMemo(() => createClient(), [])

  // Load chats on mount if none provided
  useEffect(() => {
    const load = async () => {
      // Ensure we know the authed user id for client-side inserts
      try {
        const { data: u } = await supabase.auth.getUser()
        if (u?.user?.id) setUserId(u.user.id)
      } catch {}

      if (chats.length === 0) {
        const { data, error } = await supabase
          .from("chats")
          .select("id, title, created_at, updated_at")
          .order("updated_at", { ascending: false })
        if (error) {
          // eslint-disable-next-line no-console
          console.error("Failed to load chats", error)
          return
        }
        const mapped: Chat[] = (data || []).map((c) => ({
          id: c.id as string,
          title: (c.title as string) || "New Chat",
          messages: [],
          createdAt: new Date(c.created_at as string),
        }))
        setChats(mapped)
        if (mapped[0]?.id) {
          setCurrentChatId(mapped[0].id)
          setServerChatId(mapped[0].id)
          await loadMessages(mapped[0].id)
        }
      }
    }
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadMessages = async (chatId: string) => {
    const { data, error } = await supabase
      .from("messages")
      .select("id, role, content, created_at")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true })
    if (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to load messages", error)
      return
    }
    const msgs: Message[] = (data || []).map((m) => ({
      id: m.id as string,
      role: (m.role as "user" | "assistant" | "system" | "tool") === "assistant" ? "assistant" : "user",
      content: m.content as string,
      timestamp: new Date(m.created_at as string),
    }))
    setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, messages: msgs } : c)))
  }

  const currentChat = chats.find((chat) => chat.id === currentChatId)

  // Load messages when switching chats
  useEffect(() => {
    if (currentChatId) {
      setServerChatId(currentChatId)
      void loadMessages(currentChatId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChatId])

  const handleNewChat = async () => {
    const { data, error } = userId
      ? await supabase
          .from("chats")
          .insert({ title: "New Chat", user_id: userId })
          .select("id, title, created_at")
          .single()
      : { data: null, error: new Error("No user id available") as any }
    if (error || !data) {
      // eslint-disable-next-line no-console
      console.error("Failed to create chat", error)
      // Fallback to local-only chat if needed
      const local: Chat = {
        id: generateId(),
        title: "New Chat",
        messages: [],
        createdAt: new Date(),
      }
      setChats([local, ...chats])
      setCurrentChatId(local.id)
      setServerChatId("")
      return
    }
    const created: Chat = {
      id: data.id as string,
      title: (data.title as string) || "New Chat",
      messages: [],
      createdAt: new Date(data.created_at as string),
    }
    setChats((prev) => [created, ...prev])
    setCurrentChatId(created.id)
    setServerChatId(created.id)
  }

  const handleSendQuestion = async (question: string) => {
    let activeChat = currentChat
    if (!activeChat) {
      // Create chat in DB if none selected
      const { data, error } = userId
        ? await supabase
            .from("chats")
            .insert({ title: "New Chat", user_id: userId })
            .select("id, title, created_at")
            .single()
        : { data: null, error: new Error("No user id available") as any }
      const createdId = data?.id as string | undefined
      activeChat = {
        id: createdId || generateId(),
        title: (data?.title as string) || "New Chat",
        messages: [],
        createdAt: new Date((data?.created_at as string) || Date.now()),
      }
      setChats([activeChat, ...chats])
      setCurrentChatId(activeChat.id)
      if (createdId) setServerChatId(createdId)
    }

    const timestamp = new Date()
    const userMessage: Message = {
      id: generateId(),
      role: "user",
      content: question,
      timestamp,
    }

    const updatedMessages = [...(activeChat?.messages ?? []), userMessage]

    setChats((prevChats) =>
      prevChats.map((chat) => {
        if (chat.id === (activeChat?.id ?? currentChatId)) {
          const isFirst = chat.messages.length === 0
          const nextTitle = isFirst ? question.slice(0, 30) + (question.length > 30 ? "..." : "") : chat.title
          // Persist title on first message
          if (isFirst) {
            void supabase.from("chats").update({ title: nextTitle }).eq("id", chat.id)
          }
          return {
            ...chat,
            messages: updatedMessages,
            title: nextTitle,
          }
        }
        return chat
      }),
    )

    setIsTyping(true)

    try {
      const historyPayload = updatedMessages.map((message) => ({ role: message.role, content: message.content }))
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        // Only send chatId if we know the server-side id
        body: JSON.stringify({ question, history: historyPayload, chatId: serverChatId || undefined }),
      })

      const responseText = await response.text()
      let parsed: unknown

      try {
        parsed = JSON.parse(responseText)
      } catch {
        parsed = null
      }

      if (!response.ok) {
        const errorMessage =
          typeof parsed === "object" && parsed !== null && "error" in parsed && typeof (parsed as { error: unknown }).error === "string"
            ? (parsed as { error: string }).error
            : "The workflow gateway returned an error."
        throw new Error(errorMessage)
      }

      const replyText =
        typeof parsed === "object" && parsed !== null && "reply" in parsed && typeof (parsed as { reply: unknown }).reply === "string"
          ? (parsed as { reply: string }).reply
          : responseText

      const assistantMessage: Message = {
        id: generateId(),
        role: "assistant",
        content: replyText,
        timestamp: new Date(),
      }

      setChats((prevChats) =>
        prevChats.map((chat) =>
          chat.id === (activeChat?.id ?? currentChatId)
            ? {
                ...chat,
                messages: [...chat.messages, assistantMessage],
              }
            : chat,
        ),
      )

      // Capture server chat id if provided
      try {
        const parsedJson = typeof parsed === "object" && parsed !== null ? (parsed as any) : null
        const returnedChatId = parsedJson?.chatId
        if (typeof returnedChatId === "string" && returnedChatId) {
          setServerChatId(returnedChatId)
        }
      } catch {}

      // Reload messages from DB using the server chat id if available
      const idToLoad = (typeof parsed === "object" && parsed !== null && (parsed as any).chatId) || serverChatId
      if (typeof idToLoad === "string" && idToLoad) {
        void loadMessages(idToLoad)
      }
    } catch (error) {
      const fallbackMessage =
        error instanceof Error ? `Sorry, something went wrong: ${error.message}` : "Sorry, something went wrong."

      const assistantMessage: Message = {
        id: generateId(),
        role: "assistant",
        content: fallbackMessage,
        timestamp: new Date(),
      }

      setChats((prevChats) =>
        prevChats.map((chat) =>
          chat.id === (activeChat?.id ?? currentChatId)
            ? {
                ...chat,
                messages: [...chat.messages, assistantMessage],
              }
            : chat,
        ),
      )
    } finally {
      setIsTyping(false)
    }
  }

  const handleDeleteChat = (chatId: string) => {
    const run = async () => {
      try {
        await supabase.from("chats").delete().eq("id", chatId)
      } catch {}
      const updatedChats = chats.filter((chat) => chat.id !== chatId)
      setChats(updatedChats)
      if (currentChatId === chatId && updatedChats.length > 0) {
        setCurrentChatId(updatedChats[0].id)
        setServerChatId(updatedChats[0].id)
        void loadMessages(updatedChats[0].id)
      } else if (updatedChats.length === 0) {
        setCurrentChatId("")
        setServerChatId("")
      }
    }
    void run()
  }

  return (
    <div className="flex h-screen bg-background dark">
      <ChatSidebar
        chats={chats}
        currentChatId={currentChatId}
        onSelectChat={setCurrentChatId}
        onNewChat={handleNewChat}
        onDeleteChat={handleDeleteChat}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        userName={user?.name}
        userEmail={user?.email}
        avatarUrl={user?.avatarUrl}
      />

      <div className="flex flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-border bg-background px-4 py-3 lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)}>
            <Menu className="h-5 w-5" />
          </Button>
          <h1 className="flex-1 truncate font-semibold text-foreground">{currentChat?.title || "New Chat"}</h1>
          <ThemeToggle />
        </header>

        <ChatMessages messages={currentChat?.messages || []} isTyping={isTyping} />

        <ChatInput onSendQuestion={handleSendQuestion} />
      </div>
    </div>
  )
}
