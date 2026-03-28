// ─── FLUX AI ENGINE v2 ────────────────────────────────────────────────────────
// Persistent memory · Adaptive learning · Dual-mode (stutter + communication)
// ─────────────────────────────────────────────────────────────────────────────

import { db, getSetting, setSetting } from '../utils/db'

const MODEL = 'claude-sonnet-4-20250514'

// ═══════════════════════════════════════════════════════════════════════════════
// MEMORY SYSTEM — Flux learns and remembers across every session
// ═══════════════════════════════════════════════════════════════════════════════

export const MemoryKeys = {
  INSIGHTS:       'flux_insights',
  STRENGTHS:      'flux_strengths',
  WEAKNESSES:     'flux_weaknesses',
  RECOMMENDATIONS:'flux_recs',
  PROGRESS_STORY: 'flux_story',
  GOALS:          'flux_goals',
}

export const saveMemory = (key, data) => setSetting(key, JSON.stringify(data))
export const loadMemory = async (key, fallback = null) => {
  try { const r = await getSetting(key); return r ? JSON.parse(r) : fallback }
  catch { return fallback }
}

export const buildUserMemory = async (profile) => {
  const [insights, strengths, weaknesses, story, recs] = await Promise.all([
    loadMemory(MemoryKeys.INSIGHTS, []),
    loadMemory(MemoryKeys.STRENGTHS, []),
    loadMemory(MemoryKeys.WEAKNESSES, []),
    loadMemory(MemoryKeys.PROGRESS_STORY, ''),
    loadMemory(MemoryKeys.RECOMMENDATIONS, null),
  ])
  const sessions = await db.sessions.orderBy('date').reverse().limit(10).toArray()
  const recentTypes = sessions.map(s => s.type).join(', ')
  const avgScore = sessions.length ? Math.round(sessions.reduce((a,b) => a+(b.score||0),0)/sessions.length) : 0
  return { insights: insights.slice(-8), strengths: strengths.slice(-6), weaknesses: weaknesses.slice(-6),
           story, recs, recentTypes, avgScore, totalSessions: await db.sessions.count() }
}

export const updateMemoryAfterSession = async (sessionType, sessionData, profile) => {
  try {
    const memory = await buildUserMemory(profile)
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 500, messages: [{
        role: 'user',
        content: `Analyze this practice session and extract key insights.
Session: ${sessionType} | Data: ${JSON.stringify(sessionData)} | User: ${profile?.name}, ${profile?.ageGroup}, mode: ${profile?.mode||'stutter'}
History: ${memory.recentTypes} | Strengths: ${memory.strengths.join(',')||'none'} | Weaknesses: ${memory.weaknesses.join(',')||'none'}
Respond ONLY with JSON (no markdown):
{"newInsight":"one specific observation max 20 words","strengthsToAdd":["strength if earned"],"weaknessesToAddress":["area if needed"],"nextRec":"one specific next practice recommendation max 18 words","progressNote":"one encouraging sentence for progress story max 20 words"}`
      }]})
    })
    const data = await resp.json()
    const result = JSON.parse((data.content?.find(b=>b.type==='text')?.text||'{}').replace(/```json|```/g,'').trim())
    if (result.newInsight) {
      const ins = await loadMemory(MemoryKeys.INSIGHTS, [])
      ins.push({ text: result.newInsight, date: new Date().toISOString(), session: sessionType })
      await saveMemory(MemoryKeys.INSIGHTS, ins.slice(-30))
    }
    if (result.strengthsToAdd?.length) {
      const s = await loadMemory(MemoryKeys.STRENGTHS, [])
      await saveMemory(MemoryKeys.STRENGTHS, [...new Set([...s, ...result.strengthsToAdd])].slice(-20))
    }
    if (result.weaknessesToAddress?.length) {
      const w = await loadMemory(MemoryKeys.WEAKNESSES, [])
      await saveMemory(MemoryKeys.WEAKNESSES, [...new Set([...w, ...result.weaknessesToAddress])].slice(-10))
    }
    if (result.nextRec) await saveMemory(MemoryKeys.RECOMMENDATIONS, { text: result.nextRec, date: new Date().toISOString() })
    if (result.progressNote) {
      const story = await loadMemory(MemoryKeys.PROGRESS_STORY, '')
      await saveMemory(MemoryKeys.PROGRESS_STORY, (story + ' ' + result.progressNote).trim().slice(-500))
    }
    return result
  } catch (e) { console.warn('Memory update failed:', e.message); return null }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT — fully adaptive to mode, age, memory
