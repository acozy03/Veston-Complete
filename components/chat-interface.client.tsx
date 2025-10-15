"use client"

import dynamic from "next/dynamic"
import type ChatInterfaceDefault from "./chat-interface"

// Client-only wrapper to avoid SSR for the interactive chat tree.
// Helps prevent hydration mismatches when extensions mutate the DOM
// before React hydrates (e.g., inject attributes into inputs/buttons).
const ClientChatInterface = dynamic(() => import("./chat-interface"), {
  ssr: false,
  loading: () => <div className="min-h-[50vh]" />,
}) as typeof ChatInterfaceDefault

export default ClientChatInterface

