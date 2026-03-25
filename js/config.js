// ============================================================
//  config.js — 填入你的 Supabase 專案資訊
//  從 Supabase Dashboard > Settings > API 複製貼上
// ============================================================

const SUPABASE_URL = 'https://phhngxurdnuyqwaqnhci.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_2l1xRGFrgqyjyC8ygPAs_g_yAZVYziq'

// 初始化 Supabase client（整個 app 共用）
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// 角色對應頁面
const ROLE_HOME = {
  student: 'pages/student.html',
  organizer: 'pages/organizer.html',
  admin: 'pages/admin.html'
}
