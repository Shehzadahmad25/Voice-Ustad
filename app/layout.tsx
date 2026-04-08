import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/contexts/AuthContext'
import { ToastProvider } from '@/components/ui/Toast'

export const metadata: Metadata = {
  title: 'VoiceUstad – AI Chemistry Tutor for FSc Students | Pakistan',
  description: 'Learn FSc Chemistry with English text and Urdu voice explanations. KPK Board aligned. Rs. 499/month. Try free for 7 days.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
