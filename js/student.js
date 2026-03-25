// student.js — 學員頁面所有功能

let currentUser = null
let currentProfile = null
let allCourses = []
let enrollingCourseId = null

// ── 初始化 ────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) { window.location.href = '../index.html'; return }

  currentUser = session.user

  // 取得個人資料
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single()

  currentProfile = profile
  document.getElementById('user-name').textContent = profile?.name || currentUser.email

  // 預填報名表
  if (profile) {
    document.getElementById('enroll-name').value = profile.name || ''
    document.getElementById('enroll-id').value = profile.id_number || ''
    document.getElementById('enroll-org').value = profile.org || ''
    document.getElementById('enroll-license').value = profile.license || ''
    if (profile.org_type) document.getElementById('enroll-org-type').value = profile.org_type
  }

  await Promise.all([loadDashboard(), loadCourses()])
})

// ── 導覽 ──────────────────────────────────────────────────
function showPage(pageId, navEl) {
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'))
  document.getElementById('page-' + pageId).classList.add('active')
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'))
  if (navEl) navEl.classList.add('active')

  if (pageId === 'my-enrollments') loadMyEnrollments()
  if (pageId === 'credits') loadCredits()
}

// ── 儀表板 ────────────────────────────────────────────────
async function loadDashboard() {
  const year = new Date().getFullYear()

  // 取得報名資料
  const { data: enrollments } = await supabase
    .from('enrollments')
    .select('*, courses(*)')
    .eq('user_id', currentUser.id)

  if (!enrollments) return

  const now = new Date()
  let totalCredits = 0
  let completed = 0
  let upcoming = 0
  let waitlist = 0

  enrollments.forEach(e => {
    const courseDate = new Date(e.courses?.date)
    if (e.status === 'enrolled') {
      if (courseDate < now && e.attended) {
        completed++
        totalCredits += (e.courses?.credits || 0)
      } else if (courseDate >= now) {
        upcoming++
      }
    } else if (e.status === 'waitlisted') {
      waitlist++
    }
  })

  document.getElementById('total-credits').textContent = totalCredits
  document.getElementById('completed-count').textContent = completed
  document.getElementById('upcoming-count').textContent = upcoming
  document.getElementById('waitlist-count').textContent = waitlist

  // 積分進度條
  const progressEl = document.getElementById('credit-progress')
  progressEl.innerHTML = `
    <div style="margin-bottom:14px;">
      <div class="flex justify-between text-sm text-muted mb-4" style="margin-bottom:6px;">
        <span>年度目標（20分）</span>
        <span style="color:var(--green-700);font-weight:600">${totalCredits} / 20 分</span>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:${Math.min(totalCredits/20*100,100).toFixed(0)}%"></div></div>
    </div>
  `

  // 即將到來的課程
  const upcomingEl = document.getElementById('upcoming-courses')
  const upcomingList = enrollments
    .filter(e => e.status === 'enrolled' && new Date(e.courses?.date) >= now)
    .sort((a, b) => new Date(a.courses.date) - new Date(b.courses.date))
    .slice(0, 3)

  if (upcomingList.length === 0) {
    upcomingEl.innerHTML = '<p class="text-sm text-muted" style="padding:8px 0">尚無即將到來的課程</p>'
    return
  }

  upcomingEl.innerHTML = upcomingList.map(e => `
    <div class="course-card" style="flex-direction:column;align-items:flex-start;gap:6px;">
      <div class="course-name">${e.courses.title}</div>
      <div class="course-meta">${formatDate(e.courses.date)} · ${e.courses.location} · ${e.courses.credits} 積分</div>
    </div>
  `).join('')
}

// ── 課程列表 ──────────────────────────────────────────────
async function loadCourses() {
  const { data: courses, error } = await supabase
    .from('courses')
    .select('*')
    .eq('is_published', true)
    .gte('registration_deadline', new Date().toISOString().split('T')[0])
    .order('date', { ascending: true })

  if (error) { document.getElementById('courses-list').innerHTML = '<p class="text-muted">載入失敗</p>'; return }

  allCourses = courses || []
  renderCourses(allCourses)
}

