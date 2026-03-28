import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { generateWeeklyReport, buildOfflineReport, gatherWeekStats } from '../ai/weeklyReport'
import { getLatestWeeklyReport, saveWeeklyReport } from '../utils/db'
import { useApp } from '../hooks/useAppContext'
import useFluxVoice from '../hooks/useFluxVoice'
import Flux from '../components/flux/Flux'

function StatBar({ label, value, max, color }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-white/50 text-xs">{label}</span>
        <span className="font-display font-bold text-xs" style={{ color }}>{value}</span>
      </div>
      <div className="prog-track h-1.5">
        <div className="prog-fill" style={{ width:`${pct}%`, background: color }}/>
      </div>
    </div>
  )
}

export default function WeeklyCoachReport() {
  const [report, setReport]   = useState('')
  const [stats, setStats]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [source, setSource]   = useState('offline')
  const [lastReport, setLastReport] = useState(null)
  const navigate = useNavigate()
  const { profile } = useApp()
  const { fluxSay, fluxStop, fluxSpeaking } = useFluxVoice()

  useEffect(() => {
    load()
    return () => fluxStop()
  }, [])

  const load = async () => {
    setLoading(true)
    try {
      // Check if we generated a report recently (within 6h)
      const cached = await getLatestWeeklyReport()
      if (cached) {
        const age = (Date.now() - new Date(cached.generatedAt)) / 3600000
        if (age < 6) {
          setReport(cached.report)
          setStats(JSON.parse(cached.stats || '{}'))
          setLastReport(cached)
          setLoading(false)
          return
        }
      }

      // Generate fresh
      const result = await generateWeeklyReport(profile)
      setReport(result.report)
      setStats(result.stats)
      setSource(result.source)

      // Cache it
      await saveWeeklyReport(result.stats.weekStart, result.report, result.stats)
      setLoading(false)
    } catch {
      const st = await gatherWeekStats()
      const r  = buildOfflineReport(st, profile)
      setReport(r); setStats(st); setSource('offline'); setLoading(false)
    }
  }

  const handleFluxRead = () => {
    if (fluxSpeaking) fluxStop()
    else fluxSay(report, true)
  }

  const improvementColor = (pct) => {
    if (pct > 10)  return 'var(--jade)'
    if (pct > 0)   return 'var(--aqua)'
    if (pct === 0) return 'var(--aqua)'
    return 'var(--amber)'
  }

  return (
    <div className="min-h-full pb-28 page-enter" style={{ zIndex: 1 }}>
      <div className="flex items-center gap-3 px-5 pt-8 pb-4">
        <button onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full glass flex items-center justify-center text-white text-lg">←</button>
        <div>
          <h1 className="font-display text-xl font-bold text-white">Weekly Report</h1>
          <p className="text-white/35 text-xs">Your personal AI coach debrief</p>
        </div>
        <span className="ml-auto text-2xl">📋</span>
      </div>

      {loading ? (
        <div className="flex flex-col items-center gap-5 py-16">
          <div className="animate-flux-float">
            <Flux size={90} ageGroup={profile?.ageGroup||'explorer'} mood="thinking"/>
          </div>
          <p className="text-white/40 font-display text-sm">Flux is reviewing your week…</p>
          <div className="flex gap-1">
            {[0,1,2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-white/20 animate-bounce" style={{animationDelay:`${i*0.2}s`}}/>)}
          </div>
        </div>
      ) : (
        <div className="px-5 flex flex-col gap-5">

          {/* Source badge */}
          <div className="flex justify-end">
            <span className={`pill text-[10px] ${source === 'ai' ? 'pill-aqua' : 'pill-violet'}`}>
              {source === 'ai' ? '🤖 AI Generated' : '📴 Offline Report'}
            </span>
          </div>

          {/* Flux Report Card */}
          <div className="card-lg" style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.07), rgba(167,139,250,0.05))' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`transition-transform ${fluxSpeaking ? 'scale-110' : 'scale-100'}`}>
                <Flux size={52} ageGroup={profile?.ageGroup||'explorer'} mood={fluxSpeaking ? 'excited' : 'happy'}
                  speaking={fluxSpeaking} floating={false}/>
              </div>
              <div className="flex-1">
                <p className="font-display font-bold text-white">Flux's Report</p>
                <p className="text-white/35 text-xs">Week ending today</p>
              </div>
              <button onClick={handleFluxRead}
                className="w-10 h-10 rounded-2xl flex items-center justify-center transition-all active:scale-90"
                style={{
                  background: fluxSpeaking ? 'rgba(34,211,238,0.2)' : 'rgba(255,255,255,0.08)',
                  border: `1px solid ${fluxSpeaking ? 'rgba(34,211,238,0.4)' : 'rgba(255,255,255,0.12)'}`,
                }}>
                <span className="text-lg">{fluxSpeaking ? '⏹' : '🔊'}</span>
              </button>
            </div>

            <p className="text-white/80 text-sm leading-relaxed">{report}</p>
          </div>

          {/* Stats grid */}
          {stats && (
            <>
              <div className="grid grid-cols-3 gap-2.5">
                {[
                  { label: 'Sessions', value: stats.sessionCount, color: 'var(--aqua)', icon: '🎯' },
                  { label: 'Brave ★', value: stats.braveCount, color: 'var(--amber)', icon: '⭐' },
                  { label: 'Journals', value: stats.journalEntries, color: 'var(--violet)', icon: '🎙️' },
                ].map((s,i) => (
                  <div key={i} className="card text-center py-4">
                    <div className="text-xl mb-1">{s.icon}</div>
                    <div className="font-display font-bold text-xl" style={{ color: s.color }}>{s.value}</div>
                    <div className="text-white/30 text-xs mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Trend indicators */}
              <div className="card">
                <p className="section-label mb-3">This Week's Numbers</p>
                <div className="space-y-3">
                  {stats.avgFluency && <StatBar label="Avg Fluency Score" value={`${stats.avgFluency}/100`} max={100} color={stats.avgFluency >= 70 ? 'var(--jade)' : 'var(--amber)'}/>}
                  {stats.avgWpm && <StatBar label="Avg Speaking Rate" value={`${stats.avgWpm} WPM`} max={200} color="var(--aqua)"/>}
                  <StatBar label="Practice Minutes" value={`${stats.totalMinutes} min`} max={60} color="var(--violet)"/>
                  <StatBar label="Current Streak" value={`${stats.streak} days`} max={30} color="var(--amber)"/>
                </div>
              </div>

              {/* vs last week */}
              {stats.improvementVsLastWeek !== null && (
                <div className="card flex items-center gap-4"
                  style={{ borderColor: `${improvementColor(stats.improvementVsLastWeek)}25` }}>
                  <div className="text-3xl">
                    {stats.improvementVsLastWeek > 0 ? '📈' : stats.improvementVsLastWeek < 0 ? '📉' : '➡️'}
                  </div>
                  <div>
                    <p className="font-display font-bold text-white text-sm">vs Last Week</p>
                    <p className="text-xs" style={{ color: improvementColor(stats.improvementVsLastWeek) }}>
                      {stats.improvementVsLastWeek > 0
                        ? `+${stats.improvementVsLastWeek}% more sessions`
                        : stats.improvementVsLastWeek < 0
                        ? `${stats.improvementVsLastWeek}% fewer sessions`
                        : 'Same as last week'}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Session breakdown */}
          {stats?.sessionTypes && Object.keys(stats.sessionTypes).length > 0 && (
            <div className="card">
              <p className="section-label mb-3">What You Practiced</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(stats.sessionTypes).map(([type, count]) => (
                  <div key={type} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl"
                    style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)' }}>
                    <span className="text-sm">
                      {type === 'breathe' ? '💨' : type === 'speaklab' ? '🗣️' : type === 'brave' ? '🦁' : type === 'act' ? '🧘' : type === 'daf' ? '🎧' : type === 'speech_analysis' ? '📊' : '🎙️'}
                    </span>
                    <span className="text-white/60 text-xs font-display capitalize">{type.replace('_', ' ')}</span>
                    <span className="font-display font-bold text-xs" style={{ color:'var(--aqua)' }}>×{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button onClick={load}
            className="btn-ghost w-full py-3 font-display text-sm">
            🔄 Regenerate Report
          </button>
        </div>
      )}
    </div>
  )
}
