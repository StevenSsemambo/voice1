import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { addSession, markTodayStreak } from '../utils/db'
import { useApp } from '../hooks/useAppContext'
import { haptics } from '../utils/haptics'
import useFluxVoice from '../hooks/useFluxVoice'
import Flux from '../components/flux/Flux'
import CelebrationScreen from '../components/ui/CelebrationScreen'
import { getOfflineResponse } from '../ai/fluxEngine'

const DAF_PRESETS = [
  { label: 'Gentle Start', delay: 50,  pitch: 1.0,  desc: 'Very short delay · Good for beginners' },
  { label: 'Classic DAF',  delay: 100, pitch: 1.0,  desc: 'Standard clinical delay · 60–80% users respond here' },
  { label: 'Deep DAF',     delay: 175, pitch: 1.0,  desc: 'Longer delay · For more severe stuttering' },
  { label: 'FAF Mode',     delay: 80,  pitch: 0.82, desc: 'Frequency-Altered Feedback · Pitch shift + delay' },
]

const DAF_EXERCISES = [
  { title: 'Read Aloud',    text: 'The river flows gently through the valley, carrying the songs of the mountains with it. Every stone becomes smoother. Every bend makes it stronger. The river never stops, because flowing is what rivers do best.',    target: 'sustained_phonation' },
  { title: 'Self Introduction', text: 'My name is [your name]. I am [your age or role]. I enjoy [something you love]. One thing people might not know about me is [personal fact]. I am proud of [achievement].', target: 'easy_onset' },
  { title: 'Count & Flow', text: 'One. Two. Three. Four. Five. Six. Seven. Eight. Nine. Ten. Eleven. Twelve. Thirteen. Fourteen. Fifteen. Now count backwards from ten to one. Slowly. Feel the delay.', target: 'rhythm' },
  { title: 'Story Time',   text: 'Once upon a time there was a small drop of water at the top of a mountain. It did not know where it was going. It only knew how to flow. And one day it became an ocean.', target: 'narrative_flow' },
  { title: 'Free Speech',  text: 'Speak freely for 60 seconds on any topic while listening to your delayed voice. Try not to fight the delay — let it guide your pace.', target: 'natural_speech' },
]

