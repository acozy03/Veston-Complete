"use client"

import { useEffect, useRef } from "react"
import Image from "next/image"
import { ScrollArea } from "./ui/scroll-area"
import { cn } from "@/lib/utils"
import type { Message } from "./chat-interface"
import ReactMarkdown from "react-markdown"

interface ChatMessagesProps {
  messages: Message[]
  isTyping: boolean
  user?: { name?: string; email?: string; avatarUrl?: string }
}

export function ChatMessages({ messages, isTyping, user }: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" })
  }, [messages.length, isTyping])

  return (
    <ScrollArea className="flex-1">
      <div className="mx-auto w-full max-w-5xl px-6 py-10">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-accent overflow-hidden">
              <Image src="/logo.png" alt="Assistant" width={80} height={80} className="h-20 w-20 object-cover" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold text-foreground">How can Veston help you today?</h2>
              <p className="text-muted-foreground">Ask your first question to begin</p>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn("flex gap-5", message.role === "user" ? "justify-end" : "justify-start")}
              >
                {message.role === "assistant" && (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent overflow-hidden">
                    <Image src="/logo.png" alt="Assistant" width={48} height={48} className="h-12 w-12 object-cover" />
                  </div>
                )}

                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-5 py-4",
                    message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  <div className={cn(
                    "text-base leading-relaxed break-words",
                    // Ensure links are legible in both bubbles
                    message.role === "user" ? "[&_a]:underline [&_a]:text-primary-foreground" : "[&_a]:underline [&_a]:text-foreground"
                  )}>
                    <ReactMarkdown
                      components={{
                        a: ({ node, ...props }) => (
                          <a {...props} target="_blank" rel="noopener noreferrer" />
                        ),
                        p: ({ node, ...props }) => (
                          <p className="whitespace-pre-wrap" {...props} />
                        ),
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>
                </div>

                {message.role === "user" && (
                  user?.avatarUrl ? (
                    <Image
                      src={user.avatarUrl}
                      alt={user.name || user.email || "User"}
                      width={48}
                      height={48}
                      className="h-12 w-12 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-lg font-medium">
                      {(user?.name || user?.email || "U").slice(0, 1).toUpperCase()}
                    </div>
                  )
                )}
              </div>
            ))}

            {isTyping && (
              <div className="flex gap-5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent overflow-hidden">
                  <Image src="/logo.png" alt="Assistant" width={48} height={48} className="h-12 w-12 object-cover" />
                </div>
                <div className="flex items-center gap-2 rounded-2xl bg-muted px-5 py-4">
                  <div className="h-3 w-3 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                  <div className="h-3 w-3 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                  <div className="h-3 w-3 animate-bounce rounded-full bg-muted-foreground" />
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </ScrollArea>
  )
}
