import Dexie from 'dexie'

export const db = new Dexie('YoSpeechDB')

// Single consolidated schema - avoids Dexie upgrade conflicts
db.version(1).stores({
  profile:        '++id, name, ageGroup, avatar, createdAt',
  sessions:       '++id, type, date, duration, score, data',
  recordings:     '++id, type, date, blob, duration, label',
  fearLadder:     '++id, situation, fearLevel, completed, completedAt',
  progress:       '++id, zone, mission, stars, date',
  journal:        '++id, date, blob, duration, mood',
  braveStars:     '++id, type, description, date',
  streaks:        '++id, date, completed',
  settings:       '++id, key, value',
  speechAnalysis: '++id, date, sessionType, wpm, fillerCount, fluencyScore',
  actSessions:    '++id, sessionNum, date, completed',
  braveWall:      '++id, date, situation, anonymous',
  weeklyReports:  '++id, weekStart, generatedAt',
  dafSessions:    '++id, date, delayMs, duration',
})

// ─── CORE HELPERS ─────────────────────────────────────────────────────────────
export const getProfile = () => db.profile.orderBy('id').last()
export const saveProfile = (data) => db.profile.put({ ...data, createdAt: new Date().toISOString() })

export const addSession = (type, score, data = {}) =>
  db.sessions.add({ type, score, data: JSON.stringify(data), date: new Date().toISOString(), duration: data.duration || 0 })

export const addRecording = (type, blob, duration, label = '') =>
  db.recordings.add({ type, blob, duration, label, date: new Date().toISOString() })

export const getRecentSessions = (limit = 20) =>
  db.sessions.orderBy('date').reverse().limit(limit).toArray()

export const getTotalSessions = () => db.sessions.count()

export const addBraveStar = (type, description) =>
  db.braveStars.add({ type, description, date: new Date().toISOString() })

export const getFearLadder = () => db.fearLadder.orderBy('fearLevel').toArray()
export const addFearItem   = (situation, fearLevel) =>
  db.fearLadder.add({ situation, fearLevel, completed: false, completedAt: null })
export const completeFearItem = (id) =>
  db.fearLadder.update(id, { completed: true, completedAt: new Date().toISOString() })

export const getJournalEntries = () => db.journal.orderBy('date').reverse().toArray()
export const addJournalEntry   = (blob, duration, mood) =>
  db.journal.add({ blob, duration, mood, date: new Date().toISOString() })

export const getZoneProgress  = (zone) => db.progress.where('zone').equals(zone).toArray()
export const saveZoneProgress = (zone, mission, stars) =>
  db.progress.add({ zone, mission, stars, date: new Date().toISOString() })

export const getTodayStreak = async () => {
  const today = new Date().toDateString()
  return db.streaks.where('date').equals(today).first()
}
export const markTodayStreak = async () => {
  const today = new Date().toDateString()
  const existing = await getTodayStreak()
  if (!existing) await db.streaks.add({ date: today, completed: true })
}
export const getStreakCount = async () => {
  const entries = await db.streaks.orderBy('date').reverse().toArray()
  let count = 0
  const now = new Date()
  for (let i = 0; i < entries.length; i++) {
    const d = new Date(entries[i].date)
    const diff = Math.floor((now - d) / 86400000)
    if (diff === i) count++
    else break
  }
  return count
}

export const getSetting = async (key, defaultVal = null) => {
  const row = await db.settings.where('key').equals(key).first()
  return row ? row.value : defaultVal
}
export const setSetting = async (key, value) => {
  const existing = await db.settings.where('key').equals(key).first()
  if (existing) await db.settings.update(existing.id, { value })
  else await db.settings.add({ key, value })
}

// ─── V5 HELPERS ───────────────────────────────────────────────────────────────
export const getSessionsByType = (type, limit = 20) =>
  db.sessions.where('type').equals(type).reverse().limit(limit).toArray()

export const getSessionCount = () => db.sessions.count()

export const clearMemory = async () => {
  const memKeys = ['flux_insights','flux_strengths','flux_weaknesses','flux_recs','flux_story','flux_goals']
  for (const k of memKeys) await db.settings.where('key').equals(k).delete()
}

export const saveSpeechAnalysis = (data) =>
  db.speechAnalysis.add({ ...data, date: new Date().toISOString() })

export const getRecentAnalyses = (limit = 20) =>
  db.speechAnalysis.orderBy('date').reverse().limit(limit).toArray()

export const getAnalysisTrend = async (days = 30) => {
  const since = new Date(Date.now() - days * 86400000).toISOString()
  return db.speechAnalysis.where('date').above(since).toArray()
}

export const saveActSession = (sessionNum, reflection, audioBlob = null) =>
  db.actSessions.add({ sessionNum, reflection: reflection || '', completed: true, date: new Date().toISOString() })

export const getActProgress = () => db.actSessions.orderBy('sessionNum').toArray()

export const addBraveWallPost = (situation, anonymous = true) =>
  db.braveWall.add({ situation, anonymous, likes: 0, date: new Date().toISOString() })

export const getBraveWallPosts = (limit = 50) =>
  db.braveWall.orderBy('date').reverse().limit(limit).toArray()

export const saveWeeklyReport = (weekStart, report, stats) =>
  db.weeklyReports.add({ weekStart, report, stats: JSON.stringify(stats), generatedAt: new Date().toISOString() })

export const getLatestWeeklyReport = () =>
  db.weeklyReports.orderBy('generatedAt').last()

export const getFluentStats = async () => {
  const [totalSessions, analyses, braveCount, actDone, journalCount] = await Promise.all([
    db.sessions.count(),
    db.speechAnalysis.orderBy('date').reverse().limit(10).toArray(),
    db.braveStars.count(),
    db.actSessions.count(),
    db.journal.count(),
  ])
  const avgFluency = analyses.length
    ? Math.round(analyses.reduce((a, b) => a + (b.fluencyScore || 70), 0) / analyses.length)
    : null
  const avgWpm = analyses.length
    ? Math.round(analyses.reduce((a, b) => a + (b.wpm || 0), 0) / analyses.length)
    : null
  return { totalSessions, avgFluency, avgWpm, braveCount, actDone, journalCount }
}
