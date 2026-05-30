import { useEffect } from 'react'

export function useScrollFix() {
  useEffect(() => {
    const fix = () => {
      document.body.removeAttribute('style')
      document.documentElement.removeAttribute('style')
      document.body.style.overflowY = 'auto'
      document.documentElement.style.overflowY = 'auto'
      document.body.style.height = 'auto'
      document.documentElement.style.height = 'auto'
    }
    fix()
    requestAnimationFrame(fix)
    setTimeout(fix, 50)
    setTimeout(fix, 200)
    setTimeout(fix, 500)
  }, [])
}
