# ChatBot Interface

A sleek, minimal, and clean chatbot interface inspired by ChatGPT. This is a frontend-only implementation that provides a beautiful UI foundation for building conversational AI applications.

## Features

- **Clean, Modern Design**: Dark theme with excellent contrast and smooth animations
- **Responsive Layout**: Works seamlessly on desktop, tablet, and mobile devices
- **Chat Management**: Create, switch between, and delete multiple chat conversations
- **Search Functionality**: Quickly find specific chats using the search bar
- **Message Display**: Beautiful message bubbles for user and assistant messages
- **Typing Indicators**: Visual feedback when the assistant is "thinking"
- **Auto-resizing Input**: Text input grows as you type longer messages
- **Collapsible Sidebar**: Toggle sidebar visibility on mobile devices

## Getting Started

### Installation

1. **Download the project** from v0 by clicking the three dots in the top right and selecting "Download ZIP"

2. **Install dependencies**:
   \`\`\`bash
   npm install
   # or
   yarn install
   # or
   pnpm install
   \`\`\`

3. **Run the development server**:
   \`\`\`bash
   npm run dev
   # or
   yarn dev
   # or
   pnpm dev
   \`\`\`

4. **Open your browser** and navigate to `http://localhost:3000`

## Project Structure

\`\`\`
├── app/
│   ├── page.tsx              # Main page component
│   ├── layout.tsx            # Root layout with fonts
│   └── globals.css           # Global styles and design tokens
├── components/
│   ├── chat-interface.tsx    # Main chat interface container
│   ├── chat-sidebar.tsx      # Sidebar with chat history and search
│   ├── chat-messages.tsx     # Message display area
│   ├── chat-input.tsx        # Message input field
│   └── ui/                   # shadcn/ui components
└── lib/
    └── utils.ts              # Utility functions
\`\`\`

## Connecting a Backend

This is a frontend-only implementation. To connect it to a real AI backend, you'll need to:

### 1. Using Vercel AI SDK (Recommended)

Install the AI SDK:
\`\`\`bash
npm install ai @ai-sdk/openai
\`\`\`

Create an API route at `app/api/chat/route.ts`:
\`\`\`typescript
import { openai } from '@ai-sdk/openai'
import { streamText } from 'ai'

export async function POST(req: Request) {
  const { messages } = await req.json()

  const result = streamText({
    model: openai('gpt-4'),
    messages,
  })

  return result.toDataStreamResponse()
}
\`\`\`

Update `components/chat-interface.tsx` to use the `useChat` hook:
\`\`\`typescript
import { useChat } from 'ai/react'

// Replace the mock sendMessage function with:
const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat()
\`\`\`

### 2. Using Custom API

Modify the `sendMessage` function in `components/chat-interface.tsx`:

\`\`\`typescript
const sendMessage = async (content: string) => {
  // Add user message
  const userMessage: Message = {
    id: Date.now().toString(),
    role: "user",
    content,
    timestamp: new Date(),
  }
  
  setCurrentMessages((prev) => [...prev, userMessage])
  setIsTyping(true)

  try {
    // Call your API
    const response = await fetch('/api/your-endpoint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: content }),
    })

    const data = await response.json()

    // Add assistant response
    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: data.response,
      timestamp: new Date(),
    }

    setCurrentMessages((prev) => [...prev, assistantMessage])
  } catch (error) {
    console.error('Error:', error)
  } finally {
    setIsTyping(false)
  }
}
\`\`\`

## Customization

### Changing Colors

Edit the design tokens in `app/globals.css`:

\`\`\`css
@theme inline {
  --color-background: #0a0a0a;
  --color-foreground: #ededed;
  /* ... modify other colors ... */
}
\`\`\`

### Adding Features

**Markdown Support**: Install `react-markdown` to render formatted messages:
\`\`\`bash
npm install react-markdown
\`\`\`

**Code Highlighting**: Add syntax highlighting for code blocks:
\`\`\`bash
npm install react-syntax-highlighter
\`\`\`

**File Uploads**: Extend `chat-input.tsx` to handle file attachments

**Voice Input**: Add speech-to-text functionality using the Web Speech API

### Persisting Chat History

Add local storage or database integration:

\`\`\`typescript
// Save to localStorage
useEffect(() => {
  localStorage.setItem('chats', JSON.stringify(chats))
}, [chats])

// Load from localStorage
useEffect(() => {
  const saved = localStorage.getItem('chats')
  if (saved) setChats(JSON.parse(saved))
}, [])
\`\`\`

## Deployment

Deploy to Vercel with one click:

1. Push your code to GitHub
2. Import your repository on [Vercel](https://vercel.com)
3. Deploy!

Or use the Vercel CLI:
\`\`\`bash
npm install -g vercel
vercel
\`\`\`

## Tech Stack

- **Next.js 15** - React framework with App Router
- **TypeScript** - Type safety
- **Tailwind CSS v4** - Utility-first styling
- **shadcn/ui** - High-quality UI components
- **Lucide Icons** - Beautiful icon set

## Contributing

This is a starter template. Feel free to customize it for your needs:

- Add authentication
- Integrate with your preferred AI provider
- Add more features like image generation, file uploads, etc.
- Customize the design to match your brand

## License

MIT License - feel free to use this in your projects!

## Support

For issues or questions about this template, visit [v0.dev](https://v0.dev) or check the [Next.js documentation](https://nextjs.org/docs).
