// ─── AUDIO CHIME ENGINE ────────────────────────────────────────────────────────
// Generates tones using WebAudio API — fully offline, no audio files needed
// ─────────────────────────────────────────────────────────────────────────────

let _ctx = null

const getCtx = () => {
  if (!_ctx || _ctx.state === 'closed') {
    _ctx = new (window.AudioContext || window.webkitAudioContext)()
  }
  if (_ctx.state === 'suspended') _ctx.resume()
  return _ctx
}

const playTone = (freq, duration, type = 'sine', gain = 0.3, delay = 0) => {
  try {
    const ctx  = getCtx()
    const osc  = ctx.createOscillator()
    const vol  = ctx.createGain()
    osc.connect(vol)
    vol.connect(ctx.destination)
    osc.type = type
    osc.frequency.setValueAtTime(freq, ctx.currentTime + delay)
    vol.gain.setValueAtTime(0, ctx.currentTime + delay)
    vol.gain.linearRampToValueAtTime(gain, ctx.currentTime + delay + 0.02)
    vol.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration)
    osc.start(ctx.currentTime + delay)
    osc.stop(ctx.currentTime + delay + duration + 0.05)
  } catch { /* silent fail */ }
}

export const chimes = {
  // Timer chimes
  halfway: () => {
    // Two gentle ascending notes
    playTone(523, 0.3, 'sine', 0.2, 0)
    playTone(659, 0.3, 'sine', 0.2, 0.15)
  },

  timeUp: () => {
    // Three notes: cheerful completion
    playTone(523, 0.25, 'sine', 0.25, 0)
    playTone(659, 0.25, 'sine', 0.25, 0.18)
    playTone(784, 0.5,  'sine', 0.3,  0.36)
  },

  start: () => {
    // Single soft chime
    playTone(440, 0.4, 'sine', 0.2)
  },

  achievement: () => {
    // Ascending fanfare
    playTone(523, 0.15, 'sine', 0.3, 0)
    playTone(659, 0.15, 'sine', 0.3, 0.12)
    playTone(784, 0.15, 'sine', 0.3, 0.24)
    playTone(1047, 0.4, 'sine', 0.35, 0.36)
  },

  bravestar: () => {
    // Three rapid bright pings
    playTone(880,  0.2, 'sine', 0.3, 0)
    playTone(1047, 0.2, 'sine', 0.3, 0.15)
    playTone(1319, 0.4, 'sine', 0.35, 0.3)
  },

  tap: () => {
    playTone(660, 0.08, 'sine', 0.12)
  },

  // Breathing guide tones
  breatheIn:  () => playTone(330, 4.0, 'sine', 0.15),
  breatheHold:() => playTone(294, 2.0, 'sine', 0.1),
  breatheOut: () => playTone(247, 6.0, 'sine', 0.12),

  // Metronome beat for SpeakLab
  beat: () => playTone(800, 0.05, 'square', 0.08),

  // Filler word detected
  fillerPing: () => playTone(440, 0.1, 'triangle', 0.15),

  // Error / warning
  warning: () => {
    playTone(220, 0.3, 'sawtooth', 0.15, 0)
    playTone(196, 0.3, 'sawtooth', 0.15, 0.2)
  },
}

// ─── EXERCISE TIMER WITH CHIMES ───────────────────────────────────────────────
export class ExerciseTimer {
  constructor({ duration, onTick, onHalfway, onComplete }) {
    this.duration   = duration
    this.elapsed    = 0
    this.running    = false
    this.onTick     = onTick
    this.onHalfway  = onHalfway
    this.onComplete = onComplete
    this._interval  = null
    this._halfwayFired = false
  }

  start() {
    this.running = true
    this._interval = setInterval(() => {
      this.elapsed += 1
      this.onTick?.(this.elapsed, this.duration)

      if (!this._halfwayFired && this.elapsed >= Math.floor(this.duration / 2)) {
        this._halfwayFired = true
        chimes.halfway()
        this.onHalfway?.()
      }

      if (this.elapsed >= this.duration) {
        this.stop()
        chimes.timeUp()
        this.onComplete?.()
      }
    }, 1000)
    chimes.start()
    return this
  }

  stop() {
    clearInterval(this._interval)
    this.running = false
  }

  reset() {
    this.stop()
    this.elapsed = 0
    this._halfwayFired = false
  }
}
