import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import './globals.css'
import { AuthProvider } from '@/contexts/AuthContext'
import { ToastProvider } from '@/components/ui/Toast'
import InstallButton from '@/components/InstallButton'

export const metadata: Metadata = {
  title: 'VoiceUstad – AI Chemistry Tutor for FSc Students | Pakistan',
  description: 'Learn FSc Chemistry with English text and Urdu voice explanations. KPK Board aligned. Rs. 499/month. Try free for 7 days.',
  icons: {
    icon: '/favicon.svg',
    apple: '/icon-192.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f97316',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="VoiceUstad" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body>
        <AuthProvider>
          <ToastProvider>
            {children}
            <InstallButton />
          </ToastProvider>
        </AuthProvider>
        <Script id="sw-register" strategy="afterInteractive">
          {`
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', function() {
                navigator.serviceWorker.register('/sw.js')
                  .then(function(reg) {
                    console.log('[SW] Registered:', reg.scope)
                  })
                  .catch(function(err) {
                    console.log('[SW] Registration failed:', err)
                  })
              })
            }
          `}
        </Script>
      </body>
    </html>
  )
}
