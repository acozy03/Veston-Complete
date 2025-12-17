import { VertexAI } from "@google-cloud/vertexai"
import { NextResponse } from "next/server"

const project = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || "veston-complete"
const location = process.env.GCP_LOCATION || "us-central1"
const MODEL = process.env.VISUAL_CLASSIFIER_MODEL || "gemini-2.5-flash"

const vertexAI = new VertexAI({ project, location })
const model = vertexAI.getGenerativeModel({ model: MODEL })
console.log(model)

export async function POST(req: Request) {
  try {
    const { question }: { question?: string } = await req.json()
    if (!question || !question.trim()) {
      return NextResponse.json({ shouldVisualize: false, reason: "missing-question" })
    }

    const completion = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: [
                "Return a single word `yes` or `no` indicating whether the user's query facilitates a data visualization (chart/graph) in the response.",
                "This can be through any sort of graph like a pie chart, bar chart, line graph, etc.",
                "The answer should always be 'yes' if the user is asking about an accession number. Most of the time visualizations are good.",
                `Question: ${question}`,
              ].join("\n"),
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.4,
      },
    })

    const text =
      completion.response.candidates?.[0]?.content?.parts?.map((part: any) => part.text || "").join("")?.toLowerCase() ||
      ""
    const shouldVisualize = /yes|chart|graph/.test(text)
    console.log("[visuals:classify] model response", text)

    return NextResponse.json({ shouldVisualize, raw: text })
  } catch (error) {
    console.error("[visuals:classify] failed", error)
    return NextResponse.json({ shouldVisualize: false, reason: "error" }, { status: 200 })
  }
}
