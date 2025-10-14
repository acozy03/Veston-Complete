"use client"

import { useEffect, useRef } from "react"
import { ScrollArea } from "./ui/scroll-area"
import { cn } from "@/lib/utils"
import type { Message } from "./chat-interface"
import { Bot, User } from "lucide-react"

interface ChatMessagesProps {
  messages: Message[]
  isTyping: boolean
}

export function ChatMessages({ messages, isTyping }: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" })
  }, [messages.length, isTyping])

  return (
    <ScrollArea className="flex-1">
      <div className="mx-auto w-full max-w-5xl px-6 py-10">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-accent">
              <Bot className="h-10 w-10 text-accent-foreground" />
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
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent">
                    <Bot className="h-7 w-7 text-accent-foreground" />
                  </div>
                )}

                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-5 py-4",
                    message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  <p className="whitespace-pre-wrap text-base leading-relaxed">{message.content}</p>
                </div>

                {message.role === "user" && (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary">
                    <User className="h-7 w-7 text-primary-foreground" />
                  </div>
                )}
              </div>
            ))}

            {isTyping && (
              <div className="flex gap-5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent">
                  <Bot className="h-7 w-7 text-accent-foreground" />
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