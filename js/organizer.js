// organizer.js
let me = null, myCourses = [], rosterRows = [], qrCourseId = null, qrUrl = ''

window.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) { window.location.href = window.BASE_PATH + '/index.html'; return }
  me = session.user

  const { data: p } = await supabase.from('profiles').select('name,role').eq('id', me.id).single()
  if (!p || !['organizer','admin'].includes(p.role)) {
    alert('您沒有主辦單位權限')
    window.location.href = window.BASE_PATH + '/index.html'
    return
  }
  document.getElementById('user-name').textContent = p.name || me.email

  const d = new Date(); d.setDate(d.getDate() + 7)
  document.getElementById('c-deadline').value = d.toISOString().split('T')[0]

  await loadAll()
  loadReport()
})

async function loadAll() { await Promise.all([loadDashboard(), loadCourses()]) }

function showPage(id, el) {
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'))
  document.getElementById('page-' + id).classList.add('active')
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'))
  el?.classList.add('active')
  if (id === 'report') loadReport()
}

// ── 儀表板 ────────────────────────────────────────────────
async function loadDashboard() {
  const { data: cs } = await supabase.from('courses').select('*')
    .eq('organizer_id', me.id).order('date', { ascending: false }).limit(8)
  myCourses = cs || []

  const totalEnroll = myCourses.reduce((s, c) => s + (c.enrolled_count || 0), 0)
  const totalHours  = myCourses.reduce((s, c) => s + (c.hours || 0), 0)

  document.getElementById('d-courses').textContent = myCourses.length
  document.getElementById('d-enroll').textContent  = totalEnroll
  document.getElementById('d-hours').textContent   = totalHours + 'h'

  if (myCourses.length > 0) {
    const { data: atts } = await supabase.from('enrollments').select('attended')
      .in('course_id', myCourses.map(c => c.id))
    if (atts?.length) {
      const rate = Math.round(atts.filter(a => a.attended).length / atts.length * 100)
      document.getElementById('d-rate').textContent = rate + '%'
    } else {
      document.getElementById('d-rate').textContent = '—'
    }
  }

  const now = new Date()
  document.getElementById('d-tbody').innerHTML = myCourses.slice(0, 6).map(c => `
    <tr>
      <td>${c.title}</td>
      <td>${fmtDate(c.date)}</td>
      <td>${c.enrolled_count || 0} / ${c.max_participants}</td>
      <td><span class="badge ${!c.is_published ? 'badge-amber' : new Date(c.date) < now ? 'badge-gray' : 'badge-green'}">
        ${!c.is_published ? '草稿' : new Date(c.date) < now ? '已結束' : '開放中'}</span></td>
      <td><button class="btn-secondary btn-sm" onclick="openRoster('${c.id}','${c.title.replace(/'/g, '\u2019')}')">名單</button></td>
    </tr>`).join('')
}

// ── 課程列表 ──────────────────────────────────────────────
async function loadCourses() {
  const { data } = await supabase.from('courses').select('*')
    .eq('organizer_id', me.id).order('date', { ascending: false })
  myCourses = data || []
  renderCourses()
  fillQRSelect()
}

function renderCourses() {
  const el = document.getElementById('courses-list')
  if (!myCourses.length) { el.innerHTML = '<p class="text-muted">尚未建立課程</p>'; return }
  const now = new Date()
  el.innerHTML = myCourses.map(c => {
    const isPast = new Date(c.date) < now
    const badge  = !c.is_published
      ? '<span class="badge badge-amber">草稿</span>'
      : isPast
        ? '<span class="badge badge-gray">已結束</span>'
        : '<span class="badge badge-green">開放中</span>'
    return `<div class="course-card">
      <div>
        <div class="course-name">${c.title}</div>
        <div class="course-meta">${fmtDate(c.date)} · ${c.location} · ${c.hours}h · ${c.credits}積分 · 名額 ${c.enrolled_count || 0}/${c.max_participants}</div>
        ${c.waitlist_count ? `<div class="course-meta" style="color:var(--blue-700)">候補 ${c.waitlist_count} 人</div>` : ''}
      </div>
      <div class="course-actions">
        ${badge}
        <button class="btn-secondary btn-sm" onclick="openRoster('${c.id}','${c.title.replace(/'/g, '\u2019')}')">名單</button>
        ${!c.is_published
          ? `<button class="btn-primary btn-sm" onclick="publishCourse('${c.id}')">發布</button>`
          : ''}
        <button class="btn-secondary btn-sm"
          style="color:var(--red-500);border-color:var(--red-500)"
          onclick="deleteCourse('${c.id}','${c.title.replace(/'/g, '\u2019')}')">刪除</button>
      </div>
    </div>`
  }).join('')
}

