// auth.js — 登入 / 註冊 / 登出邏輯

// ── Tab 切換 ──────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'))
  event.target.classList.add('active')
  document.getElementById('login-form').style.display = tab === 'login' ? 'block' : 'none'
  document.getElementById('register-form').style.display = tab === 'register' ? 'block' : 'none'
}

// ── 登入 ──────────────────────────────────────────────────
async function handleLogin(e) {
  e.preventDefault()
  const btn = document.getElementById('login-btn')
  const errEl = document.getElementById('login-error')
  errEl.style.display = 'none'
  btn.textContent = '登入中...'
  btn.disabled = true

  const email = document.getElementById('login-email').value
  const password = document.getElementById('login-password').value

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    errEl.textContent = '帳號或密碼錯誤，請再試一次。'
    errEl.style.display = 'block'
    btn.textContent = '登入'
    btn.disabled = false
    return
  }

  // 取得角色，導向對應頁面
  await redirectByRole(data.user.id)
}

// ── 根據角色跳頁 ──────────────────────────────────────────
async function redirectByRole(userId) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()

  const role = profile?.role || 'student'
  window.location.href = ROLE_HOME[role]
}

// ── 學員註冊 ─────────────────────────────────────────────
async function handleRegister(e) {
  e.preventDefault()
  const btn = document.getElementById('reg-btn')
  const errEl = document.getElementById('reg-error')
  const sucEl = document.getElementById('reg-success')
  errEl.style.display = 'none'
  sucEl.style.display = 'none'
  btn.textContent = '建立中...'
  btn.disabled = true

  const email = document.getElementById('reg-email').value
  const password = document.getElementById('reg-password').value
  const name = document.getElementById('reg-name').value
  const idNumber = document.getElementById('reg-id-number').value
  const org = document.getElementById('reg-org').value
  const orgType = document.getElementById('reg-org-type').value
  const license = document.getElementById('reg-license').value

  // 1. 建立 Auth 帳號
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name, id_number: idNumber, org, org_type: orgType, license }
    }
  })

  if (error) {
    errEl.textContent = error.message.includes('already registered')
      ? '此信箱已註冊，請直接登入。'
      : '註冊失敗：' + error.message
    errEl.style.display = 'block'
    btn.textContent = '建立帳號'
    btn.disabled = false
    return
  }

  // 2. 寫入 profiles 資料表（Trigger 自動建立，這裡補充欄位）
  if (data.user) {
    await supabase.from('profiles').upsert({
      id: data.user.id,
      name,
      id_number: idNumber,
      org,
      org_type: orgType,
      license,
      role: 'student'
    })
  }

  sucEl.style.display = 'block'
  btn.textContent = '建立帳號'
  btn.disabled = false
}

// ── 登出 ─────────────────────────────────────────────────
async function logout() {
  await supabase.auth.signOut()
  window.location.href = '../index.html'
}

// ── 頁面載入時：已登入則直接跳頁 ─────────────────────────
;(async () => {
  // 只在首頁執行
  if (!window.location.pathname.endsWith('index.html') &&
      window.location.pathname !== '/') return

  const { data: { session } } = await supabase.auth.getSession()
  if (session) await redirectByRole(session.user.id)
})()
