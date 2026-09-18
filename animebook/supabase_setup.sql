-- ================================================================
-- ANIMEBOOK // SUPABASE DATABASE SETUP & ROW LEVEL SECURITY (RLS)
-- Copy and paste this entire script into your Supabase SQL Editor
-- (Dashboard -> SQL Editor -> New Query -> Run)
-- ================================================================

-- 1. Create Profiles Table (Stores user metadata and admin roles)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  last_sign_in_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Trigger to automatically create a profile record when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, created_at, last_sign_in_at)
  VALUES (
    NEW.id,
    NEW.email,
    'user',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
  SET last_sign_in_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- 2. Create Anime Cards Table
CREATE TABLE IF NOT EXISTS public.anime_cards (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT DEFAULT '',
  format TEXT DEFAULT 'TV',
  studio TEXT DEFAULT '',
  genre TEXT DEFAULT '',
  status TEXT DEFAULT 'Plan to Watch',
  progress_current INTEGER DEFAULT 0,
  progress_total TEXT DEFAULT '12',
  score TEXT DEFAULT '',
  favorite_character TEXT DEFAULT '',
  notes_ep1_5 TEXT DEFAULT '',
  notes_mid_season TEXT DEFAULT '',
  notes_final_thoughts TEXT DEFAULT '',
  favorite_quote TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on anime_cards
ALTER TABLE public.anime_cards ENABLE ROW LEVEL SECURITY;

-- Anime Cards Row Level Security (RLS) Policies
-- Users can only read, create, edit, and delete their own cards!
DROP POLICY IF EXISTS "Users can read own anime cards" ON public.anime_cards;
CREATE POLICY "Users can read own anime cards"
  ON public.anime_cards FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own anime cards" ON public.anime_cards;
CREATE POLICY "Users can insert own anime cards"
  ON public.anime_cards FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own anime cards" ON public.anime_cards;
CREATE POLICY "Users can update own anime cards"
  ON public.anime_cards FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own anime cards" ON public.anime_cards;
CREATE POLICY "Users can delete own anime cards"
  ON public.anime_cards FOR DELETE
  USING (auth.uid() = user_id);


-- 3. Administrator Access Policies
-- Admins can view all registered profiles and aggregate stats
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can view anime cards for platform telemetry
DROP POLICY IF EXISTS "Admins can view all anime cards" ON public.anime_cards;
CREATE POLICY "Admins can view all anime cards"
  ON public.anime_cards FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Helper function for Admin to promote an email to Admin role:
-- Usage in SQL editor: SELECT promote_to_admin('your_email@example.com');
CREATE OR REPLACE FUNCTION public.promote_to_admin(target_email TEXT)
RETURNS TEXT AS $$
BEGIN
  UPDATE public.profiles
  SET role = 'admin'
  WHERE email = target_email;

  IF FOUND THEN
    RETURN 'Successfully promoted ' || target_email || ' to Admin!';
  ELSE
    RETURN 'User with email ' || target_email || ' not found. Make sure they sign up first.';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
