import { useState, useCallback, useEffect } from 'react'
import { speakFlux, stopSpeaking, ttsAvailable, speak } from '../../ai/voiceEngine'
import { getSetting } from '../../utils/db'

// ─── READ ALOUD INLINE BUTTON ─────────────────────────────────────────────────
// Wrap any text block: <ReadAloud text="..." ageGroup="explorer" />
export function ReadAloud({ text, ageGroup = 'explorer', size = 'sm', className = '' }) {
  const [speaking, setSpeaking] = useState(false)
  if (!ttsAvailable() || !text) return null

  const toggle = (e) => {
    e?.stopPropagation()
    if (speaking) {
      stopSpeaking(); setSpeaking(false)
    } else {
      setSpeaking(true)
      speak(text, {
        ageGroup,
        rate: ageGroup === 'little' ? 0.8 : 0.9,
        onEnd: () => setSpeaking(false),
      })
    }
  }

  const sz = size === 'sm' ? 'w-7 h-7 text-xs' : size === 'md' ? 'w-9 h-9 text-sm' : 'w-11 h-11 text-base'

  return (
    <button
      onClick={toggle}
      className={`${sz} rounded-full flex items-center justify-center transition-all active:scale-90 flex-shrink-0 ${className}`}
      style={{
        background: speaking ? 'rgba(34,211,238,0.2)' : 'rgba(255,255,255,0.07)',
        border: `1px solid ${speaking ? 'rgba(34,211,238,0.4)' : 'rgba(255,255,255,0.1)'}`,
        color: speaking ? 'var(--aqua)' : 'rgba(255,255,255,0.4)',
        animation: speaking ? 'recordBlink 1.2s ease-in-out infinite' : 'none',
      }}
      title={speaking ? 'Stop reading' : 'Read aloud'}
      aria-label={speaking ? 'Stop reading' : 'Read aloud'}
    >
      {speaking ? '⏹' : '🔊'}
    </button>
  )
}

// ─── FLOATING PAGE READER ─────────────────────────────────────────────────────
// A floating 🔊 button that reads the entire page's visible text
// Rendered once in App.jsx, hidden on Splash/Auth
let _pageText = ''
export const setPageReadText = (text) => { _pageText = text }

export function FloatingReader({ ageGroup = 'explorer', hidden = false }) {
  const [speaking, setSpeaking]   = useState(false)
  const [visible, setVisible]     = useState(false)
  const [expanded, setExpanded]   = useState(false)

  useEffect(() => {
    // Show after 1.5s so it doesn't distract on page load
    const t = setTimeout(() => setVisible(!hidden), 1500)
    return () => clearTimeout(t)
  }, [hidden])

  useEffect(() => {
    if (hidden && speaking) { stopSpeaking(); setSpeaking(false) }
  }, [hidden])

  if (!ttsAvailable() || !visible) return null

  const readPage = () => {
    if (speaking) {
      stopSpeaking(); setSpeaking(false); setExpanded(false)
    } else {
      // Collect visible text from the DOM
      const walker = document.createTreeWalker(
        document.getElementById('root') || document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => {
            const el = node.parentElement
            if (!el) return NodeFilter.FILTER_REJECT
            const style = window.getComputedStyle(el)
            if (style.display === 'none' || style.visibility === 'hidden') return NodeFilter.FILTER_REJECT
            if (['SCRIPT','STYLE','SVG','CANVAS'].includes(el.tagName)) return NodeFilter.FILTER_REJECT
            return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
          }
        }
      )
      const texts = []
      let node
      while ((node = walker.nextNode())) {
        const t = node.textContent.trim()
        if (t.length > 1 && t.length < 500) texts.push(t)
      }
      const fullText = texts.slice(0, 30).join('. ').replace(/\s+/g, ' ').trim()
      if (!fullText) return

      setSpeaking(true); setExpanded(false)
      speak(fullText, { ageGroup, rate: 0.88, onEnd: () => setSpeaking(false) })
    }
  }

  return (
    <div className="fixed bottom-24 right-4 z-[200] flex flex-col items-end gap-2">
      {expanded && !speaking && (
        <div className="animate-scale-in glass-dark rounded-2xl px-3 py-2 text-xs text-white/60 font-display whitespace-nowrap"
          style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
          Read this page aloud
        </div>
      )}
      <button
        onClick={readPage}
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
        className="w-11 h-11 rounded-2xl flex items-center justify-center transition-all active:scale-90 shadow-lg"
        style={{
          background: speaking ? 'var(--aqua)' : 'rgba(12,17,32,0.9)',
          border: `1px solid ${speaking ? 'transparent' : 'rgba(255,255,255,0.15)'}`,
          color: speaking ? '#05080f' : 'rgba(255,255,255,0.6)',
          backdropFilter: 'blur(12px)',
          boxShadow: speaking ? '0 4px 20px rgba(34,211,238,0.4)' : '0 4px 16px rgba(0,0,0,0.4)',
          animation: speaking ? 'recordBlink 1.5s ease-in-out infinite' : 'none',
        }}
        aria-label={speaking ? 'Stop reading' : 'Read page aloud'}
        title={speaking ? 'Stop reading' : 'Read page aloud'}
      >
        <span className="text-lg">{speaking ? '⏹' : '🔊'}</span>
      </button>
    </div>
  )
}

// ─── AUTO-SPEAK HOOK ──────────────────────────────────────────────────────────
// Use on any page to auto-speak a message if autoSpeak setting is on
export function useAutoSpeak() {
  const autoSpeak = useCallback(async (text, ageGroup = 'explorer', delay = 400) => {
    if (!ttsAvailable() || !text) return
    try {
      const setting = await getSetting('autoSpeak', true)
      if (!setting) return
      setTimeout(() => {
        speakFlux(text, ageGroup, {})
      }, delay)
    } catch { /* silent */ }
  }, [])

  return autoSpeak
}

// ─── SKELETON LOADER ──────────────────────────────────────────────────────────
export function SkeletonLine({ width = '100%', height = 14, className = '' }) {
  return (
    <div
      className={`rounded-xl animate-shimmer ${className}`}
      style={{
        width, height,
        background: 'linear-gradient(90deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.05) 100%)',
        backgroundSize: '200% 100%',
      }}
    />
  )
}

export function SkeletonCard({ lines = 3, className = '' }) {
  return (
    <div className={`card flex flex-col gap-2.5 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLine key={i} width={i === lines - 1 ? '65%' : '100%'} height={13}/>
      ))}
    </div>
  )
}

export function SkeletonStat() {
  return (
    <div className="card flex flex-col items-center gap-2 py-4">
      <SkeletonLine width={40} height={28}/>
      <SkeletonLine width={50} height={10}/>
    </div>
  )
}
