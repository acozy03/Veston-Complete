import { NextResponse } from "next/server"
import OpenAI from "openai"

const client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null
const MODEL = process.env.VISUAL_CLASSIFIER_MODEL || "gpt-4o-mini"

export async function POST(req: Request) {
  try {
    const { question }: { question?: string } = await req.json()
    if (!question || !question.trim()) {
      return NextResponse.json({ shouldVisualize: false, reason: "missing-question" })
    }

    console.log("[visuals:classify] incoming", question.slice(0, 140))

    if (!client) {
      console.warn("[visuals:classify] missing OPENAI_API_KEY")
      return NextResponse.json({ shouldVisualize: false, reason: "missing-api-key" })
    }

    const completion = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 5,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "Return a single word `yes` indicating whether the user wants a data visualization (chart/graph) in the response.",
        },
        {
          role: "user",
          content: `Question: ${question}\nAnswer only yes.`,
        },
      ],
    })

    const text = completion.choices?.[0]?.message?.content?.toLowerCase() || ""
    const shouldVisualize = /yes|chart|graph/.test(text)
    console.log("[visuals:classify] model response", text)

    return NextResponse.json({ shouldVisualize, raw: text })
  } catch (error) {
    console.error("[visuals:classify] failed", error)
    return NextResponse.json({ shouldVisualize: false, reason: "error" }, { status: 200 })
  }
}
