"use client"

import { Children, isValidElement, useEffect, useRef, useState } from "react"
import { ScrollArea } from "./ui/scroll-area"
import { cn } from "@/lib/utils"
import type { Message } from "./chat-interface"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Copy, Check, ImageDown } from "lucide-react"
import { ChartVisualizations } from "./chart-visualizations"

interface ChatMessagesProps {
  messages: Message[]
  isTyping: boolean
  user?: { name?: string; email?: string; avatarUrl?: string }
}

export function ChatMessages({ messages, isTyping }: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" })
  }, [messages.length, isTyping])

  const handleExportChart = async (messageId: string) => {
    if (!messageId) return

    const container = messageRefs.current[messageId]
    if (!container) return

    const chartRoot = container.querySelector("[data-chart-root]") as HTMLElement | null
    if (!chartRoot) return

    const svgs = Array.from(chartRoot.querySelectorAll("svg")) as SVGSVGElement[]
    if (!svgs.length) return

    try {
      const serializer = new XMLSerializer()
      const rootBounds = chartRoot.getBoundingClientRect()
      const width = Math.round(rootBounds.width || chartRoot.clientWidth || chartRoot.scrollWidth || 800)
      const height = Math.round(rootBounds.height || chartRoot.clientHeight || chartRoot.scrollHeight || 400)

      const combinedSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
      combinedSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg")
      combinedSvg.setAttribute("width", `${width}`)
      combinedSvg.setAttribute("height", `${height}`)
      combinedSvg.setAttribute("viewBox", `0 0 ${width} ${height}`)

      const background = getComputedStyle(document.documentElement).getPropertyValue("--background").trim()
      const backgroundRect = document.createElementNS("http://www.w3.org/2000/svg", "rect")
      backgroundRect.setAttribute("width", "100%")
      backgroundRect.setAttribute("height", "100%")
      backgroundRect.setAttribute("fill", background || "#ffffff")
      combinedSvg.appendChild(backgroundRect)

      svgs.forEach((svg) => {
        const rect = svg.getBoundingClientRect()
        const clonedSvg = svg.cloneNode(true) as SVGSVGElement
        clonedSvg.setAttribute("x", `${rect.left - rootBounds.left}`)
        clonedSvg.setAttribute("y", `${rect.top - rootBounds.top}`)
        clonedSvg.setAttribute("width", `${rect.width}`)
        clonedSvg.setAttribute("height", `${rect.height}`)
        combinedSvg.appendChild(clonedSvg)
      })

      const svgString = serializer.serializeToString(combinedSvg)
      const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" })
      const svgUrl = URL.createObjectURL(svgBlob)

      const exportImage = new window.Image()

      await new Promise<void>((resolve, reject) => {
        exportImage.onload = () => resolve()
        exportImage.onerror = (err) => reject(err)
        exportImage.src = svgUrl
      })

      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext("2d")
      if (!ctx) throw new Error("Canvas not supported")

      ctx.drawImage(exportImage, 0, 0, width, height)

      URL.revokeObjectURL(svgUrl)

      const pngUrl = canvas.toDataURL("image/png")
      const link = document.createElement("a")
      link.href = pngUrl
      link.download = `${messageId || "chart"}.png`
      link.click()
    } catch (error) {
      console.error("Failed to export chart", error)
    }
  }

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
          {/** Hide accidental consecutive duplicate user messages visually */}
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
                ref={(el) => {
                  if (message.id) {
                    messageRefs.current[message.id] = el
                  }
                }}
              >
                {message.role === "assistant" ? (
                  <div className="w-full border-b border-border/60 bg-background/60 px-2 py-6 sm:px-0">
                    <div className={cn("markdown text-foreground/90")}> 
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
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
                                  <span className="mx-2 opacity-50">·</span>
                                  <a href={downloadUrl} rel="noopener noreferrer">Download</a>
                                </span>
                              )
                            }
                            return <a href={url} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>
                          },
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
                          code: ({ inline, className, children, ...props }) => {
                            if (!inline) {
                              return (
                                <pre className="markdown-codeblock">
                                  <code className={className} {...props}>{children}</code>
                                </pre>
                              )
                            }
                            return (
                              <code className={cn("markdown-codeinline", className)} {...props}>{children}</code>
                            )
                          },
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>

                    {/** Moved copy button below sources, alongside timestamp */}

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
                        <ChartVisualizations charts={message.visuals} />
                      </div>
                    )}

                    {(message.timestamp || true) && (
                      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground opacity-70">
                        <div>{message.timestamp ? formatTimestamp(message.timestamp) : ''}</div>
                        <div className="flex items-center gap-2">
                          {message.visuals && message.visuals.length > 0 && (
                            <button
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-muted/60"
                              title="Export chart as PNG"
                              onClick={() => message.id && handleExportChart(message.id)}
                            >
                              <ImageDown className="h-3.5 w-3.5" /> Export chart
                            </button>
                          )}
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
                          a: ({ node, href, children, ...props }) => {
                            const url = typeof href === 'string' ? href : ''
                            const isXlsx = /\.xlsx(\?|$)/i.test(url) || /filename=.*\.xlsx/i.test(url) || /application%2Fvnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/i.test(url)
                            if (isXlsx && url) {
                              const previewUrl = `/preview/xlsx?src=${encodeURIComponent(url)}`
                              const downloadUrl = `/api/proxy-file?src=${encodeURIComponent(url)}&download=1`
                              return (
                                <span>
                                  <a href={previewUrl} target="_blank" rel="noopener noreferrer" {...props}>Open preview</a>
                                  <span className="mx-2 opacity-50">·</span>
                                  <a href={downloadUrl} rel="noopener noreferrer">Download</a>
                                </span>
                              )
                            }
                            return <a href={url} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>
                          },
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