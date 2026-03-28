import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Flux from '../flux/Flux'
import { speakFlux, ttsAvailable } from '../../ai/voiceEngine'
import { getSetting, getStreakCount } from '../../utils/db'
import { haptics } from '../../utils/haptics'
import { callFluxAI, getOfflineResponse } from '../../ai/fluxEngine'

// ─── CONFETTI CANVAS ──────────────────────────────────────────────────────────
function ConfettiCanvas() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    canvas.width  = window.innerWidth
    canvas.height = window.innerHeight

    const COLORS = ['#22d3ee','#a78bfa','#fbbf24','#34d399','#fb7185','#fff']
    const particles = Array.from({ length: 80 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * 100,
      w: 6 + Math.random() * 8,
      h: 4 + Math.random() * 6,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      vx: (Math.random() - 0.5) * 3,
      vy: 2 + Math.random() * 4,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.15,
      alpha: 1,
      decay: 0.005 + Math.random() * 0.005,
    }))

    let animId
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      let alive = 0
      particles.forEach(p => {
        if (p.alpha <= 0) return
        alive++
        p.x += p.vx; p.y += p.vy; p.angle += p.spin; p.alpha -= p.decay
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.angle)
        ctx.globalAlpha = Math.max(0, p.alpha)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h)
        ctx.restore()
      })
      if (alive > 0) animId = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(animId)
  }, [])

  return (
    <canvas ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[300]"
      style={{ width:'100%', height:'100%' }}
    />
  )
}

// ─── CELEBRATION SCREEN ───────────────────────────────────────────────────────
const NEXT_ACTIONS = {
  breathe:         { label: 'Try SpeakLab',         path: '/speaklab',      icon: '🗣️' },
  speaklab:        { label: 'Do a BraveMission',     path: '/brave',         icon: '🦁' },
  brave:           { label: 'Tell a TalkTale',       path: '/talktales',     icon: '📖' },
  talktales:       { label: 'Write in your Journal', path: '/journal',       icon: '🎙️' },
  journal:         { label: 'Breathe & Reset',       path: '/breathe',       icon: '💨' },
  act:             { label: 'Practice Speech Lab',   path: '/speaklab',      icon: '🗣️' },
  daf:             { label: 'Run a BraveMission',    path: '/brave',         icon: '🦁' },
  speech_analysis: { label: 'Open SpeakLab',         path: '/speaklab',      icon: '🗣️' },
  adventure:       { label: 'Talk to Flux',          path: '/flux-chat',     icon: '💧' },
  comm:            { label: 'Check your Progress',   path: '/progress',      icon: '🌌' },
  default:         { label: 'Back to Home',          path: '/home',          icon: '🏠' },
}

export default function CelebrationScreen({
  sessionType = 'default',
  score = 0,
  message = '',
  stars = 0,
  onDismiss,
  ageGroup = 'explorer',
  profile,
}) {
  const [streak, setStreak]     = useState(0)
  const [aiMsg, setAiMsg]       = useState(message || getOfflineResponse('celebration'))
  const [showConfetti, setShowConfetti] = useState(true)
  const navigate = useNavigate()
  const nextAction = NEXT_ACTIONS[sessionType] || NEXT_ACTIONS.default

  useEffect(() => {
    // Haptic burst
    haptics.sessionDone()

    // Load streak
    getStreakCount().then(setStreak)

    // Speak the celebration message
    const speak = async () => {
      const autoSpeak = await getSetting('autoSpeak', true)
      const msg = message || getOfflineResponse('celebration')
      setAiMsg(msg)
      if (autoSpeak && ttsAvailable()) {
        setTimeout(() => speakFlux(msg, ageGroup), 300)
      }

      // Try AI-enhanced message
      try {
        const result = await callFluxAI([{
          role: 'user',
          content: `User just completed a ${sessionType} session with score ${score}. Give a 1-2 sentence warm celebration in Flux voice. Age: ${ageGroup}. Reference the session type specifically.`
        }], profile)
        if (result.source === 'ai' && result.text) {
          setAiMsg(result.text)
          const autoSpeakSetting = await getSetting('autoSpeak', true)
          if (autoSpeakSetting && ttsAvailable()) speakFlux(result.text, ageGroup)
        }
      } catch { /* use offline message */ }
    }
    speak()

    // Stop confetti after 3.5s
    const t = setTimeout(() => setShowConfetti(false), 3500)
    return () => clearTimeout(t)
  }, [])

  const handleNext = (path) => {
    haptics.tap()
    onDismiss?.()
    navigate(path)
  }

  return (
    <div className="fixed inset-0 z-[250] flex items-end justify-center"
      style={{ background: 'rgba(5,8,15,0.85)', backdropFilter: 'blur(8px)' }}>
      {showConfetti && <ConfettiCanvas />}

      <div className="w-full max-w-md animate-slide-up"
        style={{
          background: 'linear-gradient(180deg, rgba(12,17,32,0.99) 0%, rgba(5,8,15,1) 100%)',
          borderRadius: '28px 28px 0 0',
          border: '1px solid rgba(255,255,255,0.1)',
          borderBottom: 'none',
          padding: '28px 24px 40px',
        }}>

        {/* Drag handle */}
        <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background: 'rgba(255,255,255,0.15)' }}/>

        {/* Flux */}
        <div className="flex justify-center mb-4">
          <div className="animate-flux-float" style={{ filter: 'drop-shadow(0 0 24px rgba(34,211,238,0.5))' }}>
            <Flux size={90} ageGroup={ageGroup} mood="excited" speaking={false}/>
          </div>
        </div>

        {/* Stars */}
        {stars > 0 && (
          <div className="flex justify-center gap-1 mb-3">
            {Array.from({ length: Math.min(stars, 5) }).map((_, i) => (
              <span key={i} className="text-2xl animate-star-pop" style={{ animationDelay: `${i*0.1}s` }}>⭐</span>
            ))}
          </div>
        )}

        {/* Score */}
        {score > 0 && (
          <div className="text-center mb-3">
            <span className="font-display font-bold text-4xl" style={{ color: 'var(--aqua)' }}>+{score}</span>
            <span className="text-white/40 text-sm ml-2">points</span>
          </div>
        )}

        {/* Streak */}
        {streak > 0 && (
          <div className="flex justify-center mb-4">
            <span className="pill-amber font-display text-sm">
              🔥 {streak} day streak!
            </span>
          </div>
        )}

        {/* Flux message */}
        <div className="glass rounded-2xl px-4 py-3 mb-5 text-center">
          <p className="text-white/85 text-sm leading-relaxed">{aiMsg}</p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2.5">
          <button
            onClick={() => handleNext(nextAction.path)}
            className="w-full py-4 rounded-2xl font-display font-bold text-base transition-all active:scale-95"
            style={{ background: 'var(--aqua)', color: '#05080f', boxShadow: '0 4px 24px rgba(34,211,238,0.35)' }}>
            {nextAction.icon} {nextAction.label}
          </button>
          <button
            onClick={() => handleNext('/home')}
            className="btn-ghost w-full py-3 font-display text-sm">
            Back to Home
          </button>
        </div>
      </div>
    </div>
  )
}
