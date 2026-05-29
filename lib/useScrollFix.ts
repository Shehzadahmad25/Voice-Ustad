import { useEffect } from 'react'

export function useScrollFix() {
  useEffect(() => {
    const fix = () => {
      document.body.setAttribute('style', '')
      document.documentElement.setAttribute('style', '')
      document.body.style.overflowY = 'auto'
      document.documentElement.style.overflowY = 'auto'
    }
    fix()
    const t1 = setTimeout(fix, 100)
    const t2 = setTimeout(fix, 500)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [])
}
