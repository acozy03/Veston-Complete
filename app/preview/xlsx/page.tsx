import { Suspense } from 'react'
import XlsxPreviewPage from './XlsxPageClient'

export const dynamic = 'force-dynamic' // prevents build-time prerender error

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 16 }}>Loading…</div>}>
      <XlsxPreviewPage />
    </Suspense>
  )
}
