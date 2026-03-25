// auth.js — 登入 / 登出 / 角色跳頁

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'))
  event.target.classList.add('active')
  document.getElementById('login-form').style.display   = tab === 'login'    ? 'block' : 'none'
  document.getElementById('register-form').style.display = tab === 'register' ? 'block' : 'none'
}

async function handleLogin(e) {
  e.preventDefault()
  const btn = document.getElementById('login-btn')
  const err = document.getElementById('login-error')
  err.style.display = 'none'
  btn.textContent = '登入中…'; btn.disabled = true

  const { data, error } = await supabase.auth.signInWithPassword({
    email:    document.getElementById('login-email').value,
    password: document.getElementById('login-password').value,
  })
  if (error) {
    err.textContent = '帳號或密碼錯誤，請再試一次。'
    err.style.display = 'block'
    btn.textContent = '登入'; btn.disabled = false
    return
  }
  await redirectByRole(data.user.id)
}

async function redirectByRole(userId) {
  const { data: p } = await supabase.from('profiles').select('role').eq('id', userId).single()
  window.location.href = ROLE_HOME[p?.role || 'student']
}

async function handleRegister(e) {
  e.preventDefault()
  const btn = document.getElementById('reg-btn')
  const err = document.getElementById('reg-error')
  const suc = document.getElementById('reg-success')
  err.style.display = 'none'; suc.style.display = 'none'
  btn.textContent = '建立中…'; btn.disabled = true

  const email    = document.getElementById('reg-email').value
  const password = document.getElementById('reg-password').value
  const name     = document.getElementById('reg-name').value
  const idNum    = document.getElementById('reg-id-number').value
  const org      = document.getElementById('reg-org').value
  const orgType  = document.getElementById('reg-org-type').value
  const license  = document.getElementById('reg-license').value

  const { data, error } = await supabase.auth.signUp({ email, password,
    options: { data: { name, id_number: idNum, org, org_type: orgType, license } }
  })
  if (error) {
    err.textContent = error.message.includes('already') ? '此信箱已註冊，請直接登入。' : '註冊失敗：' + error.message
    err.style.display = 'block'
    btn.textContent = '建立帳號'; btn.disabled = false
    return
  }
  if (data.user) {
    await supabase.from('profiles').upsert({
      id: data.user.id, name, id_number: idNum, org, org_type: orgType, license, role: 'student'
    })
  }
  suc.style.display = 'block'
  btn.textContent = '建立帳號'; btn.disabled = false
}

async function logout() {
  await supabase.auth.signOut()
  window.location.href = BASE_PATH + '/index.html'
}

// 首頁：已登入就跳頁
;(async () => {
  const path = window.location.pathname
  if (!path.endsWith('index.html') && path !== '/' && path !== BASE_PATH + '/') return
  const { data: { session } } = await supabase.auth.getSession()
  if (session) await redirectByRole(session.user.id)
})()
