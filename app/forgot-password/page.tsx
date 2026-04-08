import { redirect } from 'next/navigation'

export default function OldForgotPasswordPage() {
  redirect('/auth/forgot-password')
}
