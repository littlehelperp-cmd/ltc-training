// student.js — 含資安強化（身分證遮罩 + safe_enroll RPC）
let me = null, myProfile = null, allCourses = [], enrollingId = null

window.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) { window.location.href = window.BASE_PATH + '/index.html'; return }
  me = session.user

  // 確認 email 已驗證
  if (!me.email_confirmed_at) {
    alert('請先至信箱點擊驗證連結，完成帳號驗證後再登入。')
    await supabase.auth.signOut()
    window.location.href = window.BASE_PATH + '/index.html'
    return
  }

  const { data: p } = await supabase.from('profiles').select('*').eq('id', me.id).single()
  myProfile = p
  document.getElementById('user-name').textContent = p?.name || me.email

  // 預填報名表（不預填身分證，每次手動輸入避免快取外洩）
  if (p) {
    document.getElementById('e-name').value    = p.name    || ''
    document.getElementById('e-org').value     = p.org     || ''
    document.getElementById('e-license').value = p.license || ''
    if (p.org_type) document.getElementById('e-org-type').value = p.org_type
  }

  await Promise.all([loadDashboard(), loadCourses()])
})

// ── 導覽 ──────────────────────────────────────────────────
function showPage(id, el) {
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'))
  document.getElementById('page-' + id).classList.add('active')
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'))
  el?.classList.add('active')
  if (id === 'enrollments') loadEnrollments()
  if (id === 'credits')     loadCredits()
}

// ── 身分證遮罩（資安：只保留首碼+後3碼）────────────────────
function maskID(id) {
  if (!id || id.length < 4) return id
  return id.slice(0, 1) + '●●●●●●' + id.slice(-3)
}

// 驗證身分證格式（台灣）
function validateID(id) {
  return /^[A-Z][12]\d{8}$/.test(id.toUpperCase())
}

// ── 儀表板 ────────────────────────────────────────────────
async function loadDashboard() {
  const { data: rows } = await supabase
    .from('enrollments').select('*, courses(*)')
    .eq('user_id', me.id)

  if (!rows) return
  const now = new Date()
  let credits = 0, done = 0, upcoming = 0, wait = 0

  rows.forEach(r => {
    if (r.status === 'waitlisted') { wait++; return }
    const d = new Date(r.courses?.date)
    if (r.attended) { done++; credits += r.courses?.credits || 0 }
    else if (d >= now) upcoming++
  })

  document.getElementById('m-credits').textContent  = credits
  document.getElementById('m-done').textContent     = done
  document.getElementById('m-upcoming').textContent = upcoming
  document.getElementById('m-wait').textContent     = wait

  const goal = 20
  document.getElementById('credit-bars').innerHTML = `
    <div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;font-size:12px;
                  color:var(--gray-600);margin-bottom:5px">
        <span>年度目標 ${goal} 分</span>
        <span style="color:var(--green-500);font-weight:600">${credits} 分</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="width:${Math.min(credits / goal * 100, 100).toFixed(0)}%"></div>
      </div>
    </div>
    <p class="text-sm text-muted">
      已完成 ${done} 堂 ・ 達成率 ${Math.min(Math.round(credits / goal * 100), 100)}%
    </p>`

  const up = rows
    .filter(r => r.status === 'enrolled' && new Date(r.courses?.date) >= now)
    .sort((a, b) => new Date(a.courses.date) - new Date(b.courses.date))
    .slice(0, 3)

  document.getElementById('upcoming-list').innerHTML = up.length === 0
    ? '<p class="text-sm text-muted">目前無待上課程</p>'
    : up.map(r => `
        <div class="course-card" style="flex-direction:column;align-items:flex-start;gap:4px;margin-bottom:8px">
          <div class="course-name">${r.courses.title}</div>
          <div class="course-meta">
            ${fmtDate(r.courses.date)} · ${r.courses.location} · ${r.courses.credits} 積分
          </div>
        </div>`).join('')
}

// ── 課程列表 ──────────────────────────────────────────────
async function loadCourses() {
  const { data } = await supabase.from('courses').select('*')
    .eq('is_published', true)
    .gte('registration_deadline', new Date().toISOString().split('T')[0])
    .order('date', { ascending: true })
  allCourses = data || []
  renderCourses(allCourses)
}

function renderCourses(list) {
  const el = document.getElementById('courses-list')
  if (!list.length) {
    el.innerHTML = '<p class="text-muted">目前沒有開放報名的課程</p>'
    return
  }
  el.innerHTML = list.map(c => {
    const left = (c.max_participants || 0) - (c.enrolled_count || 0)
    const full  = left <= 0
    const badge = full
      ? '<span class="badge badge-amber">額滿・可候補</span>'
      : left <= 5
        ? `<span class="badge badge-amber">僅剩 ${left} 名</span>`
        : '<span class="badge badge-green">開放報名</span>'
    return `
    <div class="course-card">
      <div>
        <div class="course-name">${c.title}</div>
        <div class="course-meta">
          ${fmtDate(c.date)} · ${c.location} · ${c.hours}h · ${c.credits} 積分
        </div>
        <div class="course-meta">
          名額 ${c.enrolled_count || 0}/${c.max_participants} ·
          截止 ${c.registration_deadline} · ${c.category}
        </div>
      </div>
      <div class="course-actions">
        ${badge}
        <button class="btn-primary btn-sm"
          onclick="openModal('${c.id}','${c.title.replace(/'/g,'\u2019')}',${full})">
          ${full ? '加入候補' : '立即報名'}
        </button>
      </div>
    </div>`
  }).join('')
}

function filterCourses() {
  const q   = document.getElementById('s-search').value.toLowerCase()
  const cat = document.getElementById('s-cat').value
  renderCourses(allCourses.filter(c =>
    c.title.toLowerCase().includes(q) && (!cat || c.category === cat)
  ))
}

