// organizer.js — 主辦單位功能

let currentUser = null
let orgCourses = []
let selectedCourseForQR = null
let rosterData = []

window.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) { window.location.href = '../index.html'; return }
  currentUser = session.user

  const { data: profile } = await supabase
    .from('profiles').select('name, role').eq('id', currentUser.id).single()

  if (!profile || (profile.role !== 'organizer' && profile.role !== 'admin')) {
    alert('您沒有主辦單位權限')
    window.location.href = '../index.html'
    return
  }

  document.getElementById('user-name').textContent = profile.name || currentUser.email

  // 設定報名截止日預設值（今天 + 7天）
  const defaultDeadline = new Date()
  defaultDeadline.setDate(defaultDeadline.getDate() + 7)
  document.getElementById('c-deadline').value = defaultDeadline.toISOString().split('T')[0]

  await Promise.all([loadDashboard(), loadOrgCourses()])
  loadReport()
})

function showPage(pageId, navEl) {
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'))
  document.getElementById('page-' + pageId).classList.add('active')
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'))
  if (navEl) navEl.classList.add('active')
}

// ── 儀表板 ────────────────────────────────────────────────
async function loadDashboard() {
  const { data: courses } = await supabase
    .from('courses')
    .select('*, enrollments(count)')
    .eq('organizer_id', currentUser.id)
    .order('date', { ascending: false })
    .limit(10)

  if (!courses) return
  orgCourses = courses

  const totalEnroll = courses.reduce((s, c) => s + (c.enrolled_count || 0), 0)
  const totalHours = courses.reduce((s, c) => s + (c.hours || 0), 0)

  // 計算出席率（有出席資料的課程）
  const { data: attendanceData } = await supabase
    .from('enrollments')
    .select('attended, course_id')
    .in('course_id', courses.map(c => c.id))

  let attendRate = '-'
  if (attendanceData && attendanceData.length > 0) {
    const attended = attendanceData.filter(e => e.attended).length
    attendRate = Math.round(attended / attendanceData.length * 100) + '%'
  }

  document.getElementById('org-course-count').textContent = courses.length
  document.getElementById('org-enroll-count').textContent = totalEnroll
  document.getElementById('org-attend-rate').textContent = attendRate
  document.getElementById('org-hours').textContent = totalHours + 'h'

  const tbody = document.getElementById('dashboard-courses-tbody')
  tbody.innerHTML = courses.slice(0, 6).map(c => {
    const isPast = new Date(c.date) < new Date()
    return `<tr>
      <td>${c.title}</td>
      <td>${formatDate(c.date)}</td>
      <td>${c.enrolled_count || 0} / ${c.max_participants}</td>
      <td>-</td>
      <td><span class="badge ${isPast ? 'badge-gray' : 'badge-green'}">${isPast ? '已結束' : '進行中'}</span></td>
    </tr>`
  }).join('')
}

// ── 課程列表 ──────────────────────────────────────────────
async function loadOrgCourses() {
  const { data: courses } = await supabase
    .from('courses')
    .select('*')
    .eq('organizer_id', currentUser.id)
    .order('date', { ascending: false })

  orgCourses = courses || []
  renderOrgCourses()
  populateQRSelect()
}

function renderOrgCourses() {
  const el = document.getElementById('org-courses-list')
  if (orgCourses.length === 0) {
    el.innerHTML = '<p class="text-muted">尚未建立任何課程</p>'
    return
  }

  el.innerHTML = orgCourses.map(c => {
    const isPast = new Date(c.date) < new Date()
    const statusBadge = !c.is_published
      ? `<span class="badge badge-amber">草稿</span>`
      : isPast
        ? `<span class="badge badge-gray">已結束</span>`
        : `<span class="badge badge-green">開放中</span>`

    return `<div class="course-card">
      <div>
        <div class="course-name">${c.title}</div>
        <div class="course-meta">${formatDate(c.date)} · ${c.location} · ${c.hours}h · ${c.credits}積分 · 名額${c.enrolled_count||0}/${c.max_participants}</div>
      </div>
      <div class="course-actions">
        ${statusBadge}
        <span class="text-sm text-muted">候補 ${c.waitlist_count||0}</span>
        <button class="btn-secondary btn-sm" onclick="openRoster('${c.id}', '${c.title}')">名單</button>
        ${!c.is_published
          ? `<button class="btn-primary btn-sm" onclick="publishCourse('${c.id}')">發布</button>`
          : ''}
      </div>
    </div>`
  }).join('')
}

function populateQRSelect() {
  const sel = document.getElementById('qr-course-select')
  const today = new Date().toISOString().split('T')[0]
  const todayCourses = orgCourses.filter(c => c.date >= today && c.is_published)
  sel.innerHTML = '<option value="">-- 請選擇課程 --</option>' +
    todayCourses.map(c => `<option value="${c.id}">${c.title} (${c.date})</option>`).join('')
}

// ── 建立課程 ──────────────────────────────────────────────
async function createCourse(e) {
  e.preventDefault()
  const btn = e.submitter
  const isPublish = btn.value === 'publish'
  const errEl = document.getElementById('create-error')
  const sucEl = document.getElementById('create-success')
  errEl.style.display = 'none'
  sucEl.style.display = 'none'
  btn.disabled = true

  const { error } = await supabase.from('courses').insert({
    organizer_id: currentUser.id,
    title: document.getElementById('c-title').value,
    category: document.getElementById('c-category').value,
    location: document.getElementById('c-location').value,
    date: document.getElementById('c-date').value,
    start_time: document.getElementById('c-start-time').value,
    hours: parseFloat(document.getElementById('c-hours').value),
    credits: parseInt(document.getElementById('c-credits').value),
    max_participants: parseInt(document.getElementById('c-max').value),
    registration_deadline: document.getElementById('c-deadline').value,
    description: document.getElementById('c-description').value,
    is_published: isPublish,
    enrolled_count: 0,
    waitlist_count: 0,
  })

  if (error) {
    errEl.textContent = '建立失敗：' + error.message
    errEl.style.display = 'block'
    btn.disabled = false
    return
  }

  sucEl.textContent = isPublish ? '課程已發布！學員現在可以報名。' : '草稿已儲存。'
  sucEl.style.display = 'block'
  btn.disabled = false
  e.target.reset()
  await loadOrgCourses()
  await loadDashboard()
}

async function publishCourse(courseId) {
  await supabase.from('courses').update({ is_published: true }).eq('id', courseId)
  await loadOrgCourses()
}

// ── 報名名單 ──────────────────────────────────────────────
async function openRoster(courseId, courseTitle) {
  document.getElementById('roster-title').textContent = `報名名單 — ${courseTitle}`
  document.getElementById('roster-modal').style.display = 'flex'

  const { data } = await supabase
    .from('enrollments')
    .select('*')
    .eq('course_id', courseId)
    .order('created_at', { ascending: true })

  rosterData = data || []
  const tbody = document.getElementById('roster-tbody')

  let regular = 0, wait = 0
  tbody.innerHTML = rosterData.map((e, i) => {
    const isWait = e.status === 'waitlisted'
    if (!isWait) regular++; else wait++
    return `<tr>
      <td>${isWait ? 'W' + e.waitlist_position : regular}</td>
      <td>${e.name_snapshot || '—'}</td>
      <td>${e.org_type_snapshot || '—'}</td>
      <td>${e.org_snapshot || '—'}</td>
      <td>${e.license_snapshot || '—'}</td>
      <td>${new Date(e.created_at).toLocaleString('zh-TW')}</td>
      <td><span class="badge ${isWait ? 'badge-blue' : 'badge-green'}">${isWait ? '候補' : '正取'}</span></td>
    </tr>`
  }).join('')
}

function exportRosterCSV() {
  const headers = ['序號', '姓名', '機構別', '機構名稱', '證照', '報名時間', '狀態']
  const rows = rosterData.map((e, i) => [
    i + 1, e.name_snapshot, e.org_type_snapshot, e.org_snapshot,
    e.license_snapshot, e.created_at, e.status === 'waitlisted' ? '候補' : '正取'
  ])
  downloadCSV([headers, ...rows], '報名名單')
}

// ── QR 簽到 ───────────────────────────────────────────────
async function loadQRPanel() {
  const courseId = document.getElementById('qr-course-select').value
  if (!courseId) { document.getElementById('qr-panel').style.display = 'none'; return }

  const course = orgCourses.find(c => c.id === courseId)
  selectedCourseForQR = course
  document.getElementById('qr-panel').style.display = 'block'

  // 產生 QR code（連結到簽到 URL）
  const checkinUrl = `${window.location.origin}/pages/checkin.html?course=${courseId}&token=${btoa(courseId + ':' + new Date().toDateString())}`
  const canvas = document.getElementById('qr-canvas')
  QRCode.toCanvas(canvas, checkinUrl, { width: 200, margin: 2 }, () => {})

  await loadAttendance(courseId)
}

