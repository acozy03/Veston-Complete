import { VertexAI } from "@google-cloud/vertexai"
import { NextResponse } from "next/server"

const project = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || "veston-complete"
const location = process.env.GCP_LOCATION || "us-central1"
const MODEL = process.env.CHAT_TITLE_MODEL || "gemini-2.5-flash"
const TIMEOUT_MS = Number(process.env.CHAT_TITLE_TIMEOUT_MS || 8000)

const vertexAI = new VertexAI({ project, location })
const model = vertexAI.getGenerativeModel({ model: MODEL })

const buildFallbackTitle = (value?: string) => {
  if (value && value.trim()) {
    const trimmed = value.trim()
    return trimmed.length > 50 ? `${trimmed.slice(0, 50)}...` : trimmed
  }
  return "New Chat"
}

export async function POST(req: Request) {
  const { message, fallback }: { message?: string; fallback?: string } = await req.json().catch(() => ({}))
  const baseTitle = buildFallbackTitle(fallback || message)

  if (!message || !message.trim()) {
    return NextResponse.json({ title: baseTitle, reason: "missing-message" })
  }

  try {
    const completionPromise = model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: [
                "Create a concise, human-friendly chat title (max 8 words) for the first user message.",
                "Return only the title text without quotes or punctuation at the end.",
                `Message: ${message}`,
              ].join("\n"),
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.4,
      },
    })

    const completion = await Promise.race([
      completionPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS)),
    ])

    const text =
      (completion as any)?.response?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || "").join("")?.trim() ||
      ""
    const candidate = buildFallbackTitle(text || message)

    return NextResponse.json({ title: candidate })
  } catch (error) {
    console.error("[chat:title] failed", error)
    return NextResponse.json({ title: baseTitle, reason: "unavailable" }, { status: 200 })
  }
}