// ── 報名 Modal ────────────────────────────────────────────
function openModal(courseId, title, isFull) {
  enrollingId = courseId
  document.getElementById('modal-title').textContent  = (isFull ? '候補報名：' : '報名：') + title
  document.getElementById('modal-info').textContent   = isFull
    ? '此課程已額滿，您將進入候補名單，有空位時系統通知。'
    : '報名確認後無法自行取消，請確認資料正確。'
  document.getElementById('e-error').style.display    = 'none'
  document.getElementById('e-success').style.display  = 'none'
  document.getElementById('e-submit').disabled        = false
  document.getElementById('e-submit').textContent     = '確認報名'
  // 清空身分證欄（每次重新輸入，避免快取）
  document.getElementById('e-id').value = ''
  document.getElementById('enroll-modal').style.display = 'flex'
}

async function submitEnroll(e) {
  e.preventDefault()
  const btn = document.getElementById('e-submit')
  const err = document.getElementById('e-error')
  const suc = document.getElementById('e-success')
  err.style.display = 'none'; suc.style.display = 'none'

  // 前端驗證身分證格式
  const rawID = document.getElementById('e-id').value.trim().toUpperCase()
  if (!validateID(rawID)) {
    err.textContent = '身分證字號格式錯誤，請重新輸入（例：A123456789）'
    err.style.display = 'block'
    return
  }

  btn.disabled = true; btn.textContent = '送出中…'

  // 呼叫 safe_enroll（資料庫 transaction，防止超額）
  const { data, error } = await supabase.rpc('safe_enroll', {
    p_user_id:   me.id,
    p_course_id: enrollingId,
    p_name:      document.getElementById('e-name').value.trim(),
    p_id_number: maskID(rawID),           // 存遮罩後的字號
    p_org:       document.getElementById('e-org').value.trim(),
    p_org_type:  document.getElementById('e-org-type').value,
    p_license:   document.getElementById('e-license').value.trim(),
  })

  if (error || data?.error) {
    err.textContent = data?.error || '報名失敗，請再試一次。'
    err.style.display = 'block'
    btn.disabled = false; btn.textContent = '確認報名'
    return
  }

  suc.textContent = data.status === 'waitlisted'
    ? `已加入候補（第 ${data.waitlist_position} 位），有空缺時將通知您。`
    : '報名成功！請記得準時出席。'
  suc.style.display = 'block'
  btn.textContent = '完成'
  loadCourses(); loadDashboard()
}

// ── 我的報名紀錄 ──────────────────────────────────────────
async function loadEnrollments() {
  const { data } = await supabase
    .from('enrollments').select('*, courses(*)')
    .eq('user_id', me.id)
    .order('created_at', { ascending: false })

  const tbody = document.getElementById('enroll-tbody')
  if (!data?.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--gray-400)">尚無報名紀錄</td></tr>'
    return
  }
  const now = new Date()
  tbody.innerHTML = data.map(r => {
    const past = new Date(r.courses?.date) < now
    const statusBadge = {
      enrolled:   '<span class="badge badge-green">已報名</span>',
      waitlisted: `<span class="badge badge-blue">候補 #${r.waitlist_position}</span>`,
      cancelled:  '<span class="badge badge-gray">已取消</span>',
    }[r.status] || r.status
    const attend = r.attended
      ? '<span style="color:var(--green-500)">✓ 出席</span>'
      : past ? '<span style="color:var(--red-500)">✗ 缺席</span>' : '—'
    return `<tr>
      <td>${r.courses?.title || '—'}</td>
      <td>${fmtDate(r.courses?.date)}</td>
      <td>${r.courses?.location || '—'}</td>
      <td>${r.courses?.credits || '—'}</td>
      <td>${statusBadge}</td>
      <td>${attend}</td>
    </tr>`
  }).join('')
}

// ── 積分查詢 ──────────────────────────────────────────────
async function loadCredits() {
  const { data } = await supabase
    .from('enrollments').select('*, courses(*)')
    .eq('user_id', me.id)
    .eq('attended', true)
    .order('created_at', { ascending: false })

  const total = (data || []).reduce((s, r) => s + (r.courses?.credits || 0), 0)
  const bycat = {}
  ;(data || []).forEach(r => {
    const cat = r.courses?.category || '其他'
    bycat[cat] = (bycat[cat] || 0) + (r.courses?.credits || 0)
  })

  document.getElementById('credits-summary').innerHTML = `
    <div style="text-align:center;padding:8px 0 16px">
      <div style="font-size:48px;font-weight:700;color:var(--green-500)">${total}</div>
      <div class="text-muted text-sm">本年度已取得積分 ／ 目標 20 分</div>
    </div>
    <div class="divider"></div>
    ${Object.entries(bycat).map(([k, v]) => `
      <div style="display:flex;justify-content:space-between;
                  padding:7px 0;border-bottom:1px solid var(--gray-100);font-size:13px">
        <span class="text-muted">${k}</span>
        <span style="font-weight:600">${v} 分</span>
      </div>`).join('')}
  `

  document.getElementById('credits-tbody').innerHTML = !data?.length
    ? '<tr><td colspan="4" style="text-align:center;padding:16px;color:var(--gray-400)">尚無積分紀錄</td></tr>'
    : data.map(r => `<tr>
        <td>${fmtDate(r.courses?.date)}</td>
        <td>${r.courses?.title || '—'}</td>
        <td>${r.courses?.credits || 0}</td>
        <td><span class="badge badge-green">已認定</span></td>
      </tr>`).join('')
}

// ── 工具函式 ──────────────────────────────────────────────
function fmtDate(d) {
  return d
    ? new Date(d).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' })
    : '—'
}