async function loadAttendance(courseId) {
  const { data } = await supabase
    .from('enrollments')
    .select('*')
    .eq('course_id', courseId)
    .eq('status', 'enrolled')

  const attended = data?.filter(e => e.attended) || []
  const absent = data?.filter(e => !e.attended) || []

  document.getElementById('attend-count').textContent = attended.length
  document.getElementById('absent-count').textContent = absent.length

  const tbody = document.getElementById('attendance-tbody')
  tbody.innerHTML = (data || []).map(e => `
    <tr>
      <td>${e.name_snapshot || '—'}</td>
      <td>${e.org_snapshot || '—'}</td>
      <td>${e.attended ? new Date(e.attended_at).toLocaleTimeString('zh-TW') : '<span class="text-muted">未到</span>'}</td>
      <td>
        ${!e.attended
          ? `<button class="btn-secondary btn-sm" onclick="markAttended('${e.id}')">手動簽到</button>`
          : '<span style="color:var(--green-500)">✓</span>'}
      </td>
    </tr>
  `).join('')
}

async function markAttended(enrollmentId) {
  await supabase.from('enrollments').update({
    attended: true,
    attended_at: new Date().toISOString()
  }).eq('id', enrollmentId)

  const courseId = document.getElementById('qr-course-select').value
  await loadAttendance(courseId)
}

function downloadQR() {
  const canvas = document.getElementById('qr-canvas')
  const link = document.createElement('a')
  link.download = `QR_${selectedCourseForQR?.title || 'checkin'}.png`
  link.href = canvas.toDataURL()
  link.click()
}

// ── 統計報表 ──────────────────────────────────────────────
async function loadReport() {
  const period = document.getElementById('report-period').value
  const year = new Date().getFullYear()
  const startMonth = period === 'H1' ? '01' : '07'
  const endMonth = period === 'H1' ? '06' : '12'
  const start = `${year}-${startMonth}-01`
  const end = `${year}-${endMonth}-31`

  const { data: courses } = await supabase
    .from('courses')
    .select('*')
    .eq('organizer_id', currentUser.id)
    .gte('date', start)
    .lte('date', end)
    .order('date')

  if (!courses || courses.length === 0) {
    document.getElementById('report-tbody').innerHTML = '<tr><td colspan="8" class="text-muted" style="text-align:center;padding:16px;">此期間無課程</td></tr>'
    return
  }

  // 取各課程出席數
  const { data: enrolls } = await supabase
    .from('enrollments')
    .select('course_id, attended')
    .in('course_id', courses.map(c => c.id))

  const attendMap = {}
  enrolls?.forEach(e => {
    if (!attendMap[e.course_id]) attendMap[e.course_id] = { total: 0, attended: 0 }
    attendMap[e.course_id].total++
    if (e.attended) attendMap[e.course_id].attended++
  })

  let totalHours = 0, totalAttendees = 0, totalEnrolled = 0
  courses.forEach(c => {
    totalHours += c.hours || 0
    totalAttendees += attendMap[c.id]?.attended || 0
    totalEnrolled += attendMap[c.id]?.total || 0
  })

  document.getElementById('r-courses').textContent = courses.length
  document.getElementById('r-hours').textContent = totalHours + 'h'
  document.getElementById('r-attendees').textContent = totalAttendees
  document.getElementById('r-rate').textContent = totalEnrolled > 0
    ? Math.round(totalAttendees / totalEnrolled * 100) + '%' : '-'

  document.getElementById('report-tbody').innerHTML = courses.map(c => {
    const a = attendMap[c.id] || { total: 0, attended: 0 }
    const rate = a.total > 0 ? Math.round(a.attended / a.total * 100) : '-'
    return `<tr>
      <td>${c.title}</td>
      <td>${formatDate(c.date)}</td>
      <td>${c.hours}h</td>
      <td>${c.credits}</td>
      <td>${c.enrolled_count || 0}</td>
      <td>${a.attended}</td>
      <td style="color:${rate >= 85 ? 'var(--green-500)' : 'var(--amber-500)'}">${rate}%</td>
      <td>${c.waitlist_count || 0}</td>
    </tr>`
  }).join('')
}

function exportCSV() {
  const rows = [['課程名稱','日期','時數','積分','報名人數','出席人數','候補人數']]
  orgCourses.forEach(c => {
    rows.push([c.title, c.date, c.hours, c.credits, c.enrolled_count||0, '-', c.waitlist_count||0])
  })
  downloadCSV(rows, '課程統計報表')
}

function downloadCSV(rows, filename) {
  const bom = '\uFEFF'
  const csv = bom + rows.map(r => r.map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename + '.csv'
  link.click()
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('zh-TW', { year:'numeric', month:'long', day:'numeric' })
}
