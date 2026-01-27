"use client"

import dynamic from "next/dynamic"
import type ChatInterfaceDefault from "./chat-interface"

const ClientChatInterface = dynamic(() => import("./chat-interface"), {
  ssr: false,
  loading: () => <div className="min-h-[50vh]" />,
}) as typeof ChatInterfaceDefault

export default ClientChatInterface

