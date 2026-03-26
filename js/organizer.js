// organizer.js
let me = null, myCourses = [], rosterRows = [], qrCourseId = null

window.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) { window.location.href = BASE_PATH + '/index.html'; return }
  me = session.user

  const { data: p } = await supabase.from('profiles').select('name,role').eq('id', me.id).single()
  if (!p || !['organizer','admin'].includes(p.role)) {
    alert('您沒有主辦單位權限'); window.location.href = BASE_PATH + '/index.html'; return
  }
  document.getElementById('user-name').textContent = p.name || me.email

  // 截止日預設 +7 天
  const d = new Date(); d.setDate(d.getDate()+7)
  document.getElementById('c-deadline').value = d.toISOString().split('T')[0]

  await loadAll()
  loadReport()
})

async function loadAll() { await Promise.all([loadDashboard(), loadCourses()]) }

function showPage(id, el) {
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'))
  document.getElementById('page-'+id).classList.add('active')
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'))
  el?.classList.add('active')
  if (id==='report') loadReport()
}

// ── 儀表板 ──────────────────────────────────
async function loadDashboard() {
  const { data: cs } = await supabase.from('courses').select('*').eq('organizer_id', me.id).order('date',{ascending:false}).limit(8)
  myCourses = cs || []
  const totalEnroll = myCourses.reduce((s,c)=>s+(c.enrolled_count||0),0)
  const totalHours  = myCourses.reduce((s,c)=>s+(c.hours||0),0)

  document.getElementById('d-courses').textContent = myCourses.length
  document.getElementById('d-enroll').textContent  = totalEnroll
  document.getElementById('d-hours').textContent   = totalHours + 'h'

  // 計算出席率
  if (myCourses.length > 0) {
    const { data: atts } = await supabase.from('enrollments').select('attended')
      .in('course_id', myCourses.map(c=>c.id))
    if (atts?.length) {
      const rate = Math.round(atts.filter(a=>a.attended).length / atts.length * 100)
      document.getElementById('d-rate').textContent = rate + '%'
    } else { document.getElementById('d-rate').textContent = '—' }
  }

  const now = new Date()
  document.getElementById('d-tbody').innerHTML = myCourses.slice(0,6).map(c => `
    <tr>
      <td>${c.title}</td>
      <td>${fmtDate(c.date)}</td>
      <td>${c.enrolled_count||0} / ${c.max_participants}</td>
      <td><span class="badge ${!c.is_published?'badge-amber':new Date(c.date)<now?'badge-gray':'badge-green'}">
        ${!c.is_published?'草稿':new Date(c.date)<now?'已結束':'開放中'}</span></td>
      <td><button class="btn-secondary btn-sm" onclick="openRoster('${c.id}','${c.title.replace(/'/g,'\\u2019')}')">名單</button></td>
    </tr>`).join('')
}

// ── 課程列表 ────────────────────────────────
async function loadCourses() {
  const { data } = await supabase.from('courses').select('*').eq('organizer_id',me.id).order('date',{ascending:false})
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
      : isPast ? '<span class="badge badge-gray">已結束</span>'
               : '<span class="badge badge-green">開放中</span>'
    return `<div class="course-card">
      <div>
        <div class="course-name">${c.title}</div>
        <div class="course-meta">${fmtDate(c.date)} · ${c.location} · ${c.hours}h · ${c.credits}積分 · 名額 ${c.enrolled_count||0}/${c.max_participants}</div>
        ${c.waitlist_count ? `<div class="course-meta" style="color:var(--blue-700)">候補 ${c.waitlist_count} 人</div>` : ''}
      </div>
      <div class="course-actions">
        ${badge}
        <button class="btn-secondary btn-sm" onclick="openRoster('${c.id}','${c.title.replace(/'/g,'\\u2019')}')">名單</button>
        ${!c.is_published ? `<button class="btn-primary btn-sm" onclick="publishCourse('${c.id}')">發布</button>` : ''}
      </div>
    </div>`
  }).join('')
}

function fillQRSelect() {
  const sel  = document.getElementById('qr-select')
  const list = myCourses.filter(c => c.is_published)
  sel.innerHTML = '<option value="">— 請選擇課程 —</option>' +
    list.map(c=>`<option value="${c.id}">${c.title} (${c.date})</option>`).join('')
}

// ── 建立課程 ────────────────────────────────
async function createCourse(e) {
  e.preventDefault()
  const btn = e.submitter
  const err = document.getElementById('c-error')
  const suc = document.getElementById('c-success')
  err.style.display='none'; suc.style.display='none'
  btn.disabled = true; const origTxt = btn.textContent; btn.textContent='儲存中…'

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
    err.textContent = '建立失敗：' + error.message; err.style.display='block'
    btn.disabled=false; btn.textContent=origTxt; return
  }
  suc.textContent = btn.value==='publish' ? '課程已發布！' : '草稿已儲存。'
  suc.style.display='block'; btn.disabled=false; btn.textContent=origTxt
  e.target.reset()
  await loadAll()
}

async function publishCourse(id) {
  await supabase.from('courses').update({is_published:true}).eq('id',id)
  await loadAll()
}