// ═══════════════════════════════════════════════════════════════════════════════

const buildSystemPrompt = async (profile) => {
  const memory = await buildUserMemory(profile)
  const mode = profile?.mode || 'stutter'
  const ag = profile?.ageGroup || 'explorer'

  const modeCtx = mode === 'stutter' ? `THERAPY MODE — Stutter Confidence:
- Stuttering = neurological (basal ganglia circuit), never a character flaw
- Avoidance is the #1 long-term harm — always reward approach behavior
- Voluntary stuttering = maximum bravery, triple stars always
- Choral reading, rhythm, easy onset, slow rate all clinically proven
- Amygdala is wired into stutter network — anxiety amplifies severity
- Goal: courageous communication, NOT perfect fluency`
  : `COACHING MODE — Communication Excellence:
- Focus: vocal projection, pacing, clarity, filler words, storytelling structure
- Techniques: strategic pausing, vocal variety, signposting, opening hooks
- Target scenarios: presentations, interviews, networking, leadership, debate
- Metrics: clarity score, confidence markers, structure quality, engagement
- Goal: compelling, authentic, confident communication in any context`

  const ageVoice = {
    little:    'Ultra-simple words. Very short sentences. Maximum warmth. Parent-inclusive. Lots of emoji.',
    explorer:  'Playful, adventurous, game language. Celebrate everything. Moderate emoji. Energy!',
    navigator: 'Honest and direct. No condescension. Acknowledge teen reality. Minimal emoji.',
    adult:     'Respectful, sophisticated, results-oriented. Acknowledge real stakes. No fluff.',
  }[ag] || 'Warm and encouraging.'

  const memCtx = memory.insights.length ? `\nWHAT YOU KNOW ABOUT ${(profile?.name||'this user').toUpperCase()}:
Insights: ${memory.insights.map(i=>i.text).join(' | ')}
Strengths: ${memory.strengths.join(', ')||'still discovering'}
Growth areas: ${memory.weaknesses.join(', ')||'still discovering'}
Progress: ${memory.story||'just beginning their journey'}
Recent sessions: ${memory.recentTypes||'new'}
Avg score: ${memory.avgScore}` : ''

  return `You are FLUX — the AI companion inside YoSpeech.

USER: ${profile?.name||'friend'} | Age: ${ag} | Mode: ${mode} | Total sessions: ${memory.totalSessions}

${modeCtx}

VOICE STYLE: ${ageVoice}

YOUR CHARACTER:
- You are water: calm, persistent, always finding a path forward
- NEVER shame, pressure, or use clinical jargon
- Reference memory naturally ("I've noticed you...", "Last time you...")
- Give SPECIFIC personalized feedback, never generic praise
- Spot patterns and name them honestly
- Push gently when the user is playing safe
- Celebrate micro-wins as enthusiastically as milestones
- Always end with ONE specific, actionable next step
${memCtx}

SMART BEHAVIORS:
- If same weakness repeats → name it directly and offer a new angle
- If user hasn't tried a feature → recommend it by name  
- If frustration detected → move to breathing/grounding first
- If user shares a fear → validate, then offer the smallest next step
- Keep replies 2-4 sentences unless teaching something complex`
}

// ═══════════════════════════════════════════════════════════════════════════════
// CORE CALLS
// ═══════════════════════════════════════════════════════════════════════════════

