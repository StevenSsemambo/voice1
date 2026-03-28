// ─── SPEECH ANALYSIS ENGINE v5 ────────────────────────────────────────────────
// Real-time filler word detection · WPM · Pause detection · Fluency score
// Works 100% offline using Web Speech API + local analysis
// Optional: Claude API for deeper narrative feedback when online
// ─────────────────────────────────────────────────────────────────────────────

import { callFluxAI, getOfflineResponse } from './fluxEngine'

// ─── FILLER WORDS DATABASE ────────────────────────────────────────────────────
export const FILLERS = new Set([
  'um', 'uh', 'er', 'ah', 'like', 'you know', 'i mean', 'basically',
  'literally', 'actually', 'so', 'right', 'okay', 'well', 'just',
  'kind of', 'sort of', 'you see', 'you know what i mean', 'honestly',
  'obviously', 'clearly', 'whatever', 'anyway', 'stuff', 'things',
])

// ─── OFFLINE ANALYSIS ENGINE ──────────────────────────────────────────────────
export const analyzeTranscript = (transcript, durationSeconds) => {
  if (!transcript || !transcript.trim()) {
    return { wpm: 0, fillerCount: 0, fillerWords: [], pauseScore: 0, fluencyScore: 0, clarity: 0, wordCount: 0, feedback: [] }
  }

  const words = transcript.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const wordCount = words.length
  const wpm = durationSeconds > 0 ? Math.round((wordCount / durationSeconds) * 60) : 0

  // Filler detection
  const fillerWords = []
  const text = transcript.toLowerCase()
  FILLERS.forEach(filler => {
    const regex = new RegExp(`\\b${filler}\\b`, 'gi')
    const matches = text.match(regex)
    if (matches) fillerWords.push({ word: filler, count: matches.length })
  })
  const fillerCount = fillerWords.reduce((a, b) => a + b.count, 0)
  const fillerRate = wordCount > 0 ? (fillerCount / wordCount) * 100 : 0

  // Repetition detection (stuttering marker)
  const repetitions = []
  for (let i = 0; i < words.length - 1; i++) {
    if (words[i] === words[i + 1] && words[i].length > 1) {
      repetitions.push(words[i])
    }
  }

  // Pause detection from transcript gaps (marked by silence in STT as "..." or gaps)
  const pauseMarkers = (transcript.match(/\.\.\.|—|–/g) || []).length
  const sentenceCount = (transcript.match(/[.!?]+/g) || []).length || 1
  const avgWordsPerSentence = wordCount / sentenceCount

  // Compute fluency score (0–100)
  let fluencyScore = 85
  fluencyScore -= Math.min(fillerRate * 2, 30)    // penalise fillers
  fluencyScore -= Math.min(repetitions.length * 5, 20) // penalise repetitions
  if (wpm > 180) fluencyScore -= 10               // too fast
  if (wpm < 80 && wpm > 0) fluencyScore -= 5     // too slow (unless therapeutic)
  fluencyScore = Math.max(10, Math.min(100, Math.round(fluencyScore)))

  // Clarity score
  const clarityScore = Math.max(20, Math.min(100, Math.round(90 - fillerRate * 1.5 - repetitions.length * 3)))

  // Generate feedback array (offline — no AI needed)
  const feedback = []

  if (wpm > 0 && wpm < 100) feedback.push({ type: 'good', text: 'Your speaking rate is therapeutic — slow and deliberate. This is excellent for clarity.' })
  if (wpm >= 100 && wpm <= 150) feedback.push({ type: 'good', text: `Speaking rate of ${wpm} WPM is ideal — clear and comfortable to follow.` })
  if (wpm > 180) feedback.push({ type: 'improve', text: `${wpm} WPM is fast. Try slowing to 120–150 WPM to give your brain time to coordinate.` })

  if (fillerCount === 0) feedback.push({ type: 'great', text: 'Zero filler words detected. That is exceptional discipline.' })
  else if (fillerCount <= 3) feedback.push({ type: 'good', text: `Only ${fillerCount} filler word${fillerCount > 1 ? 's' : ''} — well within natural range.` })
  else {
    const top = [...fillerWords].sort((a, b) => b.count - a.count)[0]
    feedback.push({ type: 'improve', text: `"${top.word}" appeared ${top.count} times. Try replacing it with a deliberate pause.` })
  }

  if (repetitions.length > 0) feedback.push({ type: 'info', text: `${repetitions.length} word repetition${repetitions.length > 1 ? 's' : ''} detected — a natural stuttering pattern. You kept going. That's brave.` })

  if (avgWordsPerSentence > 25) feedback.push({ type: 'improve', text: 'Sentences are quite long. Shorter sentences = more impact and easier breathing.' })
  if (sentenceCount >= 3 && avgWordsPerSentence < 15) feedback.push({ type: 'good', text: 'Good sentence variety — clear, punchy structure.' })

  return {
    wpm,
    wordCount,
    fillerCount,
    fillerWords: fillerWords.sort((a, b) => b.count - a.count),
    repetitions,
    pauseMarkers,
    sentenceCount,
    avgWordsPerSentence: Math.round(avgWordsPerSentence),
    fluencyScore,
    clarityScore,
    feedback,
    durationSeconds,
  }
}

