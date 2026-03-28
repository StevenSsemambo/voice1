// ─── WEEKLY COACH REPORT ENGINE ───────────────────────────────────────────────
// Generates a personalized Flux-narrated weekly progress report
// Works offline with local data; enriches with AI narrative when online
// ─────────────────────────────────────────────────────────────────────────────

import { db, getStreakCount } from '../utils/db'
import { callFluxAI, loadMemory, MemoryKeys } from './fluxEngine'

// ─── GATHER WEEK STATS ────────────────────────────────────────────────────────
export const gatherWeekStats = async () => {
  const now = new Date()
  const weekAgo = new Date(now - 7 * 86400000).toISOString()

  const [
    weekSessions,
    weekBrave,
    weekAnalyses,
    weekJournal,
    allSessions,
    streak,
    prevWeekSessions,
  ] = await Promise.all([
    db.sessions.where('date').above(weekAgo).toArray(),
    db.braveStars.where('date').above(weekAgo).count(),
    db.speechAnalysis.where('date').above(weekAgo).toArray(),
    db.journal.where('date').above(weekAgo).count(),
    db.sessions.count(),
    getStreakCount(),
    db.sessions.where('date').above(new Date(now - 14 * 86400000).toISOString())
                .filter(s => s.date < weekAgo).count(),
  ])

  const sessionTypes = weekSessions.reduce((acc, s) => {
    acc[s.type] = (acc[s.type] || 0) + 1; return acc
  }, {})

  const avgFluency = weekAnalyses.length
    ? Math.round(weekAnalyses.reduce((a, b) => a + (b.fluencyScore || 70), 0) / weekAnalyses.length)
    : null

  const avgWpm = weekAnalyses.length
    ? Math.round(weekAnalyses.reduce((a, b) => a + (b.wpm || 0), 0) / weekAnalyses.length)
    : null

  const totalFillers = weekAnalyses.reduce((a, b) => a + (b.fillerCount || 0), 0)
  const totalMinutes = Math.round(weekSessions.reduce((a, b) => a + ((b.duration || 0) / 60), 0))

  const improvementVsLastWeek = prevWeekSessions > 0
    ? Math.round(((weekSessions.length - prevWeekSessions) / prevWeekSessions) * 100)
    : null

  return {
    sessionCount:     weekSessions.length,
    sessionTypes,
    braveCount:       weekBrave,
    journalEntries:   weekJournal,
    avgFluency,
    avgWpm,
    totalFillers,
    totalMinutes,
    streak,
    allTimeSessions:  allSessions,
    improvementVsLastWeek,
    analysisCount:    weekAnalyses.length,
    weekStart:        weekAgo,
  }
}

// ─── OFFLINE REPORT GENERATOR ─────────────────────────────────────────────────
export const buildOfflineReport = (stats, profile) => {
  const name = profile?.name || 'friend'
  const lines = []

  lines.push(`Hey ${name} 👋 Here's your week.`)

  if (stats.sessionCount === 0) {
    lines.push(`Flux noticed you didn't practice this week. That happens — and you're here now, reading this. That counts.`)
    lines.push(`This week: try just one session. Even 3 minutes rewires your brain.`)
    return lines.join(' ')
  }

  lines.push(`You practiced ${stats.sessionCount} time${stats.sessionCount > 1 ? 's' : ''} this week.`)

  if (stats.totalMinutes > 0) lines.push(`Total speaking time: ${stats.totalMinutes} minutes.`)

  if (stats.improvementVsLastWeek !== null) {
    if (stats.improvementVsLastWeek > 0) lines.push(`That's ${stats.improvementVsLastWeek}% more than last week — you're building momentum.`)
    else if (stats.improvementVsLastWeek < 0) lines.push(`A little quieter than last week — but you still showed up.`)
    else lines.push(`Consistent with last week — consistency is exactly how this works.`)
  }

  if (stats.avgFluency) lines.push(`Average fluency score: ${stats.avgFluency}/100.`)
  if (stats.avgWpm) lines.push(`Your speaking rate averaged ${stats.avgWpm} words per minute.`)

  if (stats.braveCount > 0) lines.push(`${stats.braveCount} brave moment${stats.braveCount > 1 ? 's' : ''} earned — that's the work that matters most.`)
  if (stats.journalEntries > 0) lines.push(`${stats.journalEntries} voice journal entr${stats.journalEntries > 1 ? 'ies' : 'y'} — your voice archive is growing.`)

  if (stats.streak > 0) lines.push(`Current streak: ${stats.streak} day${stats.streak > 1 ? 's' : ''} 🔥`)

  lines.push(`Keep going.`)
  return lines.join(' ')
}

// ─── AI-POWERED REPORT (online) ───────────────────────────────────────────────
export const generateWeeklyReport = async (profile) => {
  const stats = await gatherWeekStats()
  const [insights, weaknesses, strengths] = await Promise.all([
    loadMemory(MemoryKeys.INSIGHTS, []),
    loadMemory(MemoryKeys.WEAKNESSES, []),
    loadMemory(MemoryKeys.STRENGTHS, []),
  ])

  // Always build offline version first
  const offlineReport = buildOfflineReport(stats, profile)

  try {
    const prompt = `Generate a personalized weekly coaching report for ${profile?.name || 'this user'}.

WEEK DATA:
- Sessions this week: ${stats.sessionCount}
- Session types: ${JSON.stringify(stats.sessionTypes)}
- Brave moments: ${stats.braveCount}
- Journal entries: ${stats.journalEntries}
- Avg fluency score: ${stats.avgFluency || 'not measured'}
- Avg speaking rate: ${stats.avgWpm || 'not measured'} WPM
- Total practice time: ${stats.totalMinutes} minutes
- Current streak: ${stats.streak} days
- Change vs last week: ${stats.improvementVsLastWeek !== null ? stats.improvementVsLastWeek + '%' : 'first week'}
- All-time sessions: ${stats.allTimeSessions}

MEMORY:
- Recent insights: ${insights.slice(-3).map(i => i.text).join(' | ') || 'none yet'}
- Growth areas: ${weaknesses.slice(-3).join(', ') || 'still discovering'}
- Strengths: ${strengths.slice(-3).join(', ') || 'still discovering'}

USER: ${profile?.ageGroup} age group, ${profile?.mode || 'stutter'} mode.

Write a warm, personal, Flux-voiced weekly report. 5-8 sentences. Structure:
1. Acknowledge what happened this week specifically
2. Point out one specific trend from the data (reference actual numbers)
3. Name one growth area honestly but kindly
4. Name one strength you observed
5. Set one concrete intention for next week
6. Close with something genuinely encouraging — not generic

Voice: warm but direct. Not clinical. Not cheerleader-generic. Like a coach who actually knows them.`

    const result = await callFluxAI([{ role: 'user', content: prompt }], profile)
    return { report: result.text || offlineReport, stats, source: 'ai' }
  } catch {
    return { report: offlineReport, stats, source: 'offline' }
  }
}