function renderCourses(list) {
  const el = document.getElementById('courses-list')
  if (list.length === 0) {
    el.innerHTML = '<p class="text-muted">目前沒有開放報名的課程</p>'
    return
  }

  el.innerHTML = list.map(c => {
    const spots = c.max_participants - (c.enrolled_count || 0)
    const isFull = spots <= 0
    const isDeadlinePassed = new Date(c.registration_deadline) < new Date()

    let statusBadge = `<span class="badge badge-green">開放報名</span>`
    if (isDeadlinePassed) statusBadge = `<span class="badge badge-gray">報名截止</span>`
    else if (isFull) statusBadge = `<span class="badge badge-amber">額滿候補</span>`
    else if (spots <= 5) statusBadge = `<span class="badge badge-amber">僅剩 ${spots} 名</span>`

    return `
    <div class="course-card">
      <div>
        <div class="course-name">${c.title}</div>
        <div class="course-meta">
          ${formatDate(c.date)} · ${c.location} · ${c.hours} 小時 · ${c.credits} 積分 ·
          名額 ${c.enrolled_count || 0}/${c.max_participants}
        </div>
        <div class="course-meta" style="margin-top:2px;">報名截止：${c.registration_deadline} · ${c.category}</div>
      </div>
      <div class="course-actions">
        ${statusBadge}
        ${!isDeadlinePassed
          ? `<button class="btn-primary btn-sm" onclick="openEnrollModal('${c.id}', '${c.title}')">
               ${isFull ? '加入候補' : '立即報名'}
             </button>`
          : ''}
      </div>
    </div>`
  }).join('')
}

function filterCourses() {
  const q = document.getElementById('course-search').value.toLowerCase()
  const cat = document.getElementById('course-filter-cat').value
  const filtered = allCourses.filter(c =>
    c.title.toLowerCase().includes(q) &&
    (!cat || c.category === cat)
  )
  renderCourses(filtered)
}

// ── 報名 Modal ────────────────────────────────────────────
function openEnrollModal(courseId, courseTitle) {
  enrollingCourseId = courseId
  document.getElementById('modal-course-title').textContent = `報名：${courseTitle}`
  document.getElementById('enroll-error').style.display = 'none'
  document.getElementById('enroll-success').style.display = 'none'
  document.getElementById('enroll-submit-btn').disabled = false
  document.getElementById('enroll-submit-btn').textContent = '確認報名'
  document.getElementById('enroll-modal').style.display = 'flex'
}

function closeModal(e) {
  if (e.target.id === 'enroll-modal') document.getElementById('enroll-modal').style.display = 'none'
}

async function submitEnrollment(e) {
  e.preventDefault()
  const btn = document.getElementById('enroll-submit-btn')
  const errEl = document.getElementById('enroll-error')
  const sucEl = document.getElementById('enroll-success')
  errEl.style.display = 'none'
  sucEl.style.display = 'none'
  btn.disabled = true
  btn.textContent = '送出中...'

  // 確認課程目前狀態
  const { data: course } = await supabase
    .from('courses')
    .select('*')
    .eq('id', enrollingCourseId)
    .single()

  const isFull = (course.enrolled_count || 0) >= course.max_participants
  const status = isFull ? 'waitlisted' : 'enrolled'
  const waitlistPos = isFull ? (course.waitlist_count || 0) + 1 : null

  // 避免重複報名
  const { data: existing } = await supabase
    .from('enrollments')
    .select('id')
    .eq('user_id', currentUser.id)
    .eq('course_id', enrollingCourseId)
    .single()

  if (existing) {
    errEl.textContent = '您已報名此課程或在候補名單中。'
    errEl.style.display = 'block'
    btn.disabled = false
    btn.textContent = '確認報名'
    return
  }

  const { error } = await supabase.from('enrollments').insert({
    user_id: currentUser.id,
    course_id: enrollingCourseId,
    status,
    waitlist_position: waitlistPos,
    name_snapshot: document.getElementById('enroll-name').value,
    id_number_snapshot: document.getElementById('enroll-id').value,
    org_snapshot: document.getElementById('enroll-org').value,
    org_type_snapshot: document.getElementById('enroll-org-type').value,
    license_snapshot: document.getElementById('enroll-license').value,
  })

  if (error) {
    errEl.textContent = '報名失敗，請再試一次。'
    errEl.style.display = 'block'
    btn.disabled = false
    btn.textContent = '確認報名'
    return
  }

  // 更新 enrolled_count
  if (!isFull) {
    await supabase.from('courses')
      .update({ enrolled_count: (course.enrolled_count || 0) + 1 })
      .eq('id', enrollingCourseId)
  } else {
    await supabase.from('courses')
      .update({ waitlist_count: (course.waitlist_count || 0) + 1 })
      .eq('id', enrollingCourseId)
  }

  sucEl.textContent = isFull
    ? `已加入候補名單（排隊第 ${waitlistPos} 位），有空缺時將通知您。`
    : '報名成功！請注意上課日期。'
  sucEl.style.display = 'block'
  btn.textContent = '已完成'
  loadCourses()
  loadDashboard()
}