// ─── AI-ENHANCED FEEDBACK (online only, graceful fallback) ─────────────────────
export const getAIAnalysisFeedback = async (analysisResult, exerciseContext, profile) => {
  try {
    const { wpm, fillerCount, fluencyScore, repetitions, wordCount } = analysisResult
    const messages = [{
      role: 'user',
      content: `Speech analysis results:
- Words per minute: ${wpm} (target: 100–150 for therapy, 140–160 for comm coaching)
- Filler words: ${fillerCount} out of ${wordCount} words (${fillerCount > 0 ? ((fillerCount/wordCount)*100).toFixed(1) : 0}%)
- Repetitions detected: ${repetitions.length}
- Fluency score: ${fluencyScore}/100
- Exercise context: ${exerciseContext}
- User mode: ${profile?.mode || 'stutter'}

Give 2-3 sentences of warm, specific, Flux-voiced feedback. Lead with what went RIGHT. Be concrete — reference the actual numbers. End with one actionable next-step tip. Age group: ${profile?.ageGroup || 'explorer'}.`
    }]

    const result = await callFluxAI(messages, profile)
    return result.text || getOfflineResponse('encouragement')
  } catch {
    return getOfflineResponse('encouragement')
  }
}

// ─── LIVE SPEECH RECORDER WITH ANALYSIS ───────────────────────────────────────
export class LiveSpeechRecorder {
  constructor(onTranscriptUpdate, onAnalysisUpdate) {
    this.recognition = null
    this.startTime = null
    this.transcript = ''
    this.isRecording = false
    this.onTranscriptUpdate = onTranscriptUpdate
    this.onAnalysisUpdate = onAnalysisUpdate
    this.analysisInterval = null
  }

  get supported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  }

  start() {
    if (!this.supported) return false
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    this.recognition = new SR()
    this.recognition.continuous = true
    this.recognition.interimResults = true
    this.recognition.lang = 'en-US'
    this.startTime = Date.now()
    this.transcript = ''
    this.isRecording = true

    this.recognition.onresult = (e) => {
      const newTranscript = Array.from(e.results).map(r => r[0].transcript).join(' ')
      this.transcript = newTranscript
      this.onTranscriptUpdate?.(newTranscript, e.results[e.results.length - 1].isFinal)

      // Run live analysis every 3 seconds
      const elapsed = (Date.now() - this.startTime) / 1000
      if (elapsed > 2) {
        const analysis = analyzeTranscript(this.transcript, elapsed)
        this.onAnalysisUpdate?.(analysis)
      }
    }

    this.recognition.onerror = () => {}
    this.recognition.onend = () => {
      if (this.isRecording) {
        try { this.recognition.start() } catch {}
      }
    }

    try { this.recognition.start(); return true } catch { return false }
  }

  stop() {
    this.isRecording = false
    clearInterval(this.analysisInterval)
    try { this.recognition?.stop() } catch {}
    const elapsed = (Date.now() - this.startTime) / 1000
    return {
      transcript: this.transcript,
      duration: elapsed,
      analysis: analyzeTranscript(this.transcript, elapsed),
    }
  }
}

// ─── FLUENCY SCORE COLOR ──────────────────────────────────────────────────────
export const scoreColor = (score) => {
  if (score >= 80) return 'var(--jade)'
  if (score >= 60) return 'var(--amber)'
  if (score >= 40) return 'var(--rose)'
  return '#ef4444'
}

export const scoreLabel = (score) => {
  if (score >= 85) return 'Excellent'
  if (score >= 70) return 'Strong'
  if (score >= 55) return 'Developing'
  if (score >= 40) return 'Keep Going'
  return 'Early Stage'
}

// ─── WPM BENCHMARK ────────────────────────────────────────────────────────────
export const wpmFeedback = (wpm, mode = 'stutter') => {
  if (wpm === 0) return { label: 'No data', color: 'rgba(255,255,255,0.3)' }
  if (mode === 'stutter') {
    if (wpm < 80)  return { label: 'Therapeutic slow', color: 'var(--aqua)' }
    if (wpm < 130) return { label: 'Excellent pace',   color: 'var(--jade)' }
    if (wpm < 160) return { label: 'Good pace',        color: 'var(--jade)' }
    if (wpm < 200) return { label: 'A bit fast',       color: 'var(--amber)' }
    return { label: 'Too fast',                         color: 'var(--rose)' }
  } else {
    if (wpm < 100) return { label: 'Too slow',          color: 'var(--amber)' }
    if (wpm < 120) return { label: 'Deliberate',        color: 'var(--aqua)' }
    if (wpm < 160) return { label: 'Ideal range',       color: 'var(--jade)' }
    if (wpm < 200) return { label: 'Energetic',         color: 'var(--jade)' }
    return { label: 'Very fast',                         color: 'var(--amber)' }
  }
}
