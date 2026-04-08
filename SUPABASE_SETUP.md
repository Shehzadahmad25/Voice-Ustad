# Supabase Authentication Setup Guide

This guide will help you set up Supabase authentication for the Voice-Ustad application.

## Prerequisites

- A Supabase account (sign up at https://supabase.com)
- Node.js and npm installed

## Step 1: Create a Supabase Project

1. Go to https://supabase.com and sign in
2. Click "New Project"
3. Fill in the project details:
   - **Name**: Voice-Ustad (or your preferred name)
   - **Database Password**: Choose a strong password
   - **Region**: Select the closest region to Pakistan (e.g., Singapore)
4. Click "Create new project"
5. Wait for the project to be provisioned (takes ~2 minutes)

## Step 2: Get Your API Keys

1. In your Supabase project dashboard, click on the **Settings** icon (gear icon) in the sidebar
2. Navigate to **API** section
3. Copy the following values:
   - **Project URL** (looks like: `https://xxxxxxxxxxxxx.supabase.co`)
   - **anon/public key** (a long JWT token)

## Step 3: Configure Environment Variables

1. Open the `.env.local` file in your project root
2. Replace the placeholder values with your actual Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

## Step 4: Create Database Tables

1. In your Supabase dashboard, go to the **SQL Editor** (database icon in sidebar)
2. Click **New Query**
3. Copy and paste the following SQL:

```sql
-- Create profiles table
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  class TEXT CHECK (class IN ('11', '12')),
  board TEXT CHECK (board IN ('KPK', 'Federal', 'Punjab')),
  goal TEXT CHECK (goal IN ('MDCAT', 'ECAT', 'Both')),
  referral_code TEXT UNIQUE NOT NULL,
  trial_ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to read their own profile
CREATE POLICY "Users can view own profile"
  ON profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Create policy to allow users to insert their own profile
CREATE POLICY "Users can insert own profile"
  ON profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Create policy to allow users to update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles
  FOR UPDATE
  USING (auth.uid() = id);

-- Create index on referral_code for faster lookups
CREATE INDEX idx_profiles_referral_code ON profiles(referral_code);
```

4. Click **Run** to execute the SQL

## Step 5: Configure Email Authentication

1. In Supabase dashboard, go to **Authentication** → **Providers**
2. Make sure **Email** is enabled (it should be by default)
3. Configure email templates (optional):
   - Go to **Authentication** → **Email Templates**
   - Customize the confirmation email if desired

## Step 6: Configure Site URL (Important!)

1. Go to **Authentication** → **URL Configuration**
2. Add your site URLs:
   - **Site URL**: `http://localhost:3000` (for development)
   - **Redirect URLs**: Add the following:
     - `http://localhost:3000/auth/callback`
     - `http://localhost:3000/chat`
     - For production, add your production URLs as well

## Step 7: Test the Setup

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Navigate to `http://localhost:3000/auth/signup`

3. Try creating a new account:
   - Fill in the signup form
   - Check your email for the confirmation link
   - Click the confirmation link
   - Complete the onboarding process

## Features Implemented

### ✅ Authentication Pages
- **Signup Page** (`/auth/signup`): Bilingual (Urdu/English) signup form
- **Login Page** (`/auth/login`): Bilingual login form
- **Onboarding** (`/auth/onboarding`): 3-step onboarding flow

### ✅ Onboarding Flow
1. **Step 1**: Class selection (11 or 12)
2. **Step 2**: Board selection (KPK, Federal, Punjab)
3. **Step 3**: Goal selection (MDCAT, ECAT, Both)

### ✅ User Profile Features
- Automatic referral code generation (8-character alphanumeric)
- 7-day free trial period
- User metadata storage (name, phone, class, board, goal)

### ✅ Protected Routes
- Middleware protects `/chat` and `/dashboard` routes
- Redirects unauthenticated users to login
- Redirects authenticated users away from auth pages

### ✅ Auth Context
- Global authentication state management
- User profile data accessible throughout the app
- Sign out functionality

## Using Authentication in Your App

### Access User Data in Components

```tsx
'use client'

import { useAuth } from '@/contexts/AuthContext'

export default function MyComponent() {
  const { user, profile, loading, signOut } = useAuth()

  if (loading) return <div>Loading...</div>
  if (!user) return <div>Please log in</div>

  return (
    <div>
      <h1>Welcome, {profile?.full_name}!</h1>
      <p>Class: {profile?.class}</p>
      <p>Board: {profile?.board}</p>
      <p>Referral Code: {profile?.referral_code}</p>
      <button onClick={signOut}>Sign Out</button>
    </div>
  )
}
```

### Check Trial Status

```tsx
const isTrialActive = profile?.trial_ends_at 
  ? new Date(profile.trial_ends_at) > new Date()
  : false
```

## Troubleshooting

### Issue: "Invalid API key"
- Double-check your `.env.local` file has the correct values
- Restart your development server after changing environment variables

### Issue: "Email not confirmed"
- Check your spam folder for the confirmation email
- In Supabase dashboard, go to Authentication → Users and manually confirm the user

### Issue: "Table does not exist"
- Make sure you ran the SQL script in Step 4
- Check the SQL Editor for any errors

### Issue: Middleware not working
- Ensure `middleware.ts` is in the root directory (not in `app/`)
- Check that the matcher pattern includes your routes

## Production Deployment

Before deploying to production:

1. Update `.env.local` → `.env.production` with production URLs
2. Add production URLs to Supabase **URL Configuration**
3. Consider enabling additional security features:
   - Email rate limiting
   - CAPTCHA for signup
   - Password strength requirements

## Security Best Practices

- ✅ Row Level Security (RLS) is enabled on all tables
- ✅ Users can only access their own data
- ✅ API keys are stored in environment variables
- ✅ Passwords are hashed by Supabase
- ✅ JWT tokens are used for authentication

## Next Steps

- Add password reset functionality
- Implement email verification reminders
- Add social login (Google, GitHub, etc.)
- Create admin dashboard for user management
- Add subscription/payment integration after trial period

## Support

For issues with Supabase, check:
- Supabase Documentation: https://supabase.com/docs
- Supabase Discord: https://discord.supabase.com

For issues with this implementation, check the code in:
- `lib/supabase.ts` - Supabase client configuration
- `contexts/AuthContext.tsx` - Authentication context
- `middleware.ts` - Route protection
- `app/auth/*` - Authentication pages
