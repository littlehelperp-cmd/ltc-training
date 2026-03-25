-- ============================================================
-- 長照教育訓練系統 — Supabase 資料表設定
-- 使用方法：複製全部貼到 Supabase > SQL Editor > Run
-- ============================================================

-- 1. 使用者資料表（擴充 auth.users）
CREATE TABLE IF NOT EXISTS public.profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name         TEXT,
  id_number    TEXT,              -- 身分證字號
  org          TEXT,              -- 服務機構名稱
  org_type     TEXT,              -- A單位 / B單位 / C單位 / 其他
  license      TEXT,              -- 照顧服務員證照
  role         TEXT DEFAULT 'student' CHECK (role IN ('student','organizer','admin')),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 課程資料表
CREATE TABLE IF NOT EXISTS public.courses (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  title                 TEXT NOT NULL,
  category              TEXT,              -- 直接服務類 / 專業知識類 / 品質管理類
  location              TEXT,
  date                  DATE NOT NULL,
  start_time            TIME,
  hours                 NUMERIC(4,1),      -- 上課時數
  credits               INTEGER,           -- 長照積分
  max_participants      INTEGER DEFAULT 30,
  enrolled_count        INTEGER DEFAULT 0,
  waitlist_count        INTEGER DEFAULT 0,
  registration_deadline DATE,
  description           TEXT,
  is_published          BOOLEAN DEFAULT FALSE,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 報名資料表
CREATE TABLE IF NOT EXISTS public.enrollments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id           UUID REFERENCES public.courses(id) ON DELETE CASCADE,
  status              TEXT DEFAULT 'enrolled' CHECK (status IN ('enrolled','waitlisted','cancelled')),
  waitlist_position   INTEGER,            -- 候補順序
  attended            BOOLEAN DEFAULT FALSE,
  attended_at         TIMESTAMPTZ,
  -- 快照：報名當下的個人資料（避免使用者後來改資料影響紀錄）
  name_snapshot       TEXT,
  id_number_snapshot  TEXT,
  org_snapshot        TEXT,
  org_type_snapshot   TEXT,
  license_snapshot    TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, course_id)              -- 同一課程不可重複報名
);

-- ============================================================
-- Row Level Security（RLS）— 重要！保護資料安全
-- ============================================================

ALTER TABLE public.profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;

-- profiles: 本人可讀寫自己的資料；admin 可讀全部
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- courses: 所有登入者可看已發布課程；organizer 可 CRUD 自己的課程
CREATE POLICY "courses_select_published" ON public.courses
  FOR SELECT USING (
    is_published = TRUE OR
    organizer_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "courses_insert_organizer" ON public.courses
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('organizer','admin'))
  );

CREATE POLICY "courses_update_organizer" ON public.courses
  FOR UPDATE USING (
    organizer_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- enrollments: 本人看自己的報名；organizer 看自己課程的報名；admin 看全部
CREATE POLICY "enrollments_select" ON public.enrollments
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.id = course_id AND c.organizer_id = auth.uid()
    ) OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "enrollments_insert_own" ON public.enrollments
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "enrollments_update" ON public.enrollments
  FOR UPDATE USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.id = course_id AND c.organizer_id = auth.uid()
    ) OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- Trigger：Auth 帳號建立時自動建 profiles 紀錄
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, role)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'name',
    'student'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 範例資料：建立測試帳號後可手動在 profiles 設定角色
-- ============================================================
-- 把某帳號改為 organizer（替換 email）：
-- UPDATE public.profiles
-- SET role = 'organizer'
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'organizer@example.com');

-- 把某帳號改為 admin：
-- UPDATE public.profiles
-- SET role = 'admin'
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'admin@example.com');
