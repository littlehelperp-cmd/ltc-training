// ╔══════════════════════════════════════════════════════════╗
// ║  config.js                                               ║
// ║  步驟：到 Supabase > Settings > API，把值貼進來          ║
// ╚══════════════════════════════════════════════════════════╝

const SUPABASE_URL = 'https://phhngxurdnuyqwaqnhci.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_2l1xRGFrgqyjyC8ygPAs_g_yAZVYziq'
const BASE_PATH = '/ltc-training'   

// GitHub Pages repo 名稱前綴
// 若 repo 為 ltc-training → '/ltc-training'
// 若為根目錄部署 → ''
const BASE_PATH = '/ltc-training'

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const ROLE_HOME = {
  student:   BASE_PATH + '/pages/student.html',
  organizer: BASE_PATH + '/pages/organizer.html',
  admin:     BASE_PATH + '/pages/organizer.html',
}
