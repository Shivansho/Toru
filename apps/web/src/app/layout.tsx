import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import AuthGuard from '@/components/AuthGuard'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Campus Chat',
  description: 'Anonymous campus chat platform',
}

import { Suspense } from 'react';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-slate-950 min-h-screen text-slate-100 flex flex-col`}>
        <Suspense fallback={<div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">Loading app...</div>}>
          <AuthGuard>
            <div className="flex-1">
              {children}
            </div>
            <footer className="w-full bg-slate-900 border-t border-slate-800 py-6 mt-auto">
              <div className="max-w-4xl mx-auto px-4 flex flex-col md:flex-row justify-center items-center text-sm text-slate-400 space-y-2 md:space-y-0 md:space-x-6">
                <a href="/legal/terms-of-use" className="hover:text-blue-400 transition">Terms of Use</a>
                <a href="/legal/privacy-policy" className="hover:text-blue-400 transition">Privacy Policy</a>
                <a href="/legal/community-guidelines" className="hover:text-blue-400 transition">Community Guidelines</a>
                <a href="/legal/anonymity-explainer" className="hover:text-blue-400 transition">How Anonymity Works</a>
                <a href="/legal/data-retention-schedule" className="hover:text-blue-400 transition">Data Retention</a>
                <a href="/legal/grievance-officer" className="hover:text-blue-400 transition font-medium">Grievance Officer</a>
              </div>
            </footer>
          </AuthGuard>
        </Suspense>
      </body>
    </html>
  )
}
