import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { saveSpeechAnalysis, addSession, markTodayStreak } from '../utils/db'
import { useApp } from '../hooks/useAppContext'
import { haptics } from '../utils/haptics'
import useFluxVoice from '../hooks/useFluxVoice'
import { LiveSpeechRecorder, analyzeTranscript, getAIAnalysisFeedback, scoreColor, scoreLabel, wpmFeedback } from '../ai/speechAnalysis'
import { updateMemoryAfterSession, getOfflineResponse } from '../ai/fluxEngine'
import Flux from '../components/flux/Flux'
import CelebrationScreen from '../components/ui/CelebrationScreen'

const EXERCISE_PROMPTS = [
  { id: 'freeform',   label: 'Free Speech',       prompt: 'Speak freely for 60 seconds on any topic you enjoy.',               duration: 60 },
  { id: 'intro',      label: 'Self Introduction', prompt: 'Introduce yourself. Name, what you do, one thing you love. 30s.',  duration: 30 },
  { id: 'story',      label: 'Quick Story',        prompt: 'Tell a 45-second story about something that happened to you.',      duration: 45 },
  { id: 'opinion',    label: 'Your Opinion',       prompt: 'Share your opinion on any topic. Be clear and confident. 45s.',    duration: 45 },
  { id: 'describe',   label: 'Describe It',        prompt: 'Describe your ideal day in detail. 60 seconds.',                   duration: 60 },
  { id: 'convince',   label: 'Convince Me',        prompt: 'Convince me of anything. You have 45 seconds. Make it count.',     duration: 45 },
]

// ─── SCORE RING ────────────────────────────────────────────────────────────────
function ScoreRing({ score, size = 100, label }) {
  const color = scoreColor(score)
  const r = 40
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7"/>
          <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="7"
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 1.2s cubic-bezier(0.16,1,0.3,1)' }}/>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display font-bold" style={{ fontSize: size * 0.22, color }}>{score}</span>
          <span style={{ fontSize: size * 0.1, color: 'rgba(255,255,255,0.4)', fontFamily:'"DM Sans",sans-serif' }}>/100</span>
        </div>
      </div>
      {label && <span className="text-xs font-display font-semibold" style={{ color }}>{label}</span>}
      {showCelebration && (
        <CelebrationScreen
          sessionType="speech_analysis"
          score={celebScore}
          stars={Math.round(celebScore / 10)}
          ageGroup={profile?.ageGroup || 'explorer'}
          profile={profile}
          onDismiss={() => setShowCelebration(false)}
        />
      )}
    </div>
  )
}

// ─── LIVE WAVEFORM ─────────────────────────────────────────────────────────────
function LiveWaveform({ active, audioCtx, analyser }) {
  const canvasRef = useRef(null)
  const animRef   = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const W = canvas.width, H = canvas.height

    const draw = () => {
      ctx.clearRect(0, 0, W, H)
      if (analyser && active) {
        const data = new Uint8Array(analyser.frequencyBinCount)
        analyser.getByteFrequencyData(data)
        const barW = W / data.length * 2.5
        let x = 0
        data.forEach((val, i) => {
          const h = (val / 255) * H * 0.9
          const hue = 185 + (i / data.length) * 40
          const alpha = 0.4 + (val / 255) * 0.6
          ctx.fillStyle = `hsla(${hue}, 80%, 65%, ${alpha})`
          ctx.beginPath()
          ctx.roundRect(x, (H - h) / 2, barW - 1, h, 2)
          ctx.fill()
          x += barW + 1
        })
      } else {
        // Idle state — gentle sine wave
        const time = Date.now() / 1000
        ctx.strokeStyle = 'rgba(34,211,238,0.2)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        for (let x = 0; x < W; x++) {
          const y = H/2 + Math.sin((x / W) * Math.PI * 4 + time) * 6
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        }
        ctx.stroke()
      }
      animRef.current = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(animRef.current)
  }, [active, analyser])

  return <canvas ref={canvasRef} width={320} height={64} className="w-full rounded-2xl" style={{ maxWidth: '320px' }}/>
}