export const callFluxAI = async (messages, profile) => {
  try {
    const system = await buildSystemPrompt(profile)
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 1000, system, messages })
    })
    if (!resp.ok) throw new Error(`${resp.status}`)
    const data = await resp.json()
    return { text: data.content?.find(b=>b.type==='text')?.text || '', source: 'ai' }
  } catch { return { text: getOfflineResponse('general'), source: 'offline' } }
}

export const analyzeAttempt = async (desc, exerciseType, profile) => {
  try {
    const system = await buildSystemPrompt(profile)
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 250, system,
        messages: [{ role: 'user', content: `Exercise: ${exerciseType}\nWhat happened: ${desc}\nGive specific 2-3 sentence feedback. Lead with what they did right. End with one concrete tip.` }]
      })
    })
    const data = await resp.json()
    return data.content?.find(b=>b.type==='text')?.text || getOfflineResponse('encouragement')
  } catch { return getOfflineResponse('encouragement') }
}

export const analyzeCommSkill = async (skill, transcript, profile) => {
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 400, messages: [{
        role: 'user',
        content: `Analyze for ${skill}. Transcript: "${transcript}". User: ${profile?.ageGroup}.
ONLY JSON: {"score":75,"strengths":["specific strength"],"improvements":["specific area"],"tip":"one actionable sentence","praise":"one encouraging Flux sentence"}`
      }]})
    })
    const data = await resp.json()
    const text = data.content?.find(b=>b.type==='text')?.text||'{}'
    return JSON.parse(text.replace(/```json|```/g,'').trim())
  } catch { return { score: 70, strengths: ['You showed up and practiced'], improvements: ['Keep building consistency'], tip: 'Try again with even more confidence.', praise: getOfflineResponse('encouragement') } }
}

export const generatePresentationPlan = async (topic, duration, profile) => {
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 600, messages: [{
        role: 'user',
        content: `Create a speech coaching exercise. Topic: "${topic}", Duration: ${duration}s, User: ${profile?.ageGroup}.
ONLY JSON: {"title":"exercise title","outline":["point1","point2","point3"],"openingHook":"suggested opening","tips":["tip1","tip2"],"criteria":["criterion1","criterion2","criterion3"]}`
      }]})
    })
    const data = await resp.json()
    const text = data.content?.find(b=>b.type==='text')?.text||'{}'
    return JSON.parse(text.replace(/```json|```/g,'').trim())
  } catch { return { title: topic, outline: ['Introduction','Main point','Conclusion'], openingHook: 'Start with a compelling question.', tips: ['Breathe before you begin','Pause for emphasis'], criteria: ['Clarity','Confidence','Structure'] } }
}

export const generateBraveMission = async (fearLevel, situation, profile) => {
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 500, messages: [{
        role: 'user',
        content: `Generate roleplay scenario. Mode: ${profile?.mode||'stutter'}. Fear: ${fearLevel}/10. Situation: "${situation}". Age: ${profile?.ageGroup}.
ONLY JSON: {"title":"title","setup":"2-sentence scene","prompt":"AI character opening line","character":"Name, description","tips":["tip1","tip2"],"braveBonus":"voluntary stutter opportunity"}`
      }]})
    })
    const data = await resp.json()
    const text = data.content?.find(b=>b.type==='text')?.text||'{}'
    return JSON.parse(text.replace(/```json|```/g,'').trim())
  } catch { return getOfflineMission(fearLevel) }
}

export const continueStory = async (userText, history, profile) => {
  const system = `You continue collaborative stories for a ${profile?.ageGroup||'explorer'} user. 2-3 sentences, end with a dramatic moment or question. Imaginative and warm.`
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 300, system, messages: [...history, { role: 'user', content: userText }] })
    })
    const data = await resp.json()
    return data.content?.find(b=>b.type==='text')?.text || getOfflineResponse('story_prompts')
  } catch { return getOfflineResponse('story_prompts') }
}