// ── 名單 Modal ──────────────────────────────
async function openRoster(courseId, title) {
  document.getElementById('roster-title').textContent = '報名名單 — ' + title
  document.getElementById('roster-modal').style.display = 'flex'
  document.getElementById('roster-tbody').innerHTML = '<tr><td colspan="7" class="loading">載入中…</td></tr>'

  const { data } = await supabase.from('enrollments').select('*').eq('course_id', courseId).order('created_at')
  rosterRows = data || []
  const reg  = rosterRows.filter(r=>r.status==='enrolled').length
  const wait = rosterRows.filter(r=>r.status==='waitlisted').length
  document.getElementById('roster-meta').innerHTML =
    `<span class="badge badge-green" style="margin-right:6px">正取 ${reg} 人</span><span class="badge badge-blue">候補 ${wait} 人</span>`

  let regIdx = 0
  document.getElementById('roster-tbody').innerHTML = rosterRows.map((r,i) => {
    const isWait = r.status==='waitlisted'
    if (!isWait) regIdx++
    return `<tr>
      <td>${isWait ? 'W'+r.waitlist_position : regIdx}</td>
      <td>${r.name_snapshot||'—'}</td>
      <td style="font-family:monospace;font-size:12px">${r.id_number_snapshot||'—'}</td>
      <td>${r.org_type_snapshot||'—'}</td>
      <td>${r.org_snapshot||'—'}</td>
      <td style="font-size:12px">${new Date(r.created_at).toLocaleString('zh-TW')}</td>
      <td><span class="badge ${isWait?'badge-blue':'badge-green'}">${isWait?'候補':'正取'}</span></td>
    </tr>`
  }).join('')
}

function exportRoster() {
  const hdrs = ['序號','姓名','身分證','機構別','機構','報名時間','狀態']
  let regIdx = 0
  const rows = rosterRows.map((r) => {
    const isWait = r.status==='waitlisted'
    if (!isWait) regIdx++
    return [isWait?'W'+r.waitlist_position:regIdx, r.name_snapshot, r.id_number_snapshot,
            r.org_type_snapshot, r.org_snapshot, r.created_at, isWait?'候補':'正取']
  })
  dlCSV([hdrs,...rows], '報名名單')
}

// ── QR 簽到 ─────────────────────────────────
function loadQR() {
  qrCourseId = document.getElementById('qr-select').value
  if (!qrCourseId) { document.getElementById('qr-panel').style.display = 'none'; return }
  document.getElementById('qr-panel').style.display = 'block'

  const origin = window.location.origin
  const url = `${origin}${window.BASE_PATH}/pages/checkin.html?course=${qrCourseId}&t=${btoa(qrCourseId + ':' + new Date().toDateString())}`

  // 儲存連結供複製用
  document.getElementById('qr-link-box').textContent = url

  // 清空舊的 canvas 再重畫
  const canvas = document.getElementById('qr-canvas')
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  // 等 QRCode library 確實載入後再執行
  function tryRender(retries) {
    if (typeof QRCode !== 'undefined') {
      QRCode.toCanvas(canvas, url, { width: 200, margin: 2 }, (err) => {
        if (err) console.error('QR 產生失敗:', err)
      })
    } else if (retries > 0) {
      setTimeout(() => tryRender(retries - 1), 200)
    } else {
      console.error('QRCode library 未載入')
    }
  }
  tryRender(10)

  loadAtt()
}

// ── 報表 ────────────────────────────────────
async function loadReport() {
  const period = document.getElementById('rpt-period').value
  const yr     = new Date().getFullYear()
  const start  = `${yr}-${period==='H1'?'01':'07'}-01`
  const end    = `${yr}-${period==='H1'?'06':'12'}-31`

  const { data: cs } = await supabase.from('courses').select('*').eq('organizer_id',me.id).gte('date',start).lte('date',end).order('date')
  if (!cs?.length) {
    document.getElementById('r-tbody').innerHTML='<tr><td colspan="8" style="text-align:center;padding:16px;color:var(--gray-400)">此期間無課程</td></tr>'
    return
  }
  const { data: enrs } = await supabase.from('enrollments').select('course_id,attended').in('course_id',cs.map(c=>c.id))
  const map = {}
  ;(enrs||[]).forEach(e => {
    if (!map[e.course_id]) map[e.course_id]={total:0,att:0}
    map[e.course_id].total++
    if (e.attended) map[e.course_id].att++
  })
  let th=0, ta=0, te=0
  cs.forEach(c=>{th+=c.hours||0; ta+=(map[c.id]?.att||0); te+=(map[c.id]?.total||0)})
  document.getElementById('r-n').textContent = cs.length
  document.getElementById('r-h').textContent = th+'h'
  document.getElementById('r-a').textContent = ta
  document.getElementById('r-r').textContent = te?Math.round(ta/te*100)+'%':'—'

  document.getElementById('r-tbody').innerHTML = cs.map(c => {
    const m = map[c.id]||{total:0,att:0}
    const rate = m.total ? Math.round(m.att/m.total*100) : '—'
    return `<tr>
      <td>${c.title}</td><td>${fmtDate(c.date)}</td>
      <td>${c.hours}h</td><td>${c.credits}</td>
      <td>${c.enrolled_count||0}</td><td>${m.att}</td>
      <td style="color:${typeof rate==='number'&&rate>=85?'var(--green-500)':'var(--amber-500)'}">${typeof rate==='number'?rate+'%':rate}</td>
      <td>${c.waitlist_count||0}</td>
    </tr>`
  }).join('')
}

function exportCSV() {
  const hdrs = ['課程名稱','日期','時數','積分','報名人數','候補人數']
  const rows = myCourses.map(c=>[c.title,c.date,c.hours,c.credits,c.enrolled_count||0,c.waitlist_count||0])
  dlCSV([hdrs,...rows],'課程統計報表')
}

function dlCSV(rows, name) {
  const bom = '\uFEFF'
  const csv = bom + rows.map(r=>r.map(v=>`"${String(v||'').replace(/"/g,'""')}"`).join(',')).join('\n')
  const a   = Object.assign(document.createElement('a'),{
    href: URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'})),
    download: name+'.csv'
  }); a.click()
}

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString('zh-TW',{year:'numeric',month:'long',day:'numeric'}) : '—'
}
