"use client"

import type React from "react"

import { useState, useRef, type KeyboardEvent } from "react"
import { Button } from "./ui/button"
import { Textarea } from "./ui/textarea"
import { Send, Paperclip } from "lucide-react"

interface ChatInputProps {
  onSendQuestion: (question: string) => void
}

export function ChatInput({ onSendQuestion }: ChatInputProps) {
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
          <Button variant="ghost" size="icon" className="mb-2 shrink-0 text-muted-foreground hover:text-foreground">
            <Paperclip className="h-5 w-5" />
          </Button>

          <Textarea
            ref={textareaRef}
            value={question}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Ask Veston your question..."
            className="min-h-[52px] max-h-[200px] resize-none bg-input text-foreground placeholder:text-muted-foreground"
            rows={1}
          />

          <Button
            onClick={handleSend}
            disabled={!question.trim()}
            size="icon"
            className="mb-2 shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Press Enter to send, Shift + Enter for new line
        </p>
      </div>
    </div>
  )
}