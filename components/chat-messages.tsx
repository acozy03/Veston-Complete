"use client"

import {
  Children,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type MouseEvent,
} from "react"
import { ScrollArea } from "./ui/scroll-area"
import { cn } from "@/lib/utils"
import type { Message } from "./chat-interface"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Copy, Check } from "lucide-react"
import { ChartVisualizations } from "./chart-visualizations"
import { ChartVisualizationLoader } from "./chart-visualization-loader"
import { trpc } from "@/lib/trpc-client"

interface ChatMessagesProps {
  messages: Message[]
  isTyping: boolean
  user?: { name?: string; email?: string; avatarUrl?: string }
}

const isXlsxUrl = (url: string) =>
  /\.xlsx(\?|$)/i.test(url) ||
  /filename=.*\.xlsx/i.test(url) ||
  /application%2Fvnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/i.test(url)

const decodeBase64 = (data: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(data)
  const len = binary.length
  const buffer = new ArrayBuffer(len)
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

type MarkdownCodeProps = ComponentPropsWithoutRef<"code"> & { inline?: boolean }

const inferFilename = (url: string, contentType?: string | null) => {
  try {
    const parsed = new URL(url)
    const qpName = parsed.searchParams.get("filename")
    if (qpName) return qpName
    const last = parsed.pathname.split("/").pop()
    if (last) return decodeURIComponent(last)
  } catch {}
  const base = "download"
  if (contentType && contentType.includes("spreadsheetml")) return `${base}.xlsx`
  return base
}

const triggerDownload = (bytes: Uint8Array, contentType: string | undefined, filename: string) => {
  const blob = new Blob([bytes], { type: contentType || "application/octet-stream" })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

function XlsxLinks({ url, linkProps }: { url: string; linkProps?: ComponentPropsWithoutRef<"a"> }) {
  const [error, setError] = useState<string | null>(null)
  const previewUrl = `/preview/xlsx?src=${encodeURIComponent(url)}`
  const downloadQuery = trpc.proxyFile.fetch.useQuery(
    { src: url, download: true },
    { enabled: false, retry: false },
  )

  const handleDownload = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    setError(null)
    const result = await downloadQuery.refetch()
    const payload = result.data
    if (!payload?.data) {
      setError("Download unavailable")
      return
    }
    const bytes = decodeBase64(payload.data)
    const filename = payload.filename || inferFilename(url, payload.contentType)
    triggerDownload(bytes, payload.contentType, filename)
  }

  return (
    <span>
      <a href={previewUrl} target="_blank" rel="noopener noreferrer" {...linkProps}>
        Open preview
      </a>
      <span className="mx-2 opacity-50">·</span>
      <button
        type="button"
        className="underline underline-offset-2 hover:opacity-80 disabled:opacity-50"
        onClick={handleDownload}
        disabled={downloadQuery.isFetching}
      >
        {downloadQuery.isFetching ? "Downloading..." : "Download"}
      </button>
      {error && <span className="ml-2 text-xs text-destructive">{error}</span>}
    </span>
  )
}

function MarkdownLink({ href, children, ...props }: ComponentPropsWithoutRef<"a">) {
  const url = typeof href === "string" ? href : ""
  if (url && isXlsxUrl(url)) {
    return <XlsxLinks url={url} linkProps={props} />
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  )
}

export function ChatMessages({ messages, isTyping }: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" })
  }, [messages.length, isTyping])

  const formatTimestamp = (d?: Date) => {
    if (!d || !(d instanceof Date) || Number.isNaN(d.getTime())) return ""
    const now = new Date()
    const isToday = d.toDateString() === now.toDateString()
    const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(d)
    return isToday
      ? time
      : `${time} · ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(d)}`
  }

  return (
    <ScrollArea className="flex-1">
      <div className="mx-auto w-full max-w-5xl px-6 py-10">
        <div className="space-y-2">
          {messages
            .filter((m, i, arr) => {
              if (i === 0) return true
              const prev = arr[i - 1]
              return !(m.role === prev.role && (m.content || "").trim() === (prev.content || "").trim())
            })
            .map((message) => (
              <div
                key={message.id}
                className="w-full"
              >
                {message.role === "assistant" ? (
                  <div className="w-full border-b border-border/60 bg-background/60 px-2 py-6 sm:px-0">
                    <div className={cn("markdown text-foreground/90")}> 
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
components={{
  a: MarkdownLink,

  p: ({ node, children, ...props }) => {
    const containsPre = Children.toArray(children).some(
      (child) => isValidElement(child) && typeof child.type === "string" && child.type === "pre",
    )
    const Component = containsPre ? "div" : "p"
    return (
      <Component className={cn(containsPre ? undefined : "whitespace-pre-wrap")} {...props}>
        {children}
      </Component>
    )
  },

  pre: ({ node, children, ...props }) => (
    <pre className="markdown-codeblock bg-muted/40" {...props}>
      {children}
    </pre>
  ),

  code: ({ inline, className, children, ...props }: MarkdownCodeProps) => {
    if (inline) {
      return (
        <code className={cn("markdown-codeinline bg-muted/40", className)} {...props}>
          {children}
        </code>
      )
    }
    return (
      <code className={cn(className, "block py-3 px-4")} {...props}>
        {children}
      </code>
    )
  },
}}

                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>

                    {message.sources && message.sources.length > 0 && (
                      <div className="mt-4 w-full rounded-md border border-border/60 bg-background/80 p-3 text-sm">
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

                    {message.visuals && message.visuals.length > 0 && (
                      <div className="mt-4">
                        <ChartVisualizations charts={message.visuals} contextId={message.id} />
                      </div>
                    )}

                    {message.visualStatus === "pending" && (!message.visuals || message.visuals.length === 0) && (
                      <ChartVisualizationLoader className="mt-4" />
                    )}

                    {message.visualStatus === "error" && (
                      <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                        Charts are unavailable right now.
                      </div>
                    )}

                    {(message.timestamp || true) && (
                      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground opacity-70">
                        <div>{message.timestamp ? formatTimestamp(message.timestamp) : ''}</div>
                        <div className="flex items-center gap-2">
                          <button
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-muted/60"
                            title={copiedId === message.id ? "Copied" : "Copy"}
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(message.content || "")
                                setCopiedId(message.id)
                                setTimeout(() => setCopiedId(null), 1500)
                              } catch {}
                            }}
                          >
                            {copiedId === message.id ? (
                              <>
                                <Check className="h-3.5 w-3.5" /> Copied
                              </>
                            ) : (
                              <>
                                <Copy className="h-3.5 w-3.5" /> Copy
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex w-full justify-end py-4">
                    <div className="max-w-[85%]">
                      <div className="w-full rounded-2xl bg-secondary px-4 py-2 text-secondary-foreground">
                        <div className="text-base leading-relaxed break-words [&_a]:underline [&_a]:text-foreground">
                        <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          a: MarkdownLink,
                          p: ({ node, children, ...props }) => {
                            const containsPre = Children.toArray(children).some(
                              (child) => isValidElement(child) && typeof child.type === 'string' && child.type === 'pre',
                            )

                            const Component = containsPre ? 'div' : 'p'

                            return (
                              <Component
                                className={cn(containsPre ? undefined : 'whitespace-pre-wrap')}
                                {...props}
                              >
                                {children}
                              </Component>
                            )
                          },
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                        </div>
                      </div>

                      {message.timestamp && (
                        <div className="mt-1 text-right text-xs text-muted-foreground opacity-70">
                          {formatTimestamp(message.timestamp)}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {isTyping && (
              <div className="w-full border-b border-border/60 bg-background/60 py-6">
                <div className="flex items-center gap-2 px-2 sm:px-0">
                  <div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                  <div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                  <div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground" />
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
      </div>
    </ScrollArea>
  )
}
