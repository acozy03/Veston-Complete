"use client"

import { useState } from "react"
import { ChatSidebar } from "./chat-sidebar"
import { ChatMessages } from "./chat-messages"
import { ChatInput } from "./chat-input"
import { Button } from "./ui/button"
import { Menu } from "lucide-react"
import { ThemeToggle } from "./theme-toggle"

export type Message = {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
}

export type Chat = {
  id: string
  title: string
  messages: Message[]
  createdAt: Date
}

const generateId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`

const INITIAL_CHATS: Chat[] = []

export default function ChatInterface() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [chats, setChats] = useState<Chat[]>(INITIAL_CHATS)
  const [currentChatId, setCurrentChatId] = useState<string>("")
  const [isTyping, setIsTyping] = useState(false)

  const currentChat = chats.find((chat) => chat.id === currentChatId)

  const handleNewChat = () => {
    const newChat: Chat = {
      id: generateId(),
      title: "New Chat",
      messages: [],
      createdAt: new Date(),
    }
    setChats([newChat, ...chats])
    setCurrentChatId(newChat.id)
  }

  const handleSendQuestion = async (question: string) => {
    let activeChat = currentChat
    if (!activeChat) {
      activeChat = {
        id: generateId(),
        title: "New Chat",
        messages: [],
        createdAt: new Date(),
      }
      setChats([activeChat, ...chats])
      setCurrentChatId(activeChat.id)
    }

    const timestamp = new Date()
    const userMessage: Message = {
      id: generateId(),
      role: "user",
      content: question,
      timestamp,
    }

    const updatedMessages = [...(activeChat?.messages ?? []), userMessage]

    setChats((prevChats) =>
      prevChats.map((chat) => {
        if (chat.id === (activeChat?.id ?? currentChatId)) {
          const nextTitle =
            chat.messages.length === 0 ? question.slice(0, 30) + (question.length > 30 ? "..." : "") : chat.title
          return {
            ...chat,
            messages: updatedMessages,
            title: nextTitle,
          }
        }
        return chat
      }),
    )

    setIsTyping(true)

    try {
      const historyPayload = updatedMessages.map((message) => ({ role: message.role, content: message.content }))
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question, history: historyPayload }),
      })

      const responseText = await response.text()
      let parsed: unknown

      try {
        parsed = JSON.parse(responseText)
      } catch {
        parsed = null
      }

      if (!response.ok) {
        const errorMessage =
          typeof parsed === "object" && parsed !== null && "error" in parsed && typeof (parsed as { error: unknown }).error === "string"
            ? (parsed as { error: string }).error
            : "The workflow gateway returned an error."
        throw new Error(errorMessage)
      }

      const replyText =
        typeof parsed === "object" && parsed !== null && "reply" in parsed && typeof (parsed as { reply: unknown }).reply === "string"
          ? (parsed as { reply: string }).reply
          : responseText

      const assistantMessage: Message = {
        id: generateId(),
        role: "assistant",
        content: replyText,
        timestamp: new Date(),
      }

      setChats((prevChats) =>
        prevChats.map((chat) =>
          chat.id === (activeChat?.id ?? currentChatId)
            ? {
                ...chat,
                messages: [...chat.messages, assistantMessage],
              }
            : chat,
        ),
      )
    } catch (error) {
      const fallbackMessage =
        error instanceof Error ? `Sorry, something went wrong: ${error.message}` : "Sorry, something went wrong."

      const assistantMessage: Message = {
        id: generateId(),
        role: "assistant",
        content: fallbackMessage,
        timestamp: new Date(),
      }

      setChats((prevChats) =>
        prevChats.map((chat) =>
          chat.id === (activeChat?.id ?? currentChatId)
            ? {
                ...chat,
                messages: [...chat.messages, assistantMessage],
              }
            : chat,
        ),
      )
    } finally {
      setIsTyping(false)
    }
  }

  const handleDeleteChat = (chatId: string) => {
    const updatedChats = chats.filter((chat) => chat.id !== chatId)
    setChats(updatedChats)
    if (currentChatId === chatId && updatedChats.length > 0) {
      setCurrentChatId(updatedChats[0].id)
    }
  }

  return (
    <div className="flex h-screen bg-background dark">
      <ChatSidebar
        chats={chats}
        currentChatId={currentChatId}
        onSelectChat={setCurrentChatId}
        onNewChat={handleNewChat}
        onDeleteChat={handleDeleteChat}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
      />

      <div className="flex flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-border bg-background px-4 py-3 lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)}>
            <Menu className="h-5 w-5" />
          </Button>
          <h1 className="flex-1 truncate font-semibold text-foreground">{currentChat?.title || "New Chat"}</h1>
          <ThemeToggle />
        </header>

        <ChatMessages messages={currentChat?.messages || []} isTyping={isTyping} />

        <ChatInput onSendQuestion={handleSendQuestion} />
      </div>
    </div>
  )
}