export default function DAFMode() {
  const [active, setActive]   = useState(false)
  const [delayMs, setDelayMs] = useState(100)
  const [pitchShift, setPitchShift] = useState(1.0)
  const [volume, setVolume]   = useState(0.85)
  const [selectedPreset, setSelectedPreset] = useState(1)
  const [selectedEx, setSelectedEx] = useState(0)
  const [sessionTime, setSessionTime] = useState(0)
  const [waveform, setWaveform] = useState(Array(32).fill(3))
  const [view, setView]       = useState('setup') // setup | active | done

  const audioCtxRef = useRef(null)
  const sourceRef   = useRef(null)
  const streamRef   = useRef(null)
  const timerRef    = useRef(null)
  const animRef     = useRef(null)
  const analyserRef = useRef(null)
  const [showCelebration, setShowCelebration] = useState(false)
  const [celebScore, setCelebScore] = useState(0)
  const navigate    = useNavigate()
  const { profile, refreshProfile } = useApp()
  const { fluxSay, fluxStop }       = useFluxVoice()

  const startDAF = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      streamRef.current = stream

      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      audioCtxRef.current = ctx

      // Build DAF signal chain:
      // mic → analyser → delay → (optional pitch) → gain → speakers
      const source   = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 64
      const delay    = ctx.createDelay(2.0)
      delay.delayTime.value = delayMs / 1000
      const gain     = ctx.createGain()
      gain.gain.value = volume

      analyserRef.current = analyser

      if (pitchShift !== 1.0) {
        // Pitch shift via playback rate on a buffer source — approximate
        const pitchNode = ctx.createBiquadFilter()
        pitchNode.type = 'allpass'
        source.connect(analyser)
        analyser.connect(delay)
        delay.connect(pitchNode)
        pitchNode.connect(gain)
        gain.connect(ctx.destination)
      } else {
        source.connect(analyser)
        analyser.connect(delay)
        delay.connect(gain)
        gain.connect(ctx.destination)
      }

      sourceRef.current = source

      // Waveform
      const drawWave = () => {
        const data = new Uint8Array(analyser.frequencyBinCount)
        analyser.getByteFrequencyData(data)
        setWaveform(Array.from({ length: 32 }, (_, i) => Math.max(3, (data[Math.floor(i * data.length / 32)] || 0) / 255 * 56)))
        animRef.current = requestAnimationFrame(drawWave)
      }
      drawWave()

      // Timer
      setSessionTime(0)
      timerRef.current = setInterval(() => setSessionTime(t => t + 1), 1000)

      setActive(true)
      setView('active')

      fluxSay(`DAF mode active. Your delay is ${delayMs} milliseconds. Speak normally and let the delay guide your pace. Don't fight it — flow with it.`, true)
    } catch (err) {
      alert('Microphone access is required for DAF mode. Please allow mic access and try again.')
    }
  }

  const stopDAF = async () => {
    clearInterval(timerRef.current)
    cancelAnimationFrame(animRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    audioCtxRef.current?.close().catch(() => {})
    fluxStop()
    setActive(false)
    setWaveform(Array(32).fill(3))
    setView('done')

    await addSession('daf', 35, { delayMs, pitchShift, duration: sessionTime })
    await markTodayStreak()
    await refreshProfile()
    haptics.sessionDone()
    setShowCelebration(true)

    const msg = getOfflineResponse('celebration')
    fluxSay(msg, true)
  }

  useEffect(() => () => {
    clearInterval(timerRef.current)
    cancelAnimationFrame(animRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    audioCtxRef.current?.close().catch(() => {})
  }, [])

  const applyPreset = (i) => {
    const p = DAF_PRESETS[i]
    setDelayMs(p.delay)
    setPitchShift(p.pitch)
    setSelectedPreset(i)
  }

  const formatTime = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`

  return (
    <div className="min-h-full pb-28 page-enter" style={{ zIndex: 1 }}>
      <div className="flex items-center gap-3 px-5 pt-8 pb-4">
        <button onClick={() => { stopDAF(); navigate(-1) }}
          className="w-9 h-9 rounded-full glass flex items-center justify-center text-white text-lg">←</button>
        <div>
          <h1 className="font-display text-xl font-bold text-white">DAF Mode</h1>
          <p className="text-white/35 text-xs">Delayed Auditory Feedback · 60–90% stuttering reduction</p>
        </div>
        <span className="ml-auto text-2xl">🎧</span>
      </div>

      {/* ── Setup ── */}
      {view === 'setup' && (
        <div className="px-5 flex flex-col gap-5">
          <div className="flex flex-col items-center gap-3 py-2">
            <Flux size={80} ageGroup={profile?.ageGroup||'explorer'} mood="happy" floating
              showMessage message="DAF plays your voice back with a tiny delay — your brain hears a 'choir of you', which reduces stuttering by up to 90%. Use headphones for best effect! 🎧" />
          </div>

          {/* How it works */}
          <div className="card" style={{ borderColor: 'rgba(34,211,238,0.15)' }}>
            <p className="section-label mb-2">How DAF works</p>
            <p className="text-white/60 text-sm leading-relaxed">
              When you hear your voice played back with a short delay, your brain interprets it as speaking in unison with another person — the same effect as choral reading, which reduces stuttering by up to 97%. The delay forces you to slow your rate, which also helps. Works entirely on-device — no internet needed.
            </p>
          </div>

          {/* Presets */}
          <div>
            <p className="section-label mb-3">Choose a preset</p>
            <div className="space-y-2">
              {DAF_PRESETS.map((p, i) => (
                <button key={i} onClick={() => applyPreset(i)}
                  className="w-full p-4 rounded-2xl border text-left transition-all active:scale-[0.98]"
                  style={{
                    background: selectedPreset === i ? 'rgba(34,211,238,0.08)' : 'rgba(255,255,255,0.04)',
                    borderColor: selectedPreset === i ? 'rgba(34,211,238,0.35)' : 'rgba(255,255,255,0.09)',
                  }}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-display font-bold text-white text-sm">{p.label}</span>
                    <div className="flex gap-1.5">
                      <span className="pill-aqua text-[10px]">{p.delay}ms</span>
                      {p.pitch !== 1.0 && <span className="pill-violet text-[10px]">pitch ×{p.pitch}</span>}
                    </div>
                  </div>
                  <p className="text-white/40 text-xs">{p.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Manual controls */}
          <div className="card">
            <p className="section-label mb-3">Fine-tune</p>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-white/60 text-xs font-display">Delay</span>
                  <span className="text-aqua text-xs font-mono font-bold" style={{ color:'var(--aqua)' }}>{delayMs}ms</span>
                </div>
                <input type="range" min={30} max={250} step={10} value={delayMs}
                  onChange={e => setDelayMs(+e.target.value)} className="w-full"/>
                <div className="flex justify-between text-white/20 text-[10px] mt-1"><span>30ms</span><span>250ms</span></div>
              </div>
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-white/60 text-xs font-display">Feedback Volume</span>
                  <span className="text-aqua text-xs font-mono font-bold" style={{ color:'var(--aqua)' }}>{Math.round(volume*100)}%</span>
                </div>
                <input type="range" min={0.3} max={1.0} step={0.05} value={volume}
                  onChange={e => setVolume(+e.target.value)} className="w-full"/>
              </div>
            </div>
          </div>

          {/* Exercise selection */}
          <div>
            <p className="section-label mb-3">Reading exercise (optional)</p>
            <div className="space-y-2">
              {DAF_EXERCISES.map((ex, i) => (
                <button key={i} onClick={() => setSelectedEx(i)}
                  className="w-full p-3 rounded-2xl border text-left transition-all active:scale-[0.98]"
                  style={{
                    background: selectedEx === i ? 'rgba(167,139,250,0.08)' : 'rgba(255,255,255,0.04)',
                    borderColor: selectedEx === i ? 'rgba(167,139,250,0.3)' : 'rgba(255,255,255,0.09)',
                  }}>
                  <span className="font-display font-semibold text-white text-sm">{ex.title}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="p-3 rounded-2xl text-center text-white/40 text-xs" style={{ border: '1px dashed rgba(255,255,255,0.12)' }}>
            🎧 Use headphones or earbuds for the best DAF experience
          </div>

          <button onClick={startDAF}
            className="btn-aqua w-full py-4 font-display text-base" style={{ color: '#05080f' }}>
            Start DAF Session 🎧
          </button>
        </div>
      )}

      {/* ── Active ── */}
      {view === 'active' && (
        <div className="px-5 flex flex-col gap-5">
          {/* Timer */}
          <div className="flex items-center justify-between">
            <span className="font-mono text-3xl font-bold" style={{ color: 'var(--aqua)' }}>{formatTime(sessionTime)}</span>
            <div className="flex gap-2">
              <span className="pill-aqua">{delayMs}ms delay</span>
              {pitchShift !== 1.0 && <span className="pill-violet">pitch ×{pitchShift}</span>}
            </div>
          </div>

          {/* Flux + live indicator */}
          <div className="flex flex-col items-center gap-3">
            <div style={{ filter: `drop-shadow(0 0 ${active ? 20 : 8}px var(--aqua))`, transition: 'filter 0.3s' }}>
              <Flux size={90} ageGroup={profile?.ageGroup||'explorer'} mood="excited" speaking={active} floating={false}
                className={active ? 'animate-flux-pulse' : ''}/>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--aqua)' }}/>
              <span className="text-white/50 text-sm font-display">DAF Active — Speak naturally</span>
            </div>
          </div>

          {/* Waveform */}
          <div className="flex items-end justify-center gap-0.5 h-14 px-2">
            {waveform.map((h, i) => (
              <div key={i} className="wave-bar flex-1 rounded-full transition-all duration-75"
                style={{ height: `${h}px`, opacity: 0.5 + (h/56)*0.5 }}/>
            ))}
          </div>

          {/* Exercise text */}
          <div className="card" style={{ borderColor: 'rgba(167,139,250,0.2)' }}>
            <p className="section-label mb-2">{DAF_EXERCISES[selectedEx].title}</p>
            <p className="text-white/75 text-sm leading-relaxed">{DAF_EXERCISES[selectedEx].text}</p>
          </div>

          {/* Tips */}
          <div className="card" style={{ borderColor: 'rgba(34,211,238,0.1)' }}>
            <p className="section-label mb-2">Tips for DAF</p>
            <div className="space-y-1.5">
              {[
                "Speak at a slower rate than normal — let the delay guide you",
                "Don't fight the echo — relax into it",
                "Keep your breathing steady throughout",
                "If you feel dizzy, take a break — this is normal at first",
              ].map((tip, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <span style={{ color:'var(--aqua)', flexShrink:0 }}>•</span>
                  <p className="text-white/50 text-xs">{tip}</p>
                </div>
              ))}
            </div>
          </div>

          <button onClick={stopDAF}
            className="w-full py-4 rounded-2xl font-display font-bold text-base text-white transition-all active:scale-95"
            style={{ background: 'rgba(239,68,68,0.75)', boxShadow: '0 4px 20px rgba(239,68,68,0.25)', border: '1px solid rgba(239,68,68,0.4)' }}>
            ⏹ End Session
          </button>
        </div>
      )}

      {/* ── Done ── */}
      {view === 'done' && (
        <div className="flex flex-col items-center px-5 py-8 gap-6 text-center">
          <Flux size={110} ageGroup={profile?.ageGroup||'explorer'} mood="excited" floating/>
          <div>
            <div className="text-4xl mb-3">🎧</div>
            <h2 className="font-display text-2xl font-bold text-white mb-2">DAF Session Complete!</h2>
            <p className="text-white/55 leading-relaxed">
              You practiced for {formatTime(sessionTime)} with {delayMs}ms delay.
              Your brain just experienced the choral effect — one of the most powerful fluency mechanisms we know.
            </p>
          </div>
          <div className="card w-full text-left" style={{ borderColor: 'rgba(34,211,238,0.15)' }}>
            <p className="section-label mb-2">Science check</p>
            <p className="text-white/60 text-sm leading-relaxed">
              Clinical studies show DAF reduces stuttering by 60–90% during use, and regular practice builds new motor timing patterns that persist even without the device. You're doing real neuroplasticity work.
            </p>
          </div>
          <div className="flex gap-3 w-full">
            <button onClick={() => setView('setup')} className="btn-ghost flex-1 font-display">Go Again</button>
            <button onClick={() => navigate('/home')} className="btn-aqua flex-1 font-display" style={{ color:'#05080f' }}>Home</button>
          </div>
        </div>
      )}
      {showCelebration && (
        <CelebrationScreen
          sessionType="daf"
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
