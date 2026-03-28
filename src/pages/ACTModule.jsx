import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { saveActSession, getActProgress, addSession, markTodayStreak } from '../utils/db'
import { useApp } from '../hooks/useAppContext'
import { haptics } from '../utils/haptics'
import useFluxVoice from '../hooks/useFluxVoice'
import { callFluxAI, getOfflineResponse } from '../ai/fluxEngine'
import Flux from '../components/flux/Flux'
import CelebrationScreen from '../components/ui/CelebrationScreen'

// ─── 8 ACT SESSIONS ───────────────────────────────────────────────────────────
const ACT_SESSIONS = [
  {
    num: 1,
    title: 'What Am I Fighting?',
    principle: 'Awareness',
    color: '#22d3ee',
    icon: '🌊',
    duration: '8–10 min',
    intro: "Before we can change anything, we need to see it clearly. Today we map what's actually going on — not what others see, but what you carry inside.",
    sections: [
      {
        type: 'reflect',
        title: 'The Iceberg',
        content: "Think about the last time stuttering stopped you from doing or saying something. What did you want to say? What did you do instead? Take a moment to sit with that memory.",
        prompt: "Speak freely for 60 seconds: what's the one thing stuttering has cost you most?",
      },
      {
        type: 'teach',
        title: 'What Flux wants you to know',
        content: "Stuttering is a neurological difference — not a failure of willpower, not a personality flaw, not something you caused. The research is clear. But the harder truth is this: the avoidance — the word-swapping, the silence, the held breath — that's learned. And what is learned can be unlearned.",
      },
      {
        type: 'exercise',
        title: 'Name It to Tame It',
        content: "On a scale of 1–10, rate these areas of your life where stuttering has the most impact: Social situations · Work or school · Relationships · Your self-image · Career goals.",
        prompt: "Speak for 30 seconds: Which area hurts the most, and why?",
      },
    ],
    closing: "You just did something most people never do — you looked at the iceberg. All of it. That takes real courage. See you for Session 2.",
  },
  {
    num: 2,
    title: 'The Thought Train',
    principle: 'Cognitive Defusion',
    color: '#a78bfa',
    icon: '🚂',
    duration: '8–10 min',
    intro: "Your thoughts are passengers, not the driver. Today we learn to watch them pass without getting on board.",
    sections: [
      {
        type: 'teach',
        title: 'What is Defusion?',
        content: "When your brain says 'I'm going to stutter' before a phone call, you have two choices: fuse with that thought — treat it as truth, as your identity, and act accordingly — or defuse from it. Watch it like a train passing. 'There's that thought again.' The thought doesn't go away. But you stop being it.",
      },
      {
        type: 'exercise',
        title: 'The Train Station',
        content: "Close your eyes. Imagine you are sitting at a train station. Thoughts about stuttering arrive as trains — some loud, some fast, some slow. You don't have to board any of them. Just watch.",
        prompt: "After 30 seconds of the exercise: name three thoughts that arrived. Then say: 'I notice I'm having the thought that...' for each one.",
      },
      {
        type: 'exercise',
        title: 'Silly Voice Defusion',
        content: "Take your most feared self-criticism about your speech — something you regularly think about yourself. Now say it out loud in the most ridiculous voice you can imagine.",
        prompt: "Say your most critical self-thought in a funny voice. Then say it normally. Notice what changed.",
      },
    ],
    closing: "Your thoughts about stuttering are not facts. They are weather. You learned to check the weather today. Session 3 waits.",
  },
  {
    num: 3,
    title: 'Here, Now',
    principle: 'Mindfulness',
    color: '#34d399',
    icon: '🌱',
    duration: '8–10 min',
    intro: "Anxiety about speech lives in the future. Shame lives in the past. The only place you can actually speak is right now.",
    sections: [
      {
        type: 'breathe',
        title: 'Anchor Breathing',
        content: "This is your pre-speech anchor. Before any challenging conversation, you will use this. In for 4 counts through the nose. Hold for 2. Out for 6 through the mouth. The out-breath is the most important — it activates the parasympathetic system, turns down the amygdala, relaxes the vocal muscles.",
        prompt: "Do 5 anchor breaths. Then speak one sentence about what you notice in your body right now.",
      },
      {
        type: 'exercise',
        title: 'The 5-4-3-2-1 Grounding',
        content: "When your mind spirals before speaking: name 5 things you can see · 4 things you can touch · 3 things you can hear · 2 things you can smell · 1 thing you can taste. This grounds you in the present moment and interrupts the anxiety spiral.",
        prompt: "Do the full 5-4-3-2-1 exercise out loud right now.",
      },
      {
        type: 'reflect',
        title: 'Mindful Speaking',
        content: "For the next minute, speak about anything — your day, a memory, what you ate. But every time you notice the urge to avoid a word or substitute something, pause, breathe, and say the original word anyway. Slowly.",
        prompt: "Speak for 60 seconds mindfully. Notice without judging.",
      },
    ],
    closing: "You spoke from the present moment. That's the practice. Session 4 is about who you actually are.",
  },
  {
    num: 4,
    title: 'Who I Am',
    principle: 'Self-as-Context',
    color: '#fbbf24',
    icon: '🪞',
    duration: '10 min',
    intro: "You are not your stutter. You are not your fluency either. You are the one who notices both.",
    sections: [
      {
        type: 'teach',
        title: 'The Observer Self',
        content: "ACT calls this 'self-as-context' — there is a part of you that has always been the observer. The child who stuttered in class. The teen who avoided the phone. The adult reading this now. That observer has been constant through all of it. That is you. Not the stuttering. Not the avoidance. The one watching.",
      },
      {
        type: 'reflect',
        title: 'Beyond the Label',
        content: "Write or speak a description of yourself that doesn't include anything about your speech. Who are you? What do you love? What are you proud of? What have you built or survived or created?",
        prompt: "Speak for 60 seconds: Who am I beyond my speech?",
      },
      {
        type: 'exercise',
        title: 'The Compassionate Mirror',
        content: "Imagine your best friend has exactly your speech pattern. They stutter in the same situations. They avoid the same words. Now tell them — honestly — what you think of them. What they deserve. How you see their courage.",
        prompt: "Now say those exact same words to yourself. Out loud.",
      },
    ],
    closing: "You are bigger than your stutter. That sentence is now yours. Session 5 is about what actually matters.",
  },
  {
    num: 5,
    title: 'What Matters',
    principle: 'Values',
    color: '#fb7185',
    icon: '🧭',
    duration: '10 min',
    intro: "Fear drives avoidance. Values drive courage. Today we find what's worth speaking for.",
    sections: [
      {
        type: 'reflect',
        title: 'The Funeral Exercise',
        content: "Imagine it's 40 years from now. Someone who loves you is speaking about the kind of person you were. What do you most want them to say? Not about your fluency. About who you were. What you contributed. How you made people feel.",
        prompt: "Speak for 90 seconds: What do you most want to be remembered for?",
      },
      {
        type: 'exercise',
        title: 'Values Clarification',
        content: "Rate these values by importance to YOU (not what sounds right): Connection · Honesty · Achievement · Adventure · Service · Family · Creativity · Leadership · Learning · Humor. Your top three are your compass.",
        prompt: "Name your top 3 values and speak for 30 seconds about why each one matters.",
      },
      {
        type: 'reflect',
        title: 'Where Speech Blocks Values',
        content: "For each of your top values: think of one time stuttering stopped you from living it. One specific moment.",
        prompt: "Describe one moment where fear of stuttering cost you something that mattered.",
      },
    ],
    closing: "Now you know what you're speaking FOR. That changes everything. Session 6 is the turning point.",
  },
  {
    num: 6,
    title: 'The Brave Commitment',
    principle: 'Committed Action',
    color: '#f97316',
    icon: '🦁',
    duration: '10 min',
    intro: "Values without action are just dreams. Today you make a commitment — small, specific, and terrifying.",
    sections: [
      {
        type: 'teach',
        title: 'What Committed Action Is NOT',
        content: "It's not 'I will become a fluent speaker.' That's a fluency goal — and research shows that fluency goals paradoxically increase stuttering. A committed action is: 'This week, I will call the pharmacy instead of texting them — because connection matters to me, not because I expect to be fluent.'",
      },
      {
        type: 'exercise',
        title: 'Design Your Committed Action',
        content: "Choose one speaking situation you have been avoiding — specifically because of stuttering. Make it real. Make it this week. Connect it to one of your values.",
        prompt: "State your committed action out loud: 'This week I will [specific action] because [value] matters to me.'",
      },
      {
        type: 'reflect',
        title: 'Anticipatory Anxiety',
        content: "You will probably feel anxious between now and the committed action. That anxiety is not a stop sign — it is a compass. It points toward what matters.",
        prompt: "Speak for 45 seconds about how you'll handle the anxiety when it comes.",
      },
    ],
    closing: "You made a promise to yourself. Come back after you keep it. Session 7 is the most powerful one.",
  },
  {
    num: 7,
    title: 'Welcome the Stutter',
    principle: 'Acceptance',
    color: '#22d3ee',
    icon: '🌊',
    duration: '12 min',
    intro: "This is the session most people are afraid of. It is also the one that changes everything.",
    sections: [
      {
        type: 'teach',
        title: 'The Paradox of Acceptance',
        content: "Every therapy that tells you to 'fight' your stutter makes it worse. The tension of fighting is itself a trigger. Acceptance is not giving up. It is removing the second problem — the shame, the struggle, the hiding — while the first problem (the neurology) is what it is. When you stop fighting the river, you can finally float.",
      },
      {
        type: 'exercise',
        title: 'Voluntary Stuttering — The Master Exercise',
        content: "This is the most clinically powerful exercise in speech therapy. You are going to stutter on purpose. Choose a word. Repeat its first sound three times before completing it. Not rushing through — deliberately, with full awareness. This breaks the fear-avoidance cycle at its root.",
        prompt: "Say 5 sentences and voluntarily stutter on one word in each. Slowly. Deliberately. Bravely.",
      },
      {
        type: 'reflect',
        title: 'After the Voluntary Stutter',
        content: "What happened? Did the world end? Did you disappear? Did people run? Or did speech simply continue — imperfect, real, and yours?",
        prompt: "Speak for 60 seconds about what that exercise felt like.",
      },
    ],
    closing: "You welcomed the thing you feared most. That is the definition of courage. One session remains.",
  },
  {
    num: 8,
    title: 'Your New Story',
    principle: 'Narrative Identity',
    color: '#a78bfa',
    icon: '📖',
    duration: '12 min',
    intro: "You started this program as one person. You finish it as another. Today we name who that person is.",
    sections: [
      {
        type: 'reflect',
        title: 'The Journey',
        content: "Look back at Session 1 — at the person who was fighting the iceberg. What did they believe about themselves? What were they afraid of? How has that changed?",
        prompt: "Speak for 90 seconds: What is different about you now compared to when you started?",
      },
      {
        type: 'exercise',
        title: 'Write Your New Story',
        content: "In one paragraph — spoken or written — tell the story of a person who stutters but is no longer defined by it. Make it true. Make it yours.",
        prompt: "Speak your new story. Take as long as you need.",
      },
      {
        type: 'reflect',
        title: 'The Letter Forward',
        content: "Speak a message to yourself six months from now. Tell them what you learned. What you committed to. What you want them to remember on a hard day.",
        prompt: "Record your message to your future self.",
      },
    ],
    closing: "You finished. Eight sessions. Eight acts of courage. The work isn't done — it never is — but you now have the tools, the language, and the evidence of your own bravery. This is your foundation. Build on it. 💧",
  },
]

