import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import AuthGuard from '@/components/AuthGuard'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Campus Chat',
  description: 'Anonymous campus chat platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-slate-950 min-h-screen text-slate-100`}>
        <AuthGuard>
          {children}
        </AuthGuard>
      </body>
    </html>
  )
}
