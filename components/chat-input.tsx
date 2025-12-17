"use client"

import type React from "react"

import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import { Button } from "./ui/button"
import { Textarea } from "./ui/textarea"
import { Send, Plus, Square } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "./ui/dropdown-menu"
import { cn } from "@/lib/utils"

interface ChatInputProps {
  onSendQuestion: (question: string) => void
  mode: "fast" | "slow"
  onChangeMode: (mode: "fast" | "slow") => void
  radmapping: boolean
  RAG: boolean
  isTyping: boolean
  onCancel: () => void
  onToggleWorkflow: (name: "radmapping" | "RAG", value: boolean) => void
  hero?: boolean
  placeholder?: string
  focusSignal?: number
}

export function ChatInput({
  onSendQuestion,
  mode,
  onChangeMode,
  radmapping,
  RAG,
  isTyping,
  onCancel,
  onToggleWorkflow,
  hero = false,
  placeholder,
  focusSignal,
}: ChatInputProps) {
  const [question, setQuestion] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Shared sizing tokens so the textarea + icon buttons always match
  const HERO_H = "h-14"
  const HERO_W = "w-14"
  const HERO_RADIUS = "rounded-xl"

  // Non-hero: make icon buttons match a 40px input
  const BASE_ICON = "h-11 w-11"

  useEffect(() => {
    if (focusSignal === undefined) return
    textareaRef.current?.focus()
  }, [focusSignal])

  const resetTextareaHeight = () => {
    if (!textareaRef.current) return
    textareaRef.current.style.height = "auto"
  }

  const handleSend = () => {
    if (question.trim()) {
      onSendQuestion(question.trim())
      setQuestion("")
      resetTextareaHeight()
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setQuestion(e.target.value)

    // Auto-grow with a hard max
    e.target.style.height = "auto"
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`
  }

  return (
    <div className={cn(hero ? "p-0" : "border-t border-border bg-background p-4")}>
      <div className={cn("mx-auto", "max-w-3xl")}>
        {/* items-center makes the 40px buttons + 40px textarea line up perfectly */}
        <div className="relative flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className={cn(
                  "shrink-0 flex items-center justify-center",
                  hero ? `${HERO_H} ${HERO_W} ${HERO_RADIUS}` : BASE_ICON,
                )}
                title="Options"
              >
                <Plus className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>Reasoning</DropdownMenuLabel>
              <div className="p-1">
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault()
                    onChangeMode("fast")
                  }}
                  className={cn("cursor-pointer", mode === "fast" && "bg-accent text-accent-foreground")}
                >
                  Low (Fast)
                </DropdownMenuItem>

                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault()
                    onChangeMode("slow")
                  }}
                  className={cn("cursor-pointer", mode === "slow" && "bg-accent text-accent-foreground")}
                >
                  High (Slow)
                </DropdownMenuItem>
              </div>

              <DropdownMenuSeparator />

              <DropdownMenuLabel>Workflows</DropdownMenuLabel>
              <div className="p-1">
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault()
                    onToggleWorkflow("radmapping", !radmapping)
                  }}
                  className={cn("cursor-pointer", radmapping && "bg-accent text-accent-foreground")}
                >
                  RadMapping+
                </DropdownMenuItem>

                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault()
                    onToggleWorkflow("RAG", !RAG)
                  }}
                  className={cn("cursor-pointer", RAG && "bg-accent text-accent-foreground")}
                >
                  Data Analysis
                </DropdownMenuItem>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <Textarea
            ref={textareaRef}
            value={question}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={placeholder || "Ask away..."}
            rows={1}
            className={cn(
              "w-full flex-1 max-h-[200px] resize-none bg-input text-foreground placeholder:text-muted-foreground",
              // non-hero: explicitly 40px tall so it matches BASE_ICON
              "h-11 min-h-0 rounded-md px-3 py-2 leading-6",
              // hero: 56px tall + visually centered single-line text
              hero && `${HERO_H} min-h-0 ${HERO_RADIUS} px-4 py-0 text-base leading-[3.5rem]`,
            )}
          />

          {isTyping ? (
            <Button
              type="button"
              onClick={onCancel}
              size="icon"
              variant="outline"
              className={cn(
                "shrink-0 flex items-center justify-center",
                hero ? `${HERO_H} ${HERO_W} ${HERO_RADIUS}` : BASE_ICON,
              )}
              title="Stop"
            >
              <Square className="h-5 w-5" />
            </Button>
          ) : (
            <Button
              onClick={handleSend}
              disabled={isTyping || !question.trim()}
              size="icon"
              className={cn(
                "shrink-0 flex items-center justify-center bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50",
                hero ? `${HERO_H} ${HERO_W} ${HERO_RADIUS}` : BASE_ICON,
              )}
              title="Send"
            >
              <Send className="h-5 w-5" />
            </Button>
          )}
        </div>

        {!hero && (
          <p className="mt-2 text-center text-xs text-muted-foreground/80">
            {mode === "slow" ? "High (Slow)" : "Low (Fast)"}
            {" • "}
            {RAG ? "Data Analysis" : radmapping ? "RadMapping+" : "Workflow: None"}
          </p>
        )}
      </div>
    </div>
  )
}