function fillQRSelect() {
  const sel  = document.getElementById('qr-select')
  const list = myCourses.filter(c => c.is_published)
  sel.innerHTML = '<option value="">— 請選擇課程 —</option>' +
    list.map(c => `<option value="${c.id}">${c.title} (${c.date})</option>`).join('')
}

// ── 建立課程 ──────────────────────────────────────────────
async function createCourse(e) {
  e.preventDefault()
  const btn = e.submitter
  const err = document.getElementById('c-error')
  const suc = document.getElementById('c-success')
  err.style.display = 'none'; suc.style.display = 'none'
  btn.disabled = true
  const origTxt = btn.textContent; btn.textContent = '儲存中…'

  const { error } = await supabase.from('courses').insert({
    organizer_id:          me.id,
    title:                 document.getElementById('c-title').value,
    category:              document.getElementById('c-cat').value,
    location:              document.getElementById('c-loc').value,
    date:                  document.getElementById('c-date').value,
    start_time:            document.getElementById('c-time').value,
    hours:                 parseFloat(document.getElementById('c-hours').value),
    credits:               parseInt(document.getElementById('c-credits').value),
    max_participants:      parseInt(document.getElementById('c-max').value),
    registration_deadline: document.getElementById('c-deadline').value,
    description:           document.getElementById('c-desc').value,
    is_published:          btn.value === 'publish',
    enrolled_count:        0,
    waitlist_count:        0,
  })

  if (error) {
    err.textContent = '建立失敗：' + error.message; err.style.display = 'block'
    btn.disabled = false; btn.textContent = origTxt; return
  }
  suc.textContent = btn.value === 'publish' ? '課程已發布！學員現在可以報名。' : '草稿已儲存。'
  suc.style.display = 'block'; btn.disabled = false; btn.textContent = origTxt
  e.target.reset()
  await loadAll()
}

async function publishCourse(id) {
  await supabase.from('courses').update({ is_published: true }).eq('id', id)
  await loadAll()
}

// ── 刪除課程 ──────────────────────────────────────────────
async function deleteCourse(id, title) {
  const enrolled = myCourses.find(c => c.id === id)?.enrolled_count || 0
  const msg = enrolled > 0
    ? `「${title}」已有 ${enrolled} 人報名！\n刪除後報名紀錄一併移除，無法復原。\n確定要刪除嗎？`
    : `確定要刪除「${title}」嗎？此操作無法復原。`
  if (!confirm(msg)) return

  const { error } = await supabase.from('courses').delete().eq('id', id)
  if (error) { alert('刪除失敗：' + error.message); return }
  await loadAll()
}