// ─── SESSION CARD ──────────────────────────────────────────────────────────────
function SessionCard({ session, completed, locked, onStart }) {
  return (
    <button
      onClick={!locked ? onStart : undefined}
      disabled={locked}
      className="w-full p-5 rounded-3xl border text-left transition-all active:scale-[0.98] animate-slide-up"
      style={{
        background: completed ? `${session.color}0d` : locked ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)',
        borderColor: completed ? `${session.color}35` : locked ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.09)',
        opacity: locked ? 0.45 : 1,
      }}>
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl flex-shrink-0"
          style={{ background: `${session.color}15`, border: `1px solid ${session.color}25` }}>
          {completed ? '✓' : locked ? '🔒' : session.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[10px] font-display font-semibold uppercase tracking-wider" style={{ color: session.color }}>{session.principle}</span>
            <span className="text-white/25 text-[10px]">· Session {session.num}</span>
          </div>
          <p className="font-display font-bold text-white leading-tight">{session.title}</p>
          <p className="text-white/40 text-xs mt-1 line-clamp-2">{session.intro}</p>
          <div className="flex items-center gap-2 mt-2">
            <span className="pill text-[10px]" style={{ background:`${session.color}10`, borderColor:`${session.color}25`, color: session.color }}>{session.duration}</span>
            {completed && <span className="pill-jade text-[10px]">✓ Complete</span>}
          </div>
        </div>
        {!locked && !completed && <div className="text-white/25 flex-shrink-0 mt-1">→</div>}
      </div>
    </button>
  )
}

