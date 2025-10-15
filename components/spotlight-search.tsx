"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Chat } from "./chat-interface"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "./ui/command"

type SpotlightSearchProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  chats: Chat[]
  onSelectChat: (chatId: string) => void
}

type MessageHit = {
  id: string
  chat_id: string
  content: string
  created_at?: string
}

export function SpotlightSearch({ open, onOpenChange, chats, onSelectChat }: SpotlightSearchProps) {
  const [query, setQuery] = useState("")
  const [messageHits, setMessageHits] = useState<MessageHit[]>([])
  const [loading, setLoading] = useState(false)

  const supabase = useMemo(() => createClient(), [])
  const chatIds = useMemo(() => chats.map((c) => c.id), [chats])

  // Keyboard shortcut: Ctrl/Cmd+K to open
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        console.log("[Spotlight] Shortcut pressed: opening palette")
        onOpenChange(true)
      }
    }
    window.addEventListener("keydown", down)
    return () => window.removeEventListener("keydown", down)
  }, [onOpenChange])

  // Debounced search across messages for current chats
  useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (!q) {
      console.log("[Spotlight] Empty query; clearing results")
      setMessageHits([])
      return
    }
    let cancelled = false
    const handle = setTimeout(async () => {
      try {
        setLoading(true)
        console.log("[Spotlight] Searching messages", { q, chatCount: chatIds.length })
        if (chatIds.length === 0) {
          console.log("[Spotlight] No chat IDs available; skipping message search")
          setMessageHits([])
          return
        }
        const queryBuilder = supabase
          .from("messages")
          .select("id, chat_id, content, created_at")
          .in("chat_id", chatIds)
          .ilike("content", `%${q}%`)
          .order("created_at", { ascending: false })

        console.log("[Spotlight] Executing Supabase query (no limit)")
        const { data, error } = await queryBuilder
        if (error) {
          console.error("[Spotlight] Supabase error during search", error)
          throw error
        }
        if (!cancelled) {
          console.log("[Spotlight] Search results", { count: (data || []).length })
          setMessageHits((data || []) as unknown as MessageHit[])
        }
      } catch {
        if (!cancelled) {
          console.log("[Spotlight] Search failed; clearing results")
          setMessageHits([])
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
          console.log("[Spotlight] Search finished")
        }
      }
    }, 200)
    return () => {
      cancelled = true
      console.log("[Spotlight] Debounce cancelled or component unmounted")
      clearTimeout(handle)
    }
  }, [query, open, chatIds, supabase])

  const chatTitleMatches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return [] as Chat[]
    return chats.filter((c) => c.title.toLowerCase().includes(q) || (c.preview?.toLowerCase().includes(q) ?? false)).slice(0, 10)
  }, [query, chats])

  const handleValueChange = (val: string) => {
    setQuery(val)
    console.log("[Spotlight] Query changed", { val })
  }

  return (
    <CommandDialog open={open} onOpenChange={(v) => { console.log("[Spotlight] Dialog open change", { v }); onOpenChange(v) }} title="Search" description="Search chats and messages" showCloseButton shouldFilter={false}>
      <CommandInput placeholder="Search chats and messages..." autoFocus value={query} onValueChange={handleValueChange as any} />
      <CommandList>
        <CommandEmpty>{loading ? "Searching..." : "No results found"}</CommandEmpty>

        {chatTitleMatches.length > 0 && (
          <CommandGroup heading="Chats">
            {chatTitleMatches.map((c) => (
              <CommandItem key={`chat-${c.id}`} onSelect={() => { console.log("[Spotlight] Navigate to chat from title match", { chatId: c.id }); onSelectChat(c.id) }}>
                <span className="truncate">{c.title}</span>
                <CommandShortcut>Enter</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {chatTitleMatches.length > 0 && messageHits.length > 0 && <CommandSeparator />}

        {messageHits.length > 0 && (
          <CommandGroup heading="Messages">
            {messageHits.map((m) => {
              const chat = chats.find((c) => c.id === m.chat_id)
              const title = chat?.title || "Untitled Chat"
              const snippet = (m.content || "").slice(0, 120).replace(/\s+/g, " ") + ((m.content?.length || 0) > 120 ? "…" : "")
              return (
                <CommandItem key={`msg-${m.id}`} onSelect={() => { console.log("[Spotlight] Navigate to chat from message match", { chatId: m.chat_id, messageId: m.id }); onSelectChat(m.chat_id) }}>
                  <div className="min-w-0">
                    <div className="truncate text-foreground">{title}</div>
                    <div className="truncate text-xs text-muted-foreground">{snippet}</div>
                  </div>
                </CommandItem>
              )
            })}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  )
}
