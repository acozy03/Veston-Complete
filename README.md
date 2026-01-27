# Veston | Radiology Assistant

Veston is a production-ready radiology assistant experience built on Next.js. It pairs a refined chat UI with authenticated, persisted conversations, workflow routing, citations, and data visualizations.

## Features

- **Authenticated Chat**: Google OAuth via Supabase with per-user chat persistence.
- **Conversation Management**: Create, rename, switch, search, and delete chats with sidebar and spotlight search.
- **Model Routing Controls**: Toggle fast/slow reasoning, OpenAI/Gemini providers, and workflow flags (RadMapping+, Data Analysis, Study Analysis).
- **Citations + Sources**: Optional sources displayed per assistant response with snippets and scores.
- **Auto Visualizations**: Gemini-based classifier + generator builds chart specs and renders charts inline.
- **Spreadsheet Preview**: XLSX links open a built-in preview with download support.
- **Markdown + Copy**: Markdown rendering, code blocks, and one-click copy on assistant messages.
- **Theming**: Light/dark/system themes with a global toggle.
- **Analytics Ready**: Vercel Analytics wiring included.

## Getting Started

### Installation

1. **Install dependencies**:
   ```bash
   npm install
   # or
   yarn install
   # or
   pnpm install
   ```

2. **Configure environment variables** in `.env.local`:
   ```bash
   # Supabase (required)
   NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key

   # n8n workflow router (required for tRPC chat workflow)
   N8N_CLASSIFIER_URL=https://your-n8n-host/webhook/your-endpoint

   # Vertex AI (required for chart classification + generation)
   GCP_PROJECT_ID=your-gcp-project
   GCP_LOCATION=us-central1
   VISUAL_CLASSIFIER_MODEL=gemini-2.5-flash
   VISUAL_GENERATOR_MODEL=gemini-2.5-flash
   ```

3. **Run the development server**:
   ```bash
   npm run dev
   # or
   yarn dev
   # or
   pnpm dev
   ```

4. **Open your browser** and navigate to `http://localhost:3000`

### Supabase Tables (Recommended)

Create tables for chat persistence + enhancements:

- `chats`: `id`, `user_id`, `user_email`, `title`, `created_at`, `updated_at`
- `messages`: `id`, `chat_id`, `user_email`, `role`, `content`, `created_at`
- `message_sources` (optional): `message_id`, `chat_id`, `user_email`, `url`, `title`, `snippet`, `score`
- `message_visualizations` (optional): `message_id`, `chat_id`, `user_email`, `visualizations`

## Project Structure

```
├── app/
│   ├── api/                  # tRPC route handler
│   ├── auth/                 # Supabase OAuth callback
│   ├── preview/              # XLSX preview experience
│   ├── page.tsx              # Main page component
│   ├── layout.tsx            # Root layout with fonts + auth gate
│   └── globals.css           # Global styles and design tokens
├── components/
│   ├── auth-gate.tsx         # Google OAuth gate
│   ├── chat-interface.tsx    # Main chat interface container
│   ├── chat-sidebar.tsx      # Sidebar with chat history and search
│   ├── chat-messages.tsx     # Message display + citations + charts
│   ├── chat-input.tsx        # Message input + workflow toggles
│   ├── chart-visualizations.tsx # Recharts visualizations
│   ├── spotlight-search.tsx  # Command-k style search
│   └── ui/                   # shadcn/ui components
└── lib/
    ├── supabase/             # Supabase client/server helpers
    ├── visualization.ts      # Chart spec helpers
    └── utils.ts              # Utility functions
```

## Chat Workflow Integration

All API interactions are standardized through tRPC (`/api/trpc`); legacy REST routes are deprecated and removed.

The `chat.ask` tRPC mutation forwards every question to your n8n workflow router (`N8N_CLASSIFIER_URL`). The workflow can reply with:

```json
{
  "reply": "assistant response",
  "sources": [
    { "url": "https://example.com", "title": "Source title", "snippet": "...", "score": 0.82 }
  ],
  "visualizations": [
    { "id": "chart-1", "type": "bar", "title": "Example", "data": [] }
  ]
}
```

If `sources` or `visualizations` are provided, they will be stored (if tables exist) and rendered in the UI.

## Visualization Pipeline

When an answer appears suitable for charts, the `visuals.classify` and `visuals.generate` tRPC mutations use Vertex AI (Gemini) to create Recharts-compatible chart specs. These charts are stored in Supabase when possible and rendered inline next to the assistant response.

## Spreadsheet Preview

Links ending in `.xlsx` (or matching spreadsheet MIME types) open a built-in preview at `/preview/xlsx`, with a one-click download via the `proxyFile.fetch` tRPC query.

## Customization

### Changing Colors

Edit the design tokens in `app/globals.css`.

### Adding Features

**Swap auth providers**: Update `components/auth-gate.tsx` to switch Supabase OAuth providers.

**Add new workflows**: Extend the options in `components/chat-input.tsx` and forward flags to `chat.ask`.

**Override chart rendering**: Update `components/chart-visualizations.tsx`.

**Voice Input**: Add speech-to-text functionality using the Web Speech API.

## Deployment

Deploy to Vercel with one click:

1. Push your code to GitHub
2. Import your repository on [Vercel](https://vercel.com)
3. Deploy!

Or use the Vercel CLI:
```bash
npm install -g vercel
vercel
```

## Tech Stack

- **Next.js 15** - React framework with App Router
- **TypeScript** - Type safety
- **Tailwind CSS v4** - Utility-first styling
- **Supabase** - Auth + persistence
- **Vertex AI (Gemini)** - Visualization classification + generation
- **Recharts** - Data visualization rendering
- **shadcn/ui** - UI components
- **Lucide Icons** - Icon set

## Contributing

Feel free to open issues or PRs. This repo powers a production chat experience, so changes should be well-documented and tested.

## License

MIT License - feel free to use this in your projects!

## Support

For issues or questions, start with the [Next.js documentation](https://nextjs.org/docs) and Supabase guides.
