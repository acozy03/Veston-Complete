"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import Image from "next/image"
import { ChatSidebar } from "./chat-sidebar"
import { ChatMessages } from "./chat-messages"
import { ChatInput } from "./chat-input"
import { Button } from "./ui/button"
import { Menu } from "lucide-react"
import { ThemeToggle } from "./theme-toggle"
import { createClient } from "@/lib/supabase/client"

export type Source = {
  url: string
  title?: string
  snippet?: string
  score?: number
}

export type Message = {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  sources?: Source[]
}

export type Chat = {
  id: string
  title: string
  messages: Message[]
  createdAt: Date
  preview?: string
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
  const [userEmail, setUserEmail] = useState<string>(user?.email || "")
  const [mode, setMode] = useState<"fast" | "slow">("fast")
  const [radmapping, setRadmapping] = useState<boolean>(false)
  const [RAG, setDataRetrieval] = useState<boolean>(false)
  const [abortController, setAbortController] = useState<AbortController | null>(null)
  const [loadingChatId, setLoadingChatId] = useState<string | null>(null)

  const supabase = useMemo(() => createClient(), [])

  // Hero title options; one picked randomly per load
  const heroTitles = [
    (name?: string) => name ? `Hey, ${name}. Ready to dive in?` : "Hey there. Ready to dive in?",
    (name?: string) => name ? `Hi ${name}, what can I help with?` : "Hi there, what can I help with?",
    () => "What should we figure out today?",
    () => "Ask anything — I’m listening",
    () => "Need answers? Veston is here!",
    () => "How can I assist you today?",
    () => "Ask away — I’ll handle the rest",
    () => "Your AI teammate is ready",
    () => "Veston is always listening...",
    () => "Let’s get something done",
  ] as const
  const [heroTitle, setHeroTitle] = useState<string>("")
  const newlyCreatedChatIds = useRef<Set<string>>(new Set())

  // Load chats on mount if none provided
  useEffect(() => {
    const load = async () => {
      // Ensure we know the authed user id for client-side inserts
      try {
        const { data: u } = await supabase.auth.getUser()
        if (u?.user?.id) setUserId(u.user.id)
        if (u?.user?.email) setUserEmail(u.user.email)
      } catch {}

      if (chats.length === 0) {
        const { data: u2 } = await supabase.auth.getUser()
        const emailForQuery = u2?.user?.email || userEmail || ""
        const { data, error } = await supabase
          .from("chats")
          .select("id, title, created_at, updated_at")
          .eq("user_email", emailForQuery)
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
        // Load a short preview (last message) for each chat to enable search/snippets
        void loadPreviews(mapped)
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

  // Pick a random hero title on mount
  useEffect(() => {
    const idx = Math.floor(Math.random() * heroTitles.length)
    const title = heroTitles[idx](user?.name)
    setHeroTitle(title)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load persisted chat mode preference
  useEffect(() => {
    try {
      const saved = typeof window !== "undefined" ? localStorage.getItem("chatMode") : null
      if (saved === "fast" || saved === "slow") setMode(saved)
    } catch {}
  }, [])

  // Persist chat mode preference
  useEffect(() => {
    try {
      if (typeof window !== "undefined") localStorage.setItem("chatMode", mode)
    } catch {}
  }, [mode])

  const loadPreviews = async (items: Chat[]) => {
    await Promise.all(
      items.map(async (c) => {
        const { data } = await supabase
          .from("messages")
          .select("content, created_at")
          .eq("chat_id", c.id)
          .eq("user_email", userEmail || "")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        if (data?.content) {
          const text = String(data.content)
          const snippet = text.slice(0, 80) + (text.length > 80 ? "..." : "")
          setChats((prev) => prev.map((x) => (x.id === c.id ? { ...x, preview: snippet } : x)))
        }
      }),
    )
  }

  const loadMessages = async (chatId: string) => {
    const { data, error } = await supabase
      .from("messages")
      .select("id, role, content, created_at")
      .eq("chat_id", chatId)
      .eq("user_email", userEmail || "")
      .order("created_at", { ascending: true })
    if (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to load messages", error)
      return
    }

    // Attempt to fetch sources for these messages (if table exists and RLS allows)
    let sourcesByMessage: Record<string, Source[]> = {}
    try {
      const ids = (data || []).map((m) => m.id as string)
      if (ids.length > 0) {
        const { data: srcRows } = await supabase
          .from("message_sources")
          .select("message_id, url, title, snippet, score")
          .in("message_id", ids)
          .eq("chat_id", chatId)
          .eq("user_email", userEmail || "")
        if (Array.isArray(srcRows)) {
          for (const r of srcRows) {
            const mid = String(r.message_id)
            const item: Source = {
              url: String(r.url),
              title: r.title ? String(r.title) : undefined,
              snippet: r.snippet ? String(r.snippet) : undefined,
              score: typeof r.score === 'number' ? r.score : (r.score == null ? undefined : Number(r.score as any)),
            }
            if (!sourcesByMessage[mid]) sourcesByMessage[mid] = []
            sourcesByMessage[mid].push(item)
          }
        }
      }
    } catch {
      // swallow; table may not exist yet or RLS not configured
    }

    const msgs: Message[] = (data || []).map((m) => ({
      id: m.id as string,
      role: (m.role as "user" | "assistant" | "system" | "tool") === "assistant" ? "assistant" : "user",
      content: m.content as string,
      timestamp: new Date(m.created_at as string),
      sources: sourcesByMessage[String(m.id)] || undefined,
    }))
    if (msgs.length > 0) {
      newlyCreatedChatIds.current.delete(chatId)
    }
    // Avoid wiping optimistic local messages if the server hasn't written any yet
    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== chatId) return c
        if (msgs.length === 0 && (c.messages?.length || 0) > 0) {
          return c
        }
        return { ...c, messages: msgs }
      }),
    )
    // Update preview to latest
    const last = msgs[msgs.length - 1]
    if (last) {
      const snippet = last.content.slice(0, 80) + (last.content.length > 80 ? "..." : "")
      setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, preview: snippet } : c)))
    }
  }

  const currentChat = chats.find((chat) => chat.id === currentChatId)
  const hasMessages = (currentChat?.messages?.length || 0) > 0
  const isLoadingCurrentChat = loadingChatId === currentChatId

  // Smooth transition between hero and chat view.
  // - When transitioning from an empty chat to one with messages, we briefly keep the hero
  //   visible while the chat view fades in.
  // - When going back to an empty chat, the hero fades back in while the chat view fades out.
  // A ref is used so overlapping timeouts from rapid chat switches cannot fight over state.
  const [heroExiting, setHeroExiting] = useState(false)
  const heroExitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shouldShowHero = !hasMessages && !heroExiting && !isLoadingCurrentChat

  useEffect(() => {
    // Always cancel any in-flight animation timeout before scheduling a new one.
    if (heroExitTimeoutRef.current) {
      clearTimeout(heroExitTimeoutRef.current)
      heroExitTimeoutRef.current = null
    }

    // If the current chat has no messages, the hero should be fully visible and not "exiting".
    if (!hasMessages) {
      setHeroExiting(false)
      return
    }

    // Current chat has messages: run a one-shot "hero exiting" animation.
    setHeroExiting(true)
    heroExitTimeoutRef.current = setTimeout(() => {
      setHeroExiting(false)
      heroExitTimeoutRef.current = null
    }, 350)

    return () => {
      if (heroExitTimeoutRef.current) {
        clearTimeout(heroExitTimeoutRef.current)
        heroExitTimeoutRef.current = null
      }
    }
  }, [hasMessages])

  // Load messages when switching chats; show spinner only for existing chats
  useEffect(() => {
    if (!currentChatId) {
      setLoadingChatId(null)
      return
    }

    setServerChatId(currentChatId)

    const shouldShowLoader =
      !newlyCreatedChatIds.current.has(currentChatId) &&
      ((currentChat?.messages?.length || 0) === 0)

    if (shouldShowLoader) {
      setLoadingChatId(currentChatId)
    }

    let cancelled = false

    const run = async () => {
      try {
        await loadMessages(currentChatId)
      } finally {
        if (!cancelled) {
          setLoadingChatId((prev) => (prev === currentChatId ? null : prev))
        }
      }
    }

    void run()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChatId])

  const handleNewChat = async () => {
    const { data, error } = userId
      ? await supabase
          .from("chats")
          .insert({ title: "New Chat", user_id: userId, user_email: userEmail || null })
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
      newlyCreatedChatIds.current.add(local.id)
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
    newlyCreatedChatIds.current.add(created.id)
    setChats((prev) => [created, ...prev])
    setCurrentChatId(created.id)
    setServerChatId(created.id)
  }

  const handleSendQuestion = async (question: string) => {
    let activeChat = currentChat
    let requestChatId: string | undefined = serverChatId || undefined
    if (!activeChat) {
      // Create chat in DB if none selected
      const { data, error } = userId
        ? await supabase
            .from("chats")
            .insert({ title: "New Chat", user_id: userId, user_email: userEmail || "" })
            .select("id, title, created_at")
            .single()
        : { data: null, error: new Error("No user id available") as any }
      const createdId = data?.id as string | undefined
      if (createdId) {
        requestChatId = createdId
      }
      activeChat = {
        id: createdId || generateId(),
        title: (data?.title as string) || "New Chat",
        messages: [],
        createdAt: new Date((data?.created_at as string) || Date.now()),
      }
      newlyCreatedChatIds.current.add(activeChat.id)
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

    // Prevent accidental consecutive duplicate sends of the same content
    const last = activeChat?.messages?.[activeChat.messages.length - 1]
    if (last && last.role === "user" && (last.content || "").trim() === question.trim()) {
      // If the previous message is identical, skip adding another local copy
      // The server will still process the existing one
    } else {
      const updatedMessages = [...(activeChat?.messages ?? []), userMessage]

    setChats((prevChats) =>
      prevChats.map((chat) => {
        if (chat.id === (activeChat?.id ?? currentChatId)) {
          const isFirst = chat.messages.length === 0
          const nextTitle = isFirst ? question.slice(0, 30) + (question.length > 30 ? "..." : "") : chat.title
          // Persist title on first message
          if (isFirst) {
            void supabase
              .from("chats")
              .update({ title: nextTitle })
              .eq("id", chat.id)
              .eq("user_email", userEmail || "")
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
    }

    setIsTyping(true)

    try {
      const controller = new AbortController()
      setAbortController(controller)
      const payload = {
        question,
        chatId: requestChatId,
        // Pass selected response speed upstream
        fast: mode === "fast",
        slow: mode === "slow",
        mode,
        // Requested workflows (mutually exclusive)
        radmapping,
        // Data Analysis / RAG
        RAG,
        // Explicit default-case flag for classifier routing
        noWorkflow: !radmapping && !RAG,
      }
      // Client-side debug log for visibility in devtools
      try { console.log("POST /api/chat payload", payload) } catch {}
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        // Only send chatId if we know the server-side id
        body: JSON.stringify(payload),
        signal: controller.signal,
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

      // Extract optional sources array from the response
      const sources: Source[] | undefined =
        typeof parsed === "object" && parsed !== null && Array.isArray((parsed as any).sources)
          ? (parsed as any).sources
              .map((s: any) => ({
                url: typeof s?.url === "string" ? s.url : typeof s?.link === "string" ? s.link : undefined,
                title: typeof s?.title === "string" ? s.title : undefined,
                snippet: typeof s?.snippet === "string" ? s.snippet : undefined,
                score: typeof s?.score === "number" ? s.score : undefined,
              }))
              .filter((s: any) => typeof s.url === "string" && !!s.url)
          : undefined

      const assistantMessage: Message = {
        id: generateId(),
        role: "assistant",
        content: replyText,
        timestamp: new Date(),
        sources,
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

      // Capture server chat id if provided and reconcile local temp chat
      try {
        const parsedJson = typeof parsed === "object" && parsed !== null ? (parsed as any) : null
        const returnedChatId = parsedJson?.chatId as string | undefined
        if (typeof returnedChatId === "string" && returnedChatId) {
          // If we created a local chat first (no server id yet), replace its id with the server id
          const localId = activeChat?.id ?? currentChatId
          if (localId && localId !== returnedChatId) {
            setChats((prev) =>
              prev.map((c) => (c.id === localId ? { ...c, id: returnedChatId } : c)),
            )
            setCurrentChatId(returnedChatId)
          }
          setServerChatId(returnedChatId)
        }
      } catch {}

      // Reload messages from DB using the server chat id if available
      const idToLoad = (typeof parsed === "object" && parsed !== null && (parsed as any).chatId) || serverChatId
      if (typeof idToLoad === "string" && idToLoad) {
        void loadMessages(idToLoad)
      }
    } catch (error) {
      // Swallow aborts silently (user cancelled)
      const message = error instanceof Error ? error.message : String(error)
      const aborted = (error as any)?.name === 'AbortError' || /abort/i.test(message)
      if (aborted) {
        return
      }
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
      try { abortController?.abort() } catch {}
      setAbortController(null)
    }
  }

  const handleCancel = () => {
    try { abortController?.abort() } catch {}
    setIsTyping(false)
    setAbortController(null)
  }

  const handleDeleteChat = (chatId: string) => {
    const run = async () => {
      try {
        await supabase
          .from("chats")
          .delete()
          .eq("id", chatId)
          .eq("user_email", userEmail || "")
      } catch {}
      const updatedChats = chats.filter((chat) => chat.id !== chatId)
      newlyCreatedChatIds.current.delete(chatId)
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
    <div className="flex h-screen min-h-0 bg-background dark">
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

      <div className="flex flex-1 min-h-0 flex-col">
        <header className="flex items-center gap-3 border-b border-border bg-background px-4 py-3 lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)}>
            <Menu className="h-5 w-5" />
          </Button>
          <h1 className="flex-1 truncate font-semibold text-foreground">{currentChat?.title || "New Chat"}</h1>
          <ThemeToggle />
        </header>

        <div className="relative flex flex-1 min-h-0 overflow-y-hidden">
          {/* Chat view (fades in) */}
          <div
            className={cn(
              "flex flex-1 min-h-0 flex-col transition-opacity duration-300",
              hasMessages ? "opacity-100" : "opacity-0 pointer-events-none",
            )}
          >
            <ChatMessages messages={currentChat?.messages || []} isTyping={isTyping} user={user} />
            <ChatInput
              onSendQuestion={handleSendQuestion}
              mode={mode}
              onChangeMode={setMode}
              radmapping={radmapping}
              RAG={RAG}
              isTyping={isTyping}
              onCancel={handleCancel}
              onToggleWorkflow={(name, value) => {
                if (name === "radmapping") {
                  setRadmapping(value)
                  if (value) { setDataRetrieval(false) }
                }
                if (name === "RAG") {
                  setDataRetrieval(value)
                  if (value) { setRadmapping(false) }
                }
              }}
            />
          </div>

          {/* Hero overlay (fades in/out) */}
          <div
            className={cn(
              "absolute inset-0 z-0 transition-opacity duration-200",
              shouldShowHero ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
            )}
          >
            <div className="relative h-full w-full">
              {/* Center the chat bar exactly in the viewport */}
              <div className="absolute left-1/2 top-1/2 w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 px-6">
                <div className="relative">
                  {/* Logo + title sit just above the chat bar */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-6 flex w-full max-w-3xl flex-col items-center gap-4 px-2">
                    <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl bg-accent">
                      <Image src="/logo.png" alt="Veston" width={64} height={64} className="h-16 w-16 object-cover" />
                    </div>
                    <h2 className="max-w-2xl text-center text-2xl font-semibold text-foreground">
                      {heroTitle}
                    </h2>
                  </div>
                  <ChatInput
                    hero
                    placeholder="Ask away..."
                    onSendQuestion={handleSendQuestion}
                    mode={mode}
                    onChangeMode={setMode}
                    radmapping={radmapping}
                    RAG={RAG}
                    isTyping={isTyping}
                    onCancel={handleCancel}
                    onToggleWorkflow={(name, value) => {
                      if (name === "radmapping") {
                        setRadmapping(value)
                        if (value) { setDataRetrieval(false) }
                      }
                      if (name === "RAG") {
                        setDataRetrieval(value)
                        if (value) { setRadmapping(false) }
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {isLoadingCurrentChat && !hasMessages && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background/95 text-muted-foreground transition-opacity duration-200">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-border border-t-transparent" />
              <p className="text-sm font-medium">Loading chat...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
