import { NextResponse } from "next/server"
import OpenAI from "openai"
import { prepareChartSpecs, stringifyForPrompt } from "@/lib/visualization"

const client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null
const MODEL = process.env.VISUAL_GENERATOR_MODEL || "gpt-4o-mini"

export async function POST(req: Request) {
  try {
    const { question, answer, raw, preview }: { question?: string; answer?: string; raw?: unknown; preview?: string } =
      await req.json()

    if (!question || !answer) {
      return NextResponse.json({ charts: [], reason: "missing-context" })
    }

    console.log("[visuals:generate] incoming", { question: question.slice(0, 140), hasRaw: Boolean(raw) })

    if (!client) {
      console.warn("[visuals:generate] missing OPENAI_API_KEY")
      return NextResponse.json({ charts: [], reason: "missing-api-key" })
    }

    const promptContext = preview || stringifyForPrompt(raw, 3000)

    const completion = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You create concise JSON chart specs for Recharts with keys: charts (array).",
            "Each chart has id, type (line|bar|area|pie|sankey), title, description, data (array of objects), xKey, yKeys (array of {key,label,color}), categoryKey, valueKey.",
            "Sankey charts instead use nodes (array of {id,name,color}) and links (array of {source,target,value,color}) to describe flows.",
            "When type is sankey, do not include data/xKey/yKeys/categoryKey/valueKey; provide only nodes and links.",
            "Each sankey node needs a unique string id and name; every link must reference those ids exactly (never indexes or labels) and must include a numeric value.",
            "Drop any link that points to a missing node; always return at least two nodes for a sankey chart.",
            'Example sankey: {"charts":[{"id":"accession-flow","type":"sankey","title":"Accession flow","nodes":[{"id":"source","name":"Source"},{"id":"lab","name":"Lab"},{"id":"archive","name":"Archive"}],"links":[{"source":"source","target":"lab","value":120},{"source":"lab","target":"archive","value":95}]}]}',
            "Always provide a distinct hex color for every yKeys entry. Only include data you can derive from the provided context.",
          ].join(" "),
        },
        {
          role: "user",
          content: `User question: ${question}\nAssistant reply: ${answer}\nContext: ${promptContext || "(none)"}`,
        },
      ],
    })

    const content = completion.choices?.[0]?.message?.content || "{}"
    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch (error) {
      console.warn("[visuals:generate] failed to parse model output", error)
      parsed = null
    }

    const charts = prepareChartSpecs((parsed as any)?.charts || (parsed as any)?.visualizations)
    console.log("[visuals:generate] charts prepared", charts.length)
    console.log("[visuals:generate] raw model output", charts)
    return NextResponse.json({ charts })
  } catch (error) {
    console.error("[visuals:generate] failed", error)
    return NextResponse.json({ charts: [], reason: "error" }, { status: 200 })
  }
}
