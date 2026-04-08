import { redirect } from 'next/navigation'

export default function OldResetPasswordPage() {
  redirect('/auth/reset-password')
}
