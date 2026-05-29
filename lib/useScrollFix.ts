import { useEffect } from 'react'

export function useScrollFix() {
  useEffect(() => {
    const fix = () => {
      document.body.style.cssText = ''
      document.documentElement.style.cssText = ''
      document.body.style.overflowY = 'auto'
      document.documentElement.style.overflowY = 'auto'
    }
    fix()
    requestAnimationFrame(fix)
    setTimeout(fix, 0)
    setTimeout(fix, 200)
  }, [])
}
