import type { Metadata, Viewport } from 'next'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { TauriProvider } from '@/lib/tauri-provider'
import './globals.css'

export const metadata: Metadata = {
  title: 'veyo.ai',
  description: 'Professional workspace for knowledge notes, sessions, documentation, AI collaboration, and CAD-lite visual drafting.',
  generator: 'veyo.ai',
  icons: {
    icon: [
      { url: '/apple-icon.png' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8f9fc' },
    { media: '(prefers-color-scheme: dark)', color: '#090d17' },
  ],
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
          <TauriProvider>
            {children}
            <Toaster richColors position="top-right" />
          </TauriProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