// ── 我的報名紀錄 ──────────────────────────────────────────
async function loadMyEnrollments() {
  const { data } = await supabase
    .from('enrollments')
    .select('*, courses(*)')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false })

  const tbody = document.getElementById('enrollments-tbody')
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-muted" style="text-align:center;padding:20px;">尚無報名紀錄</td></tr>'
    return
  }

  tbody.innerHTML = data.map(e => {
    const statusMap = {
      enrolled: `<span class="badge badge-green">已報名</span>`,
      waitlisted: `<span class="badge badge-blue">候補 #${e.waitlist_position}</span>`,
      cancelled: `<span class="badge badge-gray">已取消</span>`,
    }
    const attended = e.attended
      ? '<span style="color:var(--green-500)">✓ 出席</span>'
      : (new Date(e.courses?.date) < new Date() ? '<span style="color:var(--red-500)">✗ 缺席</span>' : '—')

    return `<tr>
      <td>${e.courses?.title || '—'}</td>
      <td>${formatDate(e.courses?.date)}</td>
      <td>${e.courses?.location || '—'}</td>
      <td>${e.courses?.credits || '—'}</td>
      <td>${statusMap[e.status] || e.status}</td>
      <td>${attended}</td>
    </tr>`
  }).join('')
}

// ── 積分 ──────────────────────────────────────────────────
async function loadCredits() {
  const { data } = await supabase
    .from('enrollments')
    .select('*, courses(*)')
    .eq('user_id', currentUser.id)
    .eq('attended', true)
    .order('created_at', { ascending: false })

  const summaryEl = document.getElementById('credits-summary')
  const tbody = document.getElementById('credits-tbody')

  if (!data) return

  const total = data.reduce((sum, e) => sum + (e.courses?.credits || 0), 0)
  const byCategory = {}
  data.forEach(e => {
    const cat = e.courses?.category || '其他'
    byCategory[cat] = (byCategory[cat] || 0) + (e.courses?.credits || 0)
  })

  summaryEl.innerHTML = `
    <div style="text-align:center;padding:10px 0 16px;">
      <div style="font-size:48px;font-weight:700;color:var(--green-500)">${total}</div>
      <div class="text-muted text-sm">本年度已取得積分</div>
      <div class="text-sm" style="margin-top:4px;color:var(--gray-400)">目標 20 分 ／ 達成率 ${Math.min(Math.round(total/20*100),100)}%</div>
    </div>
    <div class="divider"></div>
    ${Object.entries(byCategory).map(([cat, pts]) => `
      <div class="flex justify-between" style="padding:7px 0;border-bottom:1px solid var(--gray-100);font-size:13px;">
        <span class="text-muted">${cat}</span>
        <span style="font-weight:600">${pts} 分</span>
      </div>
    `).join('')}
  `

  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-muted" style="text-align:center;padding:16px;">尚無積分紀錄</td></tr>'
    return
  }

  tbody.innerHTML = data.map(e => `
    <tr>
      <td>${formatDate(e.courses?.date)}</td>
      <td>${e.courses?.title || '—'}</td>
      <td>${e.courses?.credits || 0}</td>
      <td><span class="badge badge-green">已認定</span></td>
    </tr>
  `).join('')
}

// ── 工具 ──────────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', year: 'numeric' })
}