// ─── ACTIVE SESSION ────────────────────────────────────────────────────────────
function ActiveSession({ session, onComplete, profile }) {
  const [sectionIdx, setSectionIdx] = useState(0)
  const [recording, setRecording]   = useState(false)
  const [transcript, setTranscript] = useState('')
  const [reflections, setReflections] = useState([])
  const [done, setDone]             = useState(false)
  const [aiResponse, setAiResponse] = useState('')
  const [loadingAI, setLoadingAI]   = useState(false)
  const recRef = useRef(null)
  const { fluxSay, fluxSpeaking, fluxStop } = useFluxVoice()

  const section = session.sections[sectionIdx]
  const isLast  = sectionIdx === session.sections.length - 1

  useEffect(() => {
    fluxSay(section.content, true)
    return () => fluxStop()
  }, [sectionIdx])

  const startRec = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { setRecording(true); return }
    recRef.current = new SR()
    recRef.current.continuous = true
    recRef.current.interimResults = false
    recRef.current.onresult = e => setTranscript(Array.from(e.results).map(r=>r[0].transcript).join(' '))
    recRef.current.start()
    setRecording(true)
  }

  const stopRec = () => {
    recRef.current?.stop()
    setRecording(false)
  }

  const handleNext = async () => {
    setReflections(r => [...r, { section: section.title, text: transcript }])
    setTranscript('')
    fluxStop()

    if (!isLast) {
      setSectionIdx(i => i + 1)
    } else {
      // Session complete — get AI response
      setDone(true)
      setLoadingAI(true)
      try {
        const prompt = `The user just completed ACT Session ${session.num}: "${session.title}" (principle: ${session.principle}).
Their reflections: ${reflections.map(r => `${r.section}: "${r.text}"`).join(' | ')}
Last response: "${transcript}"

Give a warm, specific 2-3 sentence closing reflection as Flux. Reference what they actually shared if possible. End with encouragement for the next session. Age: ${profile?.ageGroup}.`
        const result = await callFluxAI([{ role: 'user', content: prompt }], profile)
        setAiResponse(result.text || session.closing)
        fluxSay(result.text || session.closing, true)
      } catch {
        setAiResponse(session.closing)
        fluxSay(session.closing, true)
      }
      setLoadingAI(false)

      // Save
      const allReflections = [...reflections, { section: section.title, text: transcript }]
      await saveActSession(session.num, JSON.stringify(allReflections))
      await addSession('act', 40, { sessionNum: session.num })
      await markTodayStreak()
    }
  }

  const sectionColors = { reflect: 'var(--violet)', teach: 'var(--aqua)', exercise: 'var(--amber)', breathe: 'var(--jade)' }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-6 px-5 py-8 text-center">
        <div className="animate-flux-float">
          <Flux size={100} ageGroup={profile?.ageGroup||'explorer'} mood="excited" speaking={fluxSpeaking}/>
        </div>
        <div>
          <div className="text-4xl mb-3">{session.icon}</div>
          <h2 className="font-display text-2xl font-bold text-white mb-2">Session {session.num} Complete</h2>
          <span className="pill font-display" style={{ background:`${session.color}12`, borderColor:`${session.color}30`, color:session.color }}>{session.principle}</span>
        </div>
        <div className="card w-full text-left" style={{ borderColor: `${session.color}25` }}>
          <div className="flex gap-3 items-start">
            <Flux size={36} ageGroup={profile?.ageGroup||'explorer'} mood="happy"/>
            <div>
              <p className="section-label mb-1.5">Flux says</p>
              {loadingAI
                ? <div className="flex gap-1">{[0,1,2].map(i=><div key={i} className="w-2 h-2 rounded-full bg-white/20 animate-bounce" style={{animationDelay:`${i*0.15}s`}}/>)}</div>
                : <p className="text-white/75 text-sm leading-relaxed">{aiResponse}</p>
              }
            </div>
          </div>
        </div>
        <button onClick={onComplete}
          className="btn-aqua w-full py-4 font-display" style={{ color:'#05080f' }}>
          {session.num < 8 ? `Continue to Session ${session.num + 1} →` : '🎉 Programme Complete!'}
        </button>
      </div>
    )
  }

  return (
    <div className="px-5 flex flex-col gap-4">
      {/* Progress bar */}
      <div className="flex gap-1.5">
        {session.sections.map((_,i) => (
          <div key={i} className="h-1 flex-1 rounded-full transition-all duration-300"
            style={{ background: i < sectionIdx ? session.color : i === sectionIdx ? `${session.color}70` : 'rgba(255,255,255,0.1)' }}/>
        ))}
      </div>

      {/* Section label */}
      <div className="flex items-center gap-2">
        <span className="pill text-[10px] font-display"
          style={{ background: `${sectionColors[section.type]}12`, borderColor: `${sectionColors[section.type]}30`, color: sectionColors[section.type] }}>
          {section.type.toUpperCase()}
        </span>
        <span className="text-white/35 text-xs">{sectionIdx + 1}/{session.sections.length}</span>
      </div>

      {/* Section content */}
      <div className="card" style={{ borderColor: `${sectionColors[section.type]}20` }}>
        <p className="font-display font-bold text-white mb-2">{section.title}</p>
        <p className="text-white/70 text-sm leading-relaxed">{section.content}</p>
        {section.type !== 'teach' && (
          <button onClick={() => fluxSay(section.content, true)}
            className="mt-3 flex items-center gap-1.5 text-xs text-white/30 hover:text-white/55 transition-colors">
            🔊 Read aloud
          </button>
        )}
      </div>

      {/* Prompt if applicable */}
      {section.prompt && (
        <div className="card" style={{ background: `${session.color}08`, borderColor: `${session.color}25` }}>
          <p className="section-label mb-1.5">Your turn</p>
          <p className="text-white/80 text-sm leading-relaxed italic">"{section.prompt}"</p>
        </div>
      )}

      {/* Recording */}
      {section.prompt && (
        <>
          {transcript && (
            <div className="glass-2 rounded-2xl px-4 py-3 max-h-28 overflow-y-auto">
              <p className="text-white/50 text-xs leading-relaxed">{transcript}</p>
            </div>
          )}
          <button
            onPointerDown={startRec} onPointerUp={stopRec} onPointerLeave={stopRec}
            className="w-full py-4 rounded-2xl font-display font-bold text-base transition-all active:scale-95"
            style={recording
              ? { background:'rgba(239,68,68,0.8)', color:'white', boxShadow:'0 4px 20px rgba(239,68,68,0.3)' }
              : { background:'rgba(255,255,255,0.06)', color:'rgba(255,255,255,0.65)', border:'1px solid rgba(255,255,255,0.1)' }}>
            {recording ? '⏺ Recording… (release when done)' : '🎙️ Hold to Speak'}
          </button>
        </>
      )}

      <button onClick={handleNext}
        className="btn-aqua w-full py-4 font-display" style={{ color: '#05080f' }}>
        {isLast ? 'Complete Session ✓' : 'Next →'}
      </button>
      {showCelebration && (
        <CelebrationScreen
          sessionType="act"
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

// ─── MAIN PAGE ─────────────────────────────────────────────────────────────────
export default function ACTModule() {
  const [completed, setCompleted] = useState([])
  const [activeSession, setActiveSession] = useState(null)
  const [showCelebration, setShowCelebration] = useState(false)
  const [celebScore, setCelebScore] = useState(0)
  const navigate = useNavigate()
  const { profile } = useApp()

  useEffect(() => {
    getActProgress().then(rows => setCompleted(rows.map(r => r.sessionNum)))
  }, [])

  const handleComplete = () => {
    setCompleted(c => [...c, activeSession.num])
    setActiveSession(null)
  }

  const completedCount = completed.length
  const totalPct = Math.round((completedCount / 8) * 100)

  return (
    <div className="min-h-full pb-28 page-enter" style={{ zIndex: 1 }}>
      <div className="flex items-center gap-3 px-5 pt-8 pb-4">
        <button onClick={() => { setActiveSession(null); if (!activeSession) navigate(-1) }}
          className="w-9 h-9 rounded-full glass flex items-center justify-center text-white text-lg">←</button>
        <div>
          <h1 className="font-display text-xl font-bold text-white">ACT Programme</h1>
          <p className="text-white/35 text-xs">Acceptance & Commitment Therapy · 8 sessions</p>
        </div>
        <span className="ml-auto text-2xl">🧘</span>
      </div>

      {!activeSession ? (
        <div className="px-5 flex flex-col gap-5">
          {/* Overall progress */}
          <div className="card-lg" style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.08), rgba(167,139,250,0.06))' }}>
            <div className="flex items-center gap-4 mb-3">
              <Flux size={52} ageGroup={profile?.ageGroup||'explorer'} mood="happy"/>
              <div className="flex-1">
                <p className="font-display font-bold text-white">Programme Progress</p>
                <p className="text-white/40 text-xs">{completedCount}/8 sessions · {totalPct}% complete</p>
              </div>
              <div className="font-display font-bold text-2xl text-aqua" style={{ color:'var(--aqua)' }}>{totalPct}%</div>
            </div>
            <div className="prog-track">
              <div className="prog-fill" style={{ width:`${totalPct}%`, background:'linear-gradient(90deg, var(--aqua), var(--violet))' }}/>
            </div>
          </div>

          {completedCount === 0 && (
            <div className="card" style={{ borderColor:'rgba(34,211,238,0.15)' }}>
              <p className="section-label mb-2">About this programme</p>
              <p className="text-white/65 text-sm leading-relaxed">
                ACT (Acceptance & Commitment Therapy) is one of the most evidence-backed psychological approaches for stuttering. Unlike fluency techniques that target speech itself, ACT targets the fear, avoidance, and shame that make stuttering so limiting. Research shows ACT improvements hold at 6+ months.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2.5">
            {ACT_SESSIONS.map((session, i) => {
              const isCompleted = completed.includes(session.num)
              const isLocked = !isCompleted && i > 0 && !completed.includes(session.num - 1) && session.num > 1
              return (
                <SessionCard
                  key={session.num}
                  session={session}
                  completed={isCompleted}
                  locked={isLocked}
                  onStart={() => setActiveSession(session)}
                  style={{ animationDelay: `${i * 0.05}s` }}
                />
              )
            })}
          </div>
        </div>
      ) : (
        <div>
          {/* Active session header */}
          <div className="px-5 mb-4">
            <div className="flex items-center gap-3 p-4 rounded-2xl"
              style={{ background:`${activeSession.color}10`, border:`1px solid ${activeSession.color}25` }}>
              <span className="text-2xl">{activeSession.icon}</span>
              <div>
                <p className="text-[10px] font-display font-semibold uppercase tracking-wider" style={{ color: activeSession.color }}>
                  Session {activeSession.num} · {activeSession.principle}
                </p>
                <p className="font-display font-bold text-white">{activeSession.title}</p>
              </div>
            </div>
          </div>
          <ActiveSession session={activeSession} onComplete={handleComplete} profile={profile}/>
        </div>
      )}
    </div>
  )
}
