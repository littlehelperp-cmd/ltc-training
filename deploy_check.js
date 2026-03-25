#!/usr/bin/env node
// deploy_check.js — 部署前確認清單（Node.js 執行）
// 用法：node deploy_check.js

const fs = require('fs')
const path = require('path')

const required = [
  'index.html',
  'css/style.css',
  'js/config.js',
  'js/auth.js',
  'js/student.js',
  'js/organizer.js',
  'pages/student.html',
  'pages/organizer.html',
  'pages/checkin.html',
  'supabase_schema.sql',
]

console.log('\n🔍 長照教育訓練系統 — 部署前確認\n')
let allOk = true

required.forEach(f => {
  const exists = fs.existsSync(path.join(__dirname, f))
  console.log(`  ${exists ? '✅' : '❌'} ${f}`)
  if (!exists) allOk = false
})

// 確認 config.js 是否填入 Supabase 資訊
const config = fs.readFileSync(path.join(__dirname, 'js/config.js'), 'utf-8')
const hasPlaceholder = config.includes('你的專案ID') || config.includes('你的 anon public key')
console.log(`\n  ${hasPlaceholder ? '⚠️  請記得填入 Supabase URL 和 Key（js/config.js）' : '✅ Supabase 設定已填入'}`)

console.log(allOk && !hasPlaceholder ? '\n✅ 所有檔案就緒，可以部署！\n' : '\n⚠️  請修正上述問題後再部署。\n')