// ─── MAIN PAGE ─────────────────────────────────────────────────────────────────
export default function SpeechAnalysisPage() {
  const [stage, setStage]         = useState('menu')    // menu | ready | recording | done
  const [selectedPrompt, setSelectedPrompt] = useState(EXERCISE_PROMPTS[0])
  const [recording, setRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [liveAnalysis, setLiveAnalysis] = useState(null)
  const [finalResult, setFinalResult]   = useState(null)
  const [aiFeedback, setAiFeedback]     = useState('')
  const [loadingAI, setLoadingAI]       = useState(false)
  const [elapsed, setElapsed]     = useState(0)
  const [analyser, setAnalyser]   = useState(null)
  const [audioCtx, setAudioCtx]   = useState(null)

  const recorderRef = useRef(null)
  const streamRef   = useRef(null)
  const timerRef    = useRef(null)
  const [showCelebration, setShowCelebration] = useState(false)
  const [celebScore, setCelebScore] = useState(0)
  const navigate    = useNavigate()
  const { profile, refreshProfile } = useApp()
  const { fluxSay, fluxSpeaking, fluxStop } = useFluxVoice()

  const setupMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const an  = ctx.createAnalyser()
      an.fftSize = 128
      ctx.createMediaStreamSource(stream).connect(an)
      setAudioCtx(ctx); setAnalyser(an)
      return true
    } catch { return false }
  }

  const startRecording = async () => {
    const micOk = await setupMic()
    setRecording(true); setElapsed(0); setTranscript(''); setLiveAnalysis(null)
    setStage('recording')

    recorderRef.current = new LiveSpeechRecorder(
      (t) => setTranscript(t),
      (a) => setLiveAnalysis(a)
    )
    recorderRef.current.start()

    timerRef.current = setInterval(() => {
      setElapsed(e => {
        if (e >= selectedPrompt.duration) { stopRecording(); return e }
        return e + 1
      })
    }, 1000)

    fluxSay(selectedPrompt.prompt, true)
  }

  const stopRecording = useCallback(async () => {
    clearInterval(timerRef.current)
    setRecording(false); fluxStop()

    const result = recorderRef.current?.stop()
    streamRef.current?.getTracks().forEach(t => t.stop())
    audioCtx?.close().catch(() => {})
    setAnalyser(null)

    if (!result) return
    const { transcript: t, analysis } = result
    setFinalResult(analysis)
    setStage('done')

    // Save to DB
    await saveSpeechAnalysis({
      sessionType: selectedPrompt.id,
      wpm: analysis.wpm,
      fillerCount: analysis.fillerCount,
      pauseCount: analysis.pauseMarkers,
      fluencyScore: analysis.fluencyScore,
      transcript: t,
      data: JSON.stringify(analysis),
    })
    await addSession('speech_analysis', analysis.fluencyScore, { wpm: analysis.wpm, fillerCount: analysis.fillerCount })
    await markTodayStreak()
    await refreshProfile()
    haptics.sessionDone()
    setShowCelebration(true)
    await updateMemoryAfterSession('speech_analysis', analysis, profile)

    // Get AI feedback
    setLoadingAI(true)
    const fb = await getAIAnalysisFeedback(analysis, selectedPrompt.label, profile)
    setAiFeedback(fb); setLoadingAI(false)
    fluxSay(fb, true)
  }, [audioCtx, selectedPrompt, profile])

  useEffect(() => () => {
    clearInterval(timerRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    audioCtx?.close().catch(() => {})
    recorderRef.current?.stop()
  }, [])

  const pct = selectedPrompt.duration > 0 ? Math.min((elapsed / selectedPrompt.duration) * 100, 100) : 0

  const FeedbackBadge = ({ item }) => (
    <div className="flex gap-3 items-start p-3 rounded-2xl animate-slide-up"
      style={{
        background: item.type === 'great' || item.type === 'good'
          ? 'rgba(52,211,153,0.08)' : item.type === 'improve'
          ? 'rgba(251,191,36,0.08)' : 'rgba(34,211,238,0.08)',
        border: `1px solid ${item.type === 'great' || item.type === 'good'
          ? 'rgba(52,211,153,0.2)' : item.type === 'improve'
          ? 'rgba(251,191,36,0.2)' : 'rgba(34,211,238,0.2)'}`,
      }}>
      <span style={{ fontSize: '16px', flexShrink: 0 }}>
        {item.type === 'great' ? '🏆' : item.type === 'good' ? '✅' : item.type === 'improve' ? '💡' : 'ℹ️'}
      </span>
      <p style={{ fontFamily:'"DM Sans",sans-serif', fontSize:'13px', color:'rgba(255,255,255,0.78)', lineHeight:1.6 }}>
        {item.text}
      </p>
    </div>
  )

  return (
    <div className="min-h-full pb-28 page-enter" style={{ zIndex: 1 }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-8 pb-4">
        <button onClick={() => { stopRecording(); navigate(-1) }}
          className="w-9 h-9 rounded-full glass flex items-center justify-center text-white text-lg">←</button>
        <div>
          <h1 className="font-display text-xl font-bold text-white">Speech Analyser</h1>
          <p className="text-white/35 text-xs">Real-time · Fluency · WPM · Fillers · AI feedback</p>
        </div>
        <span className="ml-auto text-2xl">📊</span>
      </div>

      {/* ── Menu ── */}
      {stage === 'menu' && (
        <div className="px-5 flex flex-col gap-5">
          <div className="flex flex-col items-center gap-3 py-4">
            <Flux size={80} ageGroup={profile?.ageGroup||'explorer'} mood="happy" floating
              showMessage message="I'll analyse your speech in real-time — fluency, pace, filler words, and more. Ready?" />
          </div>

          <div>
            <p className="section-label mb-3">Choose Exercise</p>
            <div className="space-y-2">
              {EXERCISE_PROMPTS.map(p => (
                <button key={p.id} onClick={() => setSelectedPrompt(p)}
                  className="w-full p-4 rounded-2xl border text-left transition-all active:scale-[0.98]"
                  style={{
                    background: selectedPrompt.id === p.id ? 'rgba(34,211,238,0.08)' : 'rgba(255,255,255,0.04)',
                    borderColor: selectedPrompt.id === p.id ? 'rgba(34,211,238,0.35)' : 'rgba(255,255,255,0.09)',
                  }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-display font-bold text-white text-sm">{p.label}</span>
                    <span className="pill-aqua text-[10px]">{p.duration}s</span>
                  </div>
                  <p className="text-white/45 text-xs leading-relaxed">{p.prompt}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="card" style={{ borderColor: 'rgba(34,211,238,0.15)' }}>
            <div className="flex items-start gap-3">
              <span className="text-xl flex-shrink-0">🧠</span>
              <div>
                <p className="font-display font-semibold text-white text-sm mb-1">What gets measured</p>
                <div className="flex flex-wrap gap-1.5">
                  {['Speaking rate (WPM)', 'Filler words', 'Repetitions', 'Fluency score', 'Clarity score', 'AI feedback'].map(m => (
                    <span key={m} className="pill-aqua text-[10px]">{m}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <button onClick={startRecording}
            className="btn-aqua w-full py-4 font-display text-base" style={{ color: '#05080f' }}>
            Start Analysis 🎙️
          </button>
        </div>
      )}

      {/* ── Recording ── */}
      {stage === 'recording' && (
        <div className="px-5 flex flex-col gap-4">
          {/* Timer + progress */}
          <div className="flex items-center justify-between">
            <span className="font-mono text-2xl font-bold" style={{ color: 'var(--aqua)' }}>
              {String(Math.floor(elapsed/60)).padStart(2,'0')}:{String(elapsed%60).padStart(2,'0')}
            </span>
            <span className="text-white/40 text-sm">/ {selectedPrompt.duration}s</span>
          </div>
          <div className="prog-track">
            <div className="prog-fill" style={{ width:`${pct}%`, background:'linear-gradient(90deg, var(--aqua), var(--violet))' }}/>
          </div>

          {/* Flux speaking indicator */}
          <div className="flex justify-center">
            <Flux size={80} ageGroup={profile?.ageGroup||'explorer'} mood="excited" speaking floating={false}
              style={{ animation: 'fluxPulse 1.5s ease-in-out infinite' }}/>
          </div>

          {/* Prompt */}
          <div className="card" style={{ borderColor: 'rgba(34,211,238,0.2)' }}>
            <p className="section-label mb-1">{selectedPrompt.label}</p>
            <p className="text-white/80 text-sm leading-relaxed">{selectedPrompt.prompt}</p>
          </div>

          {/* Live waveform */}
          <div className="flex justify-center">
            <LiveWaveform active={recording} analyser={analyser} />
          </div>

          {/* Live metrics */}
          {liveAnalysis && liveAnalysis.wordCount > 5 && (
            <div className="grid grid-cols-3 gap-2 animate-fade-in">
              {[
                { label: 'WPM', value: liveAnalysis.wpm, ...wpmFeedback(liveAnalysis.wpm, profile?.mode) },
                { label: 'Fillers', value: liveAnalysis.fillerCount, color: liveAnalysis.fillerCount > 5 ? 'var(--amber)' : 'var(--jade)' },
                { label: 'Fluency', value: liveAnalysis.fluencyScore, color: scoreColor(liveAnalysis.fluencyScore) },
              ].map((m, i) => (
                <div key={i} className="card text-center py-3">
                  <div className="font-display font-bold text-lg" style={{ color: m.color }}>{m.value}</div>
                  <div className="text-white/35 text-xs">{m.label}</div>
                  {m.label !== 'Fillers' && <div className="text-[9px] mt-0.5" style={{ color: m.color }}>{m.label === 'WPM' ? m.label : scoreLabel(m.value)}</div>}
                </div>
              ))}
            </div>
          )}

          {/* Live transcript */}
          {transcript && (
            <div className="card glass-2 max-h-28 overflow-y-auto scrollbar-hide">
              <p className="section-label mb-1">Live transcript</p>
              <p className="text-white/55 text-xs leading-relaxed">{transcript}</p>
            </div>
          )}

          {/* Stop button */}
          <button onClick={stopRecording}
            className="w-full py-4 rounded-2xl font-display font-bold text-white text-base transition-all active:scale-95"
            style={{ background: 'rgba(239,68,68,0.8)', boxShadow: '0 4px 24px rgba(239,68,68,0.25)', border: '1px solid rgba(239,68,68,0.4)' }}>
            ⏹ Stop & Analyse
          </button>
        </div>
      )}

      {/* ── Results ── */}
      {stage === 'done' && finalResult && (
        <div className="px-5 flex flex-col gap-4">
          {/* Score header */}
          <div className="card-lg flex items-center gap-6"
            style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.08), rgba(167,139,250,0.06))' }}>
            <ScoreRing score={finalResult.fluencyScore} size={90} label={scoreLabel(finalResult.fluencyScore)}/>
            <div className="flex-1">
              <p className="font-display font-bold text-white text-lg leading-tight">Analysis Complete</p>
              <p className="text-white/40 text-xs mt-1">{selectedPrompt.label} · {Math.round(finalResult.durationSeconds)}s</p>
              <div className="flex gap-2 mt-2 flex-wrap">
                <span className="pill-aqua text-[10px]">{finalResult.wpm} WPM</span>
                <span className="pill text-[10px]"
                  style={{ background: finalResult.fillerCount > 5 ? 'rgba(251,191,36,0.1)' : 'rgba(52,211,153,0.1)',
                    borderColor: finalResult.fillerCount > 5 ? 'rgba(251,191,36,0.25)' : 'rgba(52,211,153,0.25)',
                    color: finalResult.fillerCount > 5 ? 'var(--amber)' : 'var(--jade)' }}>
                  {finalResult.fillerCount} fillers
                </span>
                <span className="pill-jade text-[10px]">{finalResult.wordCount} words</span>
              </div>
            </div>
          </div>

          {/* Metric breakdown */}
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { label: 'Speaking Rate', value: `${finalResult.wpm} WPM`, sub: wpmFeedback(finalResult.wpm, profile?.mode).label, color: wpmFeedback(finalResult.wpm, profile?.mode).color },
              { label: 'Clarity Score', value: `${finalResult.clarityScore}/100`, sub: scoreLabel(finalResult.clarityScore), color: scoreColor(finalResult.clarityScore) },
              { label: 'Filler Words', value: finalResult.fillerCount, sub: finalResult.fillerCount === 0 ? 'Perfect' : `Top: "${finalResult.fillerWords[0]?.word}"`, color: finalResult.fillerCount > 5 ? 'var(--amber)' : 'var(--jade)' },
              { label: 'Word Count', value: finalResult.wordCount, sub: `${finalResult.sentenceCount} sentences`, color: 'var(--aqua)' },
            ].map((m, i) => (
              <div key={i} className="card">
                <div className="font-display font-bold text-lg" style={{ color: m.color }}>{m.value}</div>
                <div className="text-white/55 text-xs mt-0.5">{m.label}</div>
                <div className="text-[10px] mt-0.5 font-display" style={{ color: m.color }}>{m.sub}</div>
              </div>
            ))}
          </div>

          {/* Detailed feedback */}
          {finalResult.feedback.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="section-label">Breakdown</p>
              {finalResult.feedback.map((item, i) => <FeedbackBadge key={i} item={item}/>)}
            </div>
          )}

          {/* Filler breakdown */}
          {finalResult.fillerWords.length > 0 && (
            <div className="card">
              <p className="section-label mb-2">Top Filler Words</p>
              <div className="flex flex-wrap gap-2">
                {finalResult.fillerWords.slice(0, 6).map((f, i) => (
                  <div key={i} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl"
                    style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
                    <span className="text-amber font-display font-bold text-sm" style={{ color:'var(--amber)' }}>"{f.word}"</span>
                    <span className="text-white/40 text-xs">×{f.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Flux AI feedback */}
          <div className="card" style={{ borderColor: 'rgba(34,211,238,0.15)' }}>
            <div className="flex gap-3 items-start">
              <Flux size={40} ageGroup={profile?.ageGroup||'explorer'} mood="happy" speaking={fluxSpeaking}/>
              <div className="flex-1">
                <p className="section-label mb-1.5">Flux says</p>
                {loadingAI
                  ? <div className="flex gap-1">{[0,1,2].map(i=><div key={i} className="w-2 h-2 rounded-full bg-white/20 animate-bounce" style={{animationDelay:`${i*0.15}s`}}/>)}</div>
                  : <p className="text-white/75 text-sm leading-relaxed">{aiFeedback || getOfflineResponse('encouragement')}</p>
                }
              </div>
            </div>
          </div>

          {/* Transcript */}
          {transcript && (
            <div className="card">
              <p className="section-label mb-2">Your Transcript</p>
              <p className="text-white/45 text-xs leading-relaxed">{transcript}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => { setStage('menu'); setTranscript(''); setFinalResult(null); setAiFeedback('') }}
              className="btn-ghost flex-1 font-display">Try Again</button>
            <button onClick={() => navigate('/home')}
              className="btn-aqua flex-1 font-display" style={{ color: '#05080f' }}>Home</button>
          </div>
        </div>
      )}
    </div>
  )
}
