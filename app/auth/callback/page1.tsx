// 'use client';

// import { Suspense, useEffect } from 'react';
// import { useRouter, useSearchParams } from 'next/navigation';
// import { createClient } from '@/lib/supabase/client';

// function CallbackInner() {
//   const router = useRouter();
//   const searchParams = useSearchParams();

//   useEffect(() => {
//     const run = async () => {
//       const supabase = createClient();
//       const code = searchParams.get('code');

//       if (code) {
//         const { error } = await supabase.auth.exchangeCodeForSession(code);
//         if (error) {
//           console.error('OAuth exchange error:', error.message);
//         }
//       }
//       router.replace('/');
//     };
//     void run();
//   }, [router, searchParams]);

//   return <p className="p-4 text-sm text-muted-foreground">Signing you in…</p>;
// }

// export default function AuthCallback() {
//   return (
//     <Suspense fallback={<p className="p-4 text-sm text-muted-foreground">Loading…</p>}>
//       <CallbackInner />
//     </Suspense>
//   );
// }
