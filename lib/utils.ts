export function getTimeAgo(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours   = Math.floor(diff / 3600000)
    const days    = Math.floor(diff / 86400000)
    if (minutes < 1)  return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24)   return `${hours}h ago`
    if (days === 1)   return 'Yesterday'
    if (days < 7)     return `${days} days ago`
    return date.toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })
  } catch {
    return ''
  }
}

export function getFirstName(profile: any, user: any): string {
  // Priority 1: full_name from profiles table
  if (profile?.full_name?.trim()) {
    return profile.full_name.trim().split(' ')[0]
  }
  // Priority 2: full_name from auth metadata
  if (user?.user_metadata?.full_name?.trim()) {
    return user.user_metadata.full_name.trim().split(' ')[0]
  }
  // Priority 3: name from auth metadata
  if (user?.user_metadata?.name?.trim()) {
    return user.user_metadata.name.trim().split(' ')[0]
  }
  // Priority 4: capitalize email username
  if (user?.email) {
    const name = user.email.split('@')[0]
    return name.charAt(0).toUpperCase() + name.slice(1)
  }
  return 'Student'
}
