// app/layout.tsx
import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import AuthGate from "@/components/auth-gate"

export const metadata: Metadata = {
  title: "Veston | Radiology Assistant",
  description: "Veston helps teams triage radiology questions with smart routing.",
  generator: "v0.app",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={[
          "min-h-screen bg-background text-foreground antialiased font-sans", 
          GeistSans.variable,
          GeistMono.variable,
        ].join(" ")}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"           
          enableSystem
          disableTransitionOnChange
          storageKey="veston-theme"
        >
          <AuthGate>{children}</AuthGate>
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  )
}
