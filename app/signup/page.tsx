import { redirect } from 'next/navigation'

export default function OldSignupPage() {
  redirect('/auth/signup')
}
