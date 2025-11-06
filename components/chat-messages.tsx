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

  const formatTimestamp = (d?: Date) => {
    if (!d || !(d instanceof Date) || Number.isNaN(d.getTime())) return ""
    const now = new Date()
    const isToday = d.toDateString() === now.toDateString()
    const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(d)
    return isToday ? time : `${time} • ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(d)}`
  }

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

                <div className={cn("max-w-[85%] flex flex-col gap-2", message.role === "user" ? "items-end" : "items-start")}>

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
                        a: ({ node, href, children, ...props }) => {
                          const url = typeof href === 'string' ? href : ''
                          const isXlsx = /\.xlsx(\?|$)/i.test(url) || /filename=.*\.xlsx/i.test(url) || /application%2Fvnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/i.test(url)
                          if (isXlsx && url) {
                            const previewUrl = `/preview/xlsx?src=${encodeURIComponent(url)}`
                            const downloadUrl = `/api/proxy-file?src=${encodeURIComponent(url)}&download=1`
                            return (
                              <span>
                                <a href={previewUrl} target="_blank" rel="noopener noreferrer" {...props}>Open preview</a>
                                <span> · </span>
                                <a href={downloadUrl} rel="noopener noreferrer">Download</a>
                              </span>
                            )
                          }
                          return <a href={url} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>
                        },
                        p: ({ node, ...props }) => (
                          <p className="whitespace-pre-wrap" {...props} />
                        ),
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>
                </div>

                {message.role === "assistant" && message.sources && message.sources.length > 0 && (
                  <div className={cn(
                    "w-full rounded-xl border border-border/50 bg-background/40 p-3 text-sm",
                    message.role === "user" ? "text-primary-foreground" : "text-foreground",
                  )}>
                    <div className="mb-2 font-medium opacity-80">Sources</div>
                    <ul className="space-y-1">
                      {message.sources.map((s, idx) => {
                        const label = s.title || s.url
                        return (
                          <li key={s.url + idx} className="truncate">
                            <a
                              className="underline underline-offset-2 hover:opacity-80"
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={s.title || s.url}
                            >
                              {label}
                            </a>
                            {typeof s.score === 'number' && (
                              <span className="ml-2 text-xs text-muted-foreground">({s.score.toFixed(2)})</span>
                            )}
                            {s.snippet && (
                              <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{s.snippet}</div>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}

                {message.timestamp && (
                  <div
                    className={cn(
                      "mt-1 text-xs text-muted-foreground opacity-70",
                      message.role === "user" ? "text-right" : "text-left",
                    )}
                  >
                    {formatTimestamp(message.timestamp)}
                  </div>
                )}
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