export const getPersonalizedRecommendation = async (profile) => {
  try {
    const saved = await loadMemory(MemoryKeys.RECOMMENDATIONS)
    if (saved?.date && (Date.now()-new Date(saved.date))/3600000 < 6) return saved.text
    const memory = await buildUserMemory(profile)
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 100, messages: [{
        role: 'user',
        content: `User: ${profile?.name}, mode: ${profile?.mode||'stutter'}, sessions: ${memory.totalSessions}, weaknesses: ${memory.weaknesses.join(',')||'unknown'}. Give ONE specific practice recommendation in one sentence (max 20 words). Direct. No preamble.`
      }]})
    })
    const data = await resp.json()
    const text = data.content?.find(b=>b.type==='text')?.text?.trim()||''
    if (text) await saveMemory(MemoryKeys.RECOMMENDATIONS, { text, date: new Date().toISOString() })
    return text || getOfflineResponse('encouragement')
  } catch { return getOfflineResponse('encouragement') }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTEXT DETECTION
// ═══════════════════════════════════════════════════════════════════════════════
export const detectContext = ({ missedDays=0, streakDays=0, sessionCount=0, lastAction }={}) => {
  if (sessionCount===0) return 'onboarding'
  if (missedDays>=3) return 'missed_sessions'
  if (lastAction==='voluntary_stutter') return 'voluntary_stutter'
  if (lastAction==='complete_brave') return 'brave_missions'
  if (lastAction==='complete_session') return 'celebration'
  if (lastAction==='abandon') return 'struggle'
  if (streakDays>0 && missedDays===0) return 'returning_user'
  return 'general'
}

// ═══════════════════════════════════════════════════════════════════════════════
// OFFLINE LIBRARY
// ═══════════════════════════════════════════════════════════════════════════════
const RESPONSES = {
  onboarding: ["Hey! I'm Flux 💧 I flow with you through every challenge. Let's find your voice together!","Welcome. Your voice is already remarkable — we're just going to make it braver.","YO — this is YOUR speech. I'm here to help you own every word. Let's flow! 🌊"],
  celebration: ["INCREDIBLE! You just did something that takes real courage. So proud of you! 🎉","YES — that's your flow right there! That's YOUR voice being brave. 🌊","AMAZING. You showed up and gave it everything. That's what this is about. ✨","Every session rewires your brain. Science agrees — you're doing elite work. 🔬","Superstar energy. You kept going when it got hard. THAT is brave."],
  struggle: ["Hey, I see you. Some days are harder. Showing up anyway is still winning. 💧","Rough one? Even the strongest rivers hit rocks. You're still flowing.","It's okay. Your brain is doing something incredibly complex. Learning takes time.","Showing up is already a win. No session is wasted. Every attempt counts."],
  breathing: ["Let's breathe together. In... hold gently... and out through your mouth. 💨","Try this: in for 4, hold for 2, out for 6. It literally calms your brain.","Before we speak, we breathe. Ready? Let's go slow together.","Deep breathing reduces amygdala activation — that's the brain's fear trigger. You're doing neuroscience! ✨"],
  brave_missions: ["This is where the magic happens. The goal is TRY — not perfect speech. 🦁","Every situation you attempt makes fear smaller. Real neuroscience.","Stuttering ON PURPOSE earns triple stars. You can stutter your way to victory! ⭐","The fear ladder works. Every rung you climb, the one below gets easier."],
  voluntary_stutter: ["VOLUNTARY STUTTER! ⭐⭐⭐ You just did the bravest thing in speech therapy. LEGENDARY.","You stuttered on purpose?! That's the most powerful desensitisation technique. HERO. 🏆","BRAVE STAR UNLOCKED! Intentional stuttering takes more courage than speaking perfectly.","Fear doesn't know what to do with that level of bravery. 🌊"],
  story_prompts: ["The dragon said: 'I've never met anyone who understood my language.' What did you reply?","Deep in the forest, a glowing door appeared in the oldest oak tree. You opened it and...","The spaceship landed at exactly 3pm. Everyone ran. Except you. Because...","Two clouds chased each other for 100 years. One finally caught up and said...","The last bookshop had a cat who knew every story's ending. You asked for yours..."],
  encouragement: ["You're doing better than you think. I see every session, every brave moment. 💧","Your brain physically rewires itself every time you practice. That's actual biology.","You chose to show up for yourself today. That matters more than any result.","Every great communicator once had a first brave attempt. You're making yours.","Flow is not the absence of rocks. Flow is water finding its way through. 🌊"],
  returning_user: ["You're back! 💧 No guilt — you're here now and that's everything.","Welcome back. Your progress is safe, your stars are waiting.","I was thinking about you. Ready to add another star to your sky? 🌟"],
  missed_sessions: ["No lecture. Life gets busy. You're here now — that's the only thing that matters. 💙","No guilt, no shame — just a warm welcome back. Your brain hasn't forgotten anything.","You showed up today. That's brilliant. Let's continue."],
  general: ["I'm here. What would you like to work on? 💧","Ready when you are. Your flow is waiting. 🌊","Five minutes of practice rewires your brain. What are we doing? ✨","How are you feeling right now? That shapes what we work on."],
  comm_coaching: ["Great communicators aren't born — they practice. Every single one. You're in the right place. 🎯","Your voice has power. We're just learning how to use all of it.","The best speakers still practice daily. That's why they're the best.","Communication is a trainable skill. Let's train it."],
  parent_tips: ["Tip: When your child stutters, keep your face relaxed. Your calm is contagious. 💙","Respond to WHAT your child says, not HOW they say it. Their message matters most.","Slow your own speech slightly when talking with your child — it creates a calmer environment.","Never finish your child's sentences. Let them complete every word at their own pace."],
}