// ── 名單 Modal ────────────────────────────────────────────
async function openRoster(courseId, title) {
  document.getElementById('roster-title').textContent = '報名名單 — ' + title
  document.getElementById('roster-modal').style.display = 'flex'
  document.getElementById('roster-tbody').innerHTML = '<tr><td colspan="7" class="loading">載入中…</td></tr>'

  const { data } = await supabase.from('enrollments').select('*')
    .eq('course_id', courseId).order('created_at')
  rosterRows = data || []

  const reg  = rosterRows.filter(r => r.status === 'enrolled').length
  const wait = rosterRows.filter(r => r.status === 'waitlisted').length
  document.getElementById('roster-meta').innerHTML =
    `<span class="badge badge-green" style="margin-right:6px">正取 ${reg} 人</span>
     <span class="badge badge-blue">候補 ${wait} 人</span>`

  let regIdx = 0
  document.getElementById('roster-tbody').innerHTML = rosterRows.length === 0
    ? '<tr><td colspan="7" style="text-align:center;padding:16px;color:var(--gray-400)">尚無報名紀錄</td></tr>'
    : rosterRows.map(r => {
        const isWait = r.status === 'waitlisted'
        if (!isWait) regIdx++
        return `<tr>
          <td>${isWait ? 'W' + r.waitlist_position : regIdx}</td>
          <td>${r.name_snapshot || '—'}</td>
          <td style="font-family:monospace;font-size:12px">${r.id_number_snapshot || '—'}</td>
          <td>${r.org_type_snapshot || '—'}</td>
          <td>${r.org_snapshot || '—'}</td>
          <td style="font-size:12px">${new Date(r.created_at).toLocaleString('zh-TW')}</td>
          <td><span class="badge ${isWait ? 'badge-blue' : 'badge-green'}">${isWait ? '候補' : '正取'}</span></td>
        </tr>`
      }).join('')
}

function exportRoster() {
  const hdrs = ['序號', '姓名', '身分證', '機構別', '機構', '報名時間', '狀態']
  let regIdx = 0
  const rows = rosterRows.map(r => {
    const isWait = r.status === 'waitlisted'
    if (!isWait) regIdx++
    return [
      isWait ? 'W' + r.waitlist_position : regIdx,
      r.name_snapshot, r.id_number_snapshot,
      r.org_type_snapshot, r.org_snapshot,
      r.created_at, isWait ? '候補' : '正取'
    ]
  })
  dlCSV([hdrs, ...rows], '報名名單')
}

// ── QR 簽到 ───────────────────────────────────────────────
function loadQR() {
  qrCourseId = document.getElementById('qr-select').value
  if (!qrCourseId) {
    document.getElementById('qr-panel').style.display = 'none'
    return
  }
  document.getElementById('qr-panel').style.display = 'block'

  qrUrl = window.location.origin + window.BASE_PATH +
    '/pages/checkin.html?course=' + qrCourseId +
    '&t=' + btoa(qrCourseId + ':' + new Date().toDateString())

  document.getElementById('qr-link-box').style.display = 'none'
  document.getElementById('qr-link-box').textContent = qrUrl

  // 清空舊的 QR
  const container = document.getElementById('qr-canvas')
  container.innerHTML = ''

  // 用 qrcodejs（需要 div 容器）
  function tryRender(retries) {
    if (typeof QRCode !== 'undefined') {
      new QRCode(container, {
        text:         qrUrl,
        width:        200,
        height:       200,
        correctLevel: QRCode.CorrectLevel.M
      })
    } else if (retries > 0) {
      setTimeout(() => tryRender(retries - 1), 300)
    } else {
      container.innerHTML = '<p style="color:var(--red-500);font-size:12px">QR Code 載入失敗，請重新整理頁面</p>'
    }
  }
  tryRender(15)

  loadAtt()
}

async function loadAtt() {
  if (!qrCourseId) return
  const { data } = await supabase.from('enrollments').select('*')
    .eq('course_id', qrCourseId).eq('status', 'enrolled')

  const attended = (data || []).filter(r => r.attended)
  const absent   = (data || []).filter(r => !r.attended)
  document.getElementById('att-count').textContent = attended.length
  document.getElementById('abs-count').textContent = absent.length

  document.getElementById('att-tbody').innerHTML = !(data || []).length
    ? '<tr><td colspan="4" style="text-align:center;color:var(--gray-400);padding:12px">尚無報名學員</td></tr>'
    : (data || []).map(r => `
        <tr>
          <td>${r.name_snapshot || '—'}</td>
          <td>${r.org_snapshot  || '—'}</td>
          <td>${r.attended
            ? new Date(r.attended_at).toLocaleTimeString('zh-TW')
            : '<span class="text-muted">未到</span>'}</td>
          <td>${!r.attended
            ? `<button class="btn-secondary btn-sm" onclick="markAtt('${r.id}')">手動簽到</button>`
            : '<span style="color:var(--green-500);font-weight:600">✓</span>'}</td>
        </tr>`).join('')
}

