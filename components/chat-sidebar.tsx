"use client"

import Image from "next/image"
import { useState } from "react"
import { Button } from "./ui/button"
import { ScrollArea } from "./ui/scroll-area"
import { Input } from "./ui/input"
import { Plus, X, Search, MoreHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Chat } from "./chat-interface"
import { ThemeToggle } from "./theme-toggle"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"

interface ChatSidebarProps {
  chats: Chat[]
  currentChatId: string
  onSelectChat: (chatId: string) => void
  onNewChat: () => void
  onDeleteChat: (chatId: string) => void
  isOpen: boolean
  onToggle: () => void
  userName?: string
  userEmail?: string
  avatarUrl?: string
}

function searchInChat(chat: Chat, query: string): { matches: boolean; snippet?: string } {
  const lowerQuery = query.toLowerCase()

  if (chat.title.toLowerCase().includes(lowerQuery)) {
    return { matches: true, snippet: chat.preview }
  }

  if (chat.preview && chat.preview.toLowerCase().includes(lowerQuery)) {
    return { matches: true, snippet: chat.preview }
  }

  return { matches: false }
}

export function ChatSidebar({
  chats,
  currentChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  isOpen,
  onToggle,
  userName = "",
  userEmail = "",
  avatarUrl = "",
}: ChatSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("")
  

  const filteredChats = chats
    .map((chat) => {
      const searchResult = searchInChat(chat, searchQuery)
      return { chat, ...searchResult }
    })
    .filter((result) => !searchQuery || result.matches)

  return (
    <>
      {isOpen && <div className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden" onClick={onToggle} />}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-200 lg:relative lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-sidebar-border p-4">
          <div className="flex items-center gap-2">
  
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold uppercase tracking-wide text-sidebar-foreground">Veston</span>
              <span className="text-xs text-sidebar-foreground/70">Vesta Chatbot</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={onToggle}>
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className="p-3">
          <Button
            onClick={onNewChat}
            className="w-full justify-start gap-2 bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90"
          >
            <Plus className="h-4 w-4" />
            New Chat
          </Button>
        </div>

        <div className="px-3 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sidebar-foreground/40" />
            <Input
              type="text"
              placeholder="Search chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-full bg-sidebar-accent pl-9 text-sm text-sidebar-foreground placeholder:text-sidebar-foreground/40 focus-visible:ring-1 focus-visible:ring-sidebar-ring"
            />
          </div>
        </div>

        <ScrollArea className="flex-1 px-3">
          <div className="space-y-1 pb-4">
            {filteredChats.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-sidebar-foreground/60">
                {searchQuery ? "No chats found" : "No chats yet"}
              </p>
            ) : (
              filteredChats.map(({ chat, snippet }) => (
                <div
                  key={chat.id}
                  className={cn(
                    "flex w-[14rem] items-center rounded-lg px-2 pr-2 py-2 text-sm transition-colors hover:bg-sidebar-accent",
                    currentChatId === chat.id && "bg-sidebar-accent",
                  )}
                >
                  <button
                    onClick={() => onSelectChat(chat.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="min-w-0">
                      <div className="min-w-0">
                        <span className="block truncate text-sidebar-foreground">{chat.title}</span>
                      </div>
                      {(snippet || chat.preview) && (
                        <p className="block truncate text-xs text-sidebar-foreground/50">{snippet || chat.preview}</p>
                      )}
                    </div>
                  </button>
                  <div className="ml-1 shrink-0">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Chat actions"
                          className="h-5 w-5 rounded-md p-0 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-transparent"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" sideOffset={6} onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem
                          className="text-sidebar-foreground/70 hover:text-red-500 focus:text-red-500"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            onDeleteChat(chat.id)
                          }}
                        >
                          Delete chat
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        <div className="border-t border-sidebar-border p-4">
          <div className="flex items-center gap-3">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={userName || userEmail || "User"}
                width={32}
                height={32}
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-accent text-sm font-medium text-sidebar-accent-foreground">
                {(userName || userEmail || "U").slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-sm font-medium text-sidebar-foreground">{userName || ""}</p>
              <p className="truncate text-xs text-sidebar-foreground/60">{userEmail || ""}</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}