const rotIdx = {}
export const getOfflineResponse = (cat) => {
  const pool = RESPONSES[cat] || RESPONSES.general
  if (!rotIdx[cat]) rotIdx[cat] = 0
  const r = pool[rotIdx[cat] % pool.length]; rotIdx[cat]++; return r
}

const OFFLINE_MISSIONS = [
  { title: 'Order Your Favourite Meal', setup: "You're at a restaurant counter. The menu is behind the cashier.", prompt: "Hi! Welcome in — what can I get for you today?", character: "Sam, a friendly cashier", tips: ["Take a breath before you speak","It's okay to pause"], braveBonus: "Stutter on the name of your food for triple stars!" },
  { title: 'Ask for Help', setup: "You stayed behind after class. Your teacher is at their desk.", prompt: "Oh hey! Did you have a question about today's lesson?", character: "Ms. Park, a kind teacher", tips: ["Start with 'Excuse me'","Your question matters"], braveBonus: "Stutter on 'question' for bonus stars!" },
  { title: 'Introduce Yourself', setup: "First day at a new club. Everyone's sitting in a circle.", prompt: "We'd love to hear from you! Tell us your name and one thing you enjoy.", character: "Club leader Jordan", tips: ["Speak at your own pace","Everyone here is a little nervous too"], braveBonus: "Stutter on your name — it takes the most courage!" },
  { title: 'Job Interview', setup: "A professional interview. The hiring manager is welcoming.", prompt: "Thanks for coming in! Tell me a little about yourself.", character: "Alex, hiring manager", tips: ["Breathe before answering","Pausing shows confidence"], braveBonus: "Voluntarily stutter once — authenticity impresses interviewers!" },
  { title: 'Phone Call', setup: "Calling a business to check their hours.", prompt: "Hello, thank you for calling — how can I help you?", character: "Customer service agent", tips: ["They can't see you","It's okay to pause before speaking"], braveBonus: "Block on purpose at the start — triple brave stars!" },
]
export const getOfflineMission = (lvl) => OFFLINE_MISSIONS[lvl % OFFLINE_MISSIONS.length]