async function markAtt(id) {
  await supabase.from('enrollments')
    .update({ attended: true, attended_at: new Date().toISOString() })
    .eq('id', id)
  await loadAtt()
}

function refreshAtt() { loadAtt() }

function dlQR() {
  // qrcodejs 產生的是 <img> 標籤
  const img = document.querySelector('#qr-canvas img')
  if (!img) { alert('請先選擇課程產生 QR Code'); return }
  const a = Object.assign(document.createElement('a'), {
    download: 'QR_簽到.png',
    href: img.src
  })
  a.click()
}

function copyQRLink() {
  if (!qrUrl) return
  navigator.clipboard.writeText(qrUrl).then(() => {
    const box = document.getElementById('qr-link-box')
    box.style.display = 'block'
    box.textContent = '✓ 已複製：' + qrUrl
  }).catch(() => {
    const box = document.getElementById('qr-link-box')
    box.style.display = 'block'
    box.textContent = qrUrl
  })
}

// ── 統計報表 ──────────────────────────────────────────────
async function loadReport() {
  const period = document.getElementById('rpt-period').value
  const yr     = new Date().getFullYear()
  const start  = yr + '-' + (period === 'H1' ? '01' : '07') + '-01'
  const end    = yr + '-' + (period === 'H1' ? '06' : '12') + '-31'

  const { data: cs } = await supabase.from('courses').select('*')
    .eq('organizer_id', me.id).gte('date', start).lte('date', end).order('date')

  if (!cs?.length) {
    document.getElementById('r-tbody').innerHTML =
      '<tr><td colspan="8" style="text-align:center;padding:16px;color:var(--gray-400)">此期間無課程</td></tr>'
    ;['r-n','r-h','r-a','r-r'].forEach(id => document.getElementById(id).textContent = '—')
    return
  }

  const { data: enrs } = await supabase.from('enrollments')
    .select('course_id,attended').in('course_id', cs.map(c => c.id))

  const map = {}
  ;(enrs || []).forEach(e => {
    if (!map[e.course_id]) map[e.course_id] = { total: 0, att: 0 }
    map[e.course_id].total++
    if (e.attended) map[e.course_id].att++
  })

  let th = 0, ta = 0, te = 0
  cs.forEach(c => { th += c.hours || 0; ta += map[c.id]?.att || 0; te += map[c.id]?.total || 0 })

  document.getElementById('r-n').textContent = cs.length
  document.getElementById('r-h').textContent = th + 'h'
  document.getElementById('r-a').textContent = ta
  document.getElementById('r-r').textContent = te ? Math.round(ta / te * 100) + '%' : '—'

  document.getElementById('r-tbody').innerHTML = cs.map(c => {
    const m    = map[c.id] || { total: 0, att: 0 }
    const rate = m.total ? Math.round(m.att / m.total * 100) : null
    return `<tr>
      <td>${c.title}</td>
      <td>${fmtDate(c.date)}</td>
      <td>${c.hours}h</td>
      <td>${c.credits}</td>
      <td>${c.enrolled_count || 0}</td>
      <td>${m.att}</td>
      <td style="color:${rate !== null && rate >= 85 ? 'var(--green-500)' : 'var(--amber-500)'}">
        ${rate !== null ? rate + '%' : '—'}</td>
      <td>${c.waitlist_count || 0}</td>
    </tr>`
  }).join('')
}

function exportCSV() {
  const hdrs = ['課程名稱', '日期', '時數', '積分', '報名人數', '候補人數']
  const rows = myCourses.map(c => [c.title, c.date, c.hours, c.credits, c.enrolled_count || 0, c.waitlist_count || 0])
  dlCSV([hdrs, ...rows], '課程統計報表')
}

// ── 工具函式 ──────────────────────────────────────────────
function dlCSV(rows, name) {
  const bom = '\uFEFF'
  const csv = bom + rows.map(r =>
    r.map(v => '"' + String(v || '').replace(/"/g, '""') + '"').join(',')
  ).join('\n')
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })),
    download: name + '.csv'
  })
  a.click()
}

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'
}
