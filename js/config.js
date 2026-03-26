// ╔══════════════════════════════════════════════════════════╗
// ║  config.js                                               ║
// ║  步驟：到 Supabase > Settings > API，把值貼進來          ║
// ╚══════════════════════════════════════════════════════════╝

// 防止重複載入
if (typeof BASE_PATH === 'undefined') {

  const SUPABASE_URL = 'https://phhngxurdnuyqwaqnhci.supabase.co'
  const SUPABASE_ANON_KEY = 'sb_publishable_2l1xRGFrgqyjyC8ygPAs_g_yAZVYziq'
  const BASE_PATH = '/ltc-training'   

  window.SUPABASE_URL      = SUPABASE_URL
  window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY
  window.BASE_PATH         = BASE_PATH
  window.supabase          = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

  window.ROLE_HOME = {
    student:   BASE_PATH + '/pages/student.html',
    organizer: BASE_PATH + '/pages/organizer.html',
    admin:     BASE_PATH + '/pages/organizer.html',
  }

}
