import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useApp } from './hooks/useAppContext'
import { getSetting } from './utils/db'

import BottomNav    from './components/shared/BottomNav'
import Notification from './components/shared/Notification'
import Flux         from './components/flux/Flux'
import DailyCheckIn, { useCheckIn } from './components/ui/DailyCheckIn'
import { FloatingReader } from './components/ui/ReadAloud'

// Pages
import Splash         from './pages/Splash'
import Auth           from './pages/Auth'
import Onboarding     from './pages/Onboarding'
import Home           from './pages/Home'
import Adventure      from './pages/Adventure'
import Breathe        from './pages/Breathe'
import SpeakLab       from './pages/SpeakLab'
import BraveMissions  from './pages/BraveMissions'
import TalkTales      from './pages/TalkTales'
import Journal        from './pages/Journal'
import FamilyMode     from './pages/FamilyMode'
import Progress       from './pages/Progress'
import Settings       from './pages/Settings'
import FluxChat       from './pages/FluxChat'
import CommAcademy    from './pages/CommAcademy'
// V5 new pages
import SpeechAnalysis from './pages/SpeechAnalysis'
import ACTModule      from './pages/ACTModule'
import DAFMode        from './pages/DAFMode'
import BraveWall      from './pages/BraveWall'
import WeeklyReport   from './pages/WeeklyReport'

function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-5" style={{ background:'var(--ink)' }}>
      <div className="animate-flux-float">
        <Flux size={90} ageGroup="explorer" mood="happy"/>
      </div>
      <div className="flex flex-col items-center gap-2">
        <div className="w-8 h-8 rounded-full border-2 animate-spin"
          style={{ borderColor:'rgba(34,211,238,0.2)', borderTopColor:'var(--aqua)' }}/>
        <p className="text-white/30 text-sm font-display">Loading YoSpeech…</p>
      </div>
    </div>
  )
}

function RequireProfile({ children }) {
  const { profile, loading } = useApp()
  const [onboarded, setOnboarded] = useState(null)

  useEffect(() => {
    getSetting('onboarded', false).then(v => setOnboarded(v))
  }, [])

  if (loading || onboarded === null) return <LoadingScreen/>
  if (!onboarded || !profile) return <Navigate to="/auth" replace/>
  return children
}

function HomeWrapper({ children }) {
  const shouldShow = useCheckIn()
  const { profile, setTodayMood } = useApp()

  // ✅ Persist dismissal across reloads
  const [dismissed, setDismissed] = useState(() => {
    return sessionStorage.getItem('checkin_dismissed') === 'true'
  })

  const handleComplete = (mood) => {
    setTodayMood(mood?.id)

    // ✅ Persist dismissal
    sessionStorage.setItem('checkin_dismissed', 'true')

    setDismissed(true)
  }

  return (
    <>
      {children}

      {shouldShow && !dismissed && (
        <DailyCheckIn
          key="daily-checkin" // ✅ forces proper unmount
          ageGroup={profile?.ageGroup || 'explorer'}
          onComplete={handleComplete}
        />
      )}
    </>
  )
}

export default function App() {
  return (
    <div className="min-h-screen max-w-md mx-auto relative overflow-x-hidden" style={{ background:'var(--ink)' }}>
      {/* Aurora mesh */}
      <div className="fixed inset-0 pointer-events-none z-0 max-w-md mx-auto overflow-hidden">
        <div className="absolute top-0 left-1/3 w-72 h-72 rounded-full"
          style={{ background:'radial-gradient(circle, rgba(34,211,238,0.05), transparent 70%)' }}/>
        <div className="absolute top-1/3 right-0 w-56 h-56 rounded-full"
          style={{ background:'radial-gradient(circle, rgba(167,139,250,0.04), transparent 70%)' }}/>
        <div className="absolute bottom-1/4 left-0 w-48 h-48 rounded-full"
          style={{ background:'radial-gradient(circle, rgba(251,191,36,0.03), transparent 70%)' }}/>
      </div>

      <div className="relative z-10">
        <Routes>
          <Route path="/"              element={<Splash />} />
          <Route path="/auth"          element={<Auth />} />
          <Route path="/onboarding"    element={<Onboarding />} />
          <Route path="/home"          element={<RequireProfile><HomeWrapper><Home/></HomeWrapper></RequireProfile>} />
          <Route path="/adventure"     element={<RequireProfile><Adventure /></RequireProfile>} />
          <Route path="/comm"          element={<RequireProfile><CommAcademy /></RequireProfile>} />
          <Route path="/breathe"       element={<RequireProfile><Breathe /></RequireProfile>} />
          <Route path="/speaklab"      element={<RequireProfile><SpeakLab /></RequireProfile>} />
          <Route path="/brave"         element={<RequireProfile><BraveMissions /></RequireProfile>} />
          <Route path="/talktales"     element={<RequireProfile><TalkTales /></RequireProfile>} />
          <Route path="/journal"       element={<RequireProfile><Journal /></RequireProfile>} />
          <Route path="/family"        element={<RequireProfile><FamilyMode /></RequireProfile>} />
          <Route path="/progress"      element={<RequireProfile><Progress /></RequireProfile>} />
          <Route path="/settings"      element={<RequireProfile><Settings /></RequireProfile>} />
          <Route path="/flux-chat"     element={<RequireProfile><FluxChat /></RequireProfile>} />
          {/* V5 routes */}
          <Route path="/analysis"      element={<RequireProfile><SpeechAnalysis /></RequireProfile>} />
          <Route path="/act"           element={<RequireProfile><ACTModule /></RequireProfile>} />
          <Route path="/daf"           element={<RequireProfile><DAFMode /></RequireProfile>} />
          <Route path="/brave-wall"    element={<RequireProfile><BraveWall /></RequireProfile>} />
          <Route path="/weekly-report" element={<RequireProfile><WeeklyReport /></RequireProfile>} />
          <Route path="*"              element={<Navigate to="/" replace />} />
        </Routes>

        <BottomNav />
        <Notification />
        <FloatingReader ageGroup="explorer" hidden={false} />
      </div>
    </div>
  )
}
