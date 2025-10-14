import { NextResponse } from "next/server"
import OpenAI from "openai"

const GOOGLE_BUCKET_URL =
  process.env.N8N_GOOGLE_BUCKET_SCRAPER_URL ??
  "http://34.57.10.93:5678/webhook/5ba2b170-557f-4f18-a2c1-2921f5308bf5"
const RADMAPPING_URL =
  process.env.N8N_RADMAPPING_PLUS_URL ??
  "http://34.57.10.93:5678/webhook/a09c94a6-7929-48ad-b9e6-c532ffcbac20"

const CLASSIFICATION_GUIDELINES =
  process.env.CLASSIFICATION_PROMPT ??
  "<<< TODO: Provide the detailed rules that decide between google bucket scrape and radmapping+. >>>"

const WORKFLOW_URLS = {
  GOOGLE_BUCKET_SCRAPER: GOOGLE_BUCKET_URL,
  RADMAPPING_PLUS: RADMAPPING_URL,
} as const

const CLASSIFICATION_SCHEMA = {
  type: "object",
  properties: {
    label: { type: "string", enum: ["GOOGLE_BUCKET_SCRAPER", "RADMAPPING_PLUS"] },
    confidence: { type: "string" },
    rationale: { type: "string" },
  },
  required: ["label", "confidence", "rationale"],  
  additionalProperties: false,
} as const;

interface ClassifierResult {
  label: keyof typeof WORKFLOW_URLS
  confidence?: string
  rationale?: string
}

export async function POST(req: Request) {
  try {
    const { question, history = [] }: { question?: string; history?: Array<{ role: string; content: string }> } =
      await req.json()

    if (!question || !question.trim()) {
      return NextResponse.json({ error: "Question is required" }, { status: 400 })
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 })
    }

    const client = new OpenAI({ apiKey })
    console.log(CLASSIFICATION_GUIDELINES)
    const classifierResponse = await client.responses.create({
  model: "gpt-4.1-mini",
  input: [
    { role: "system", content: `You are a strict classification engine. Pick exactly one workflow label for each message. Use these rules:\n${CLASSIFICATION_GUIDELINES}\nRespond as JSON that matches the provided schema.` },
    { role: "user", content: `User message: ${question}` },
  ],
  text: {
    format: {
      type: "json_schema",
      name: "workflow_classifier",
      schema: CLASSIFICATION_SCHEMA,
      strict: true,
    },
  },
});

    const rawOutput = classifierResponse.output_text  
    console.log(rawOutput); 
    let classifierResult: ClassifierResult | null = null

    if (rawOutput) {
      try {
        classifierResult = JSON.parse(rawOutput) as ClassifierResult
      } catch (parseError) {
        console.error("Failed to parse classifier output", parseError)
      }
    }

    const label = classifierResult?.label ?? "GOOGLE_BUCKET_SCRAPER"
    const workflowUrl = WORKFLOW_URLS[label]

    if (!workflowUrl) {
      return NextResponse.json({ error: `No workflow URL configured for label ${label}` }, { status: 500 })
    }

    const workflowResponse = await fetch(workflowUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ question, history, classifier: classifierResult, timestamp: new Date().toISOString() }),
    })

    const workflowText = await workflowResponse.text()
    let workflowJson: unknown = null

    try {
      workflowJson = JSON.parse(workflowText)
    } catch {
      // response was plain text; keep raw text
    }

    if (!workflowResponse.ok) {
      return NextResponse.json(
        {
          error: "Workflow request failed",
          status: workflowResponse.status,
          body: workflowJson ?? workflowText,
        },
        { status: 502 },
      )
    }
type JsonRecord = Record<string, unknown>;
const obj = (typeof workflowJson === "object" && workflowJson !== null
  ? (workflowJson as JsonRecord)
  : null);

const reply =
  (obj?.reply && typeof obj.reply === "string" && obj.reply) ||
  (obj?.message && typeof obj.message === "string" && obj.message) ||
  (obj?.response && typeof obj.response === "string" && obj.response) ||
  (typeof workflowText === "string" ? workflowText : JSON.stringify(workflowJson));
    return NextResponse.json({
      reply,
      workflow: label,
      classifier: classifierResult,
      raw: workflowJson ?? workflowText,
    })
    
  } catch (error) {
    console.error("Chat API error", error)
    return NextResponse.json({ error: "Failed to process question" }, { status: 500 })
  }
}