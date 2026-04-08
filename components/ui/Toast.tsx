'use client'
import { createContext, useContext, useState, useCallback } from 'react'

type Toast = { id: number; message: string; type: 'success' | 'error' | 'info' }
type ToastCtx = { showToast: (m: string, t?: Toast['type']) => void }

const ToastContext = createContext<ToastCtx>({ showToast: () => {} })

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((message: string, type: Toast['type'] = 'success') => {
    const id = Date.now()
    setToasts(p => [...p.slice(-2), { id, message, type }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3000)
  }, [])

  const colors = { success: '#22c55e', error: '#ef4444', info: '#0ea5e9' }
  const icons = { success: '✅', error: '⚠️', info: '💡' }

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div style={{
        position:'fixed', bottom:'80px', left:'50%', transform:'translateX(-50%)',
        display:'flex', flexDirection:'column', gap:'8px', zIndex:999,
        minWidth:'300px', maxWidth:'400px',
      }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            background:'var(--card)',
            border:`1px solid rgba(255,255,255,0.12)`,
            borderLeft:`4px solid ${colors[t.type]}`,
            borderRadius:'12px', padding:'12px 16px',
            display:'flex', alignItems:'center', gap:'10px',
            fontSize:'13px', fontWeight:'500',
            animation:'fadeUp 0.3s ease',
            boxShadow:'0 8px 24px rgba(0,0,0,0.4)',
          }}>
            <span>{icons[t.type]}</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
