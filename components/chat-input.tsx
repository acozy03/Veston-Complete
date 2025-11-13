"use client"

import type React from "react"

import { useState, useRef, type KeyboardEvent } from "react"
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
  reportSearch: boolean
  itSupportDocuments: boolean
  isTyping: boolean
  onCancel: () => void
  onToggleWorkflow: (
    name: "radmapping" | "reportSearch" | "itSupportDocuments",
    value: boolean,
  ) => void
}

export function ChatInput({
  onSendQuestion,
  mode,
  onChangeMode,
  radmapping,
  reportSearch,
  itSupportDocuments,
  isTyping,
  onCancel,
  onToggleWorkflow,
}: ChatInputProps) {
  const [question, setQuestion] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = () => {
    if (question.trim()) {
      onSendQuestion(question.trim())
      setQuestion("")
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto"
      }
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
    e.target.style.height = "auto"
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`
  }

  return (
    <div className="border-t border-border bg-background p-4">
      <div className="mx-auto max-w-3xl">
        <div className="relative flex items-end gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="mb-2 shrink-0"
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
                  className={cn(
                    "cursor-pointer",
                    mode === "fast" && "bg-accent text-accent-foreground",
                  )}
                >
                  Low (Fast)
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault()
                    onChangeMode("slow")
                  }}
                  className={cn(
                    "cursor-pointer",
                    mode === "slow" && "bg-accent text-accent-foreground",
                  )}
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
                  className={cn(
                    "cursor-pointer",
                    radmapping && "bg-accent text-accent-foreground",
                  )}
                >
                  Radmapping
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault()
                    onToggleWorkflow("reportSearch", !reportSearch)
                  }}
                  className={cn(
                    "cursor-pointer",
                    reportSearch && "bg-accent text-accent-foreground",
                  )}
                >
                  Report Search
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault()
                    onToggleWorkflow("itSupportDocuments", !itSupportDocuments)
                  }}
                  className={cn(
                    "cursor-pointer",
                    itSupportDocuments && "bg-accent text-accent-foreground",
                  )}
                >
                  IT Support Documents
                </DropdownMenuItem>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          <Textarea
            ref={textareaRef}
            value={question}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Ask Veston your question..."
            className="min-h-[52px] max-h-[200px] resize-none bg-input text-foreground placeholder:text-muted-foreground"
            rows={1}
          />

          {isTyping ? (
            <Button
              type="button"
              onClick={onCancel}
              size="icon"
              variant="outline"
              className="mb-2 shrink-0"
              title="Stop"
            >
              <Square className="h-5 w-5" />
            </Button>
          ) : (
            <Button
              onClick={handleSend}
              disabled={isTyping || !question.trim()}
              size="icon"
              className="mb-2 shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Send className="h-5 w-5" />
            </Button>
          )}
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground/80">
          {mode === "slow" ? "High (Slow)" : "Low (Fast)"}
          {" • "}
          {radmapping ? "Radmapping" : reportSearch ? "Report Search" : itSupportDocuments ? "IT Support Documents" : "Workflow: None"}
        </p>
      </div>
    </div>
  )
}
