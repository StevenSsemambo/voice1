import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { getProfile, getTotalSessions, getStreakCount, markTodayStreak,
         getSetting, setSetting, db } from '../utils/db'

const AppContext = createContext(null)

// Apply theme and font-size to document root
const applyTheme = (theme) => {
  document.documentElement.setAttribute('data-theme', theme || 'dark')
}
const applyFontSize = (size) => {
  document.documentElement.setAttribute('data-font-size', size || 'medium')
}

export const AppProvider = ({ children }) => {
  const [profile,        setProfile]        = useState(null)
  const [totalSessions,  setTotalSessions]  = useState(0)
  const [streak,         setStreak]         = useState(0)
  const [fluxMessage,    setFluxMessage]    = useState('')
  const [showFluxMsg,    setShowFluxMsg]    = useState(false)
  const [loading,        setLoading]        = useState(true)
  const [notification,   setNotification]   = useState(null)
  const [userEmail,      setUserEmail]      = useState('')
  const [todayMood,      setTodayMood]      = useState(null)
  const [theme,          setThemeState]     = useState('dark')
  const [fontSize,       setFontSizeState]  = useState('medium')
  const [streakAtRisk,   setStreakAtRisk]   = useState(false)

  const loadProfile = useCallback(async () => {
    try {
      const [p, sessions, s, email, mood, savedTheme, savedFont] = await Promise.all([
        getProfile(),
        getTotalSessions(),
        getStreakCount(),
        getSetting('user_email', ''),
        getSetting('today_mood', null),
        getSetting('theme', 'dark'),
        getSetting('fontSize', 'medium'),
      ])
      setProfile(p)
      setTotalSessions(sessions)
      setStreak(s)
      setUserEmail(email || '')
      setTodayMood(mood)
      setThemeState(savedTheme)
      setFontSizeState(savedFont)
      applyTheme(savedTheme)
      applyFontSize(savedFont)

      // Check if streak is at risk (after 7pm, no session today)
      const hour = new Date().getHours()
      if (hour >= 19 && s > 0) {
        const todayStr = new Date().toDateString()
        const todayEntry = await db.streaks.where('date').equals(todayStr).first()
        if (!todayEntry) setStreakAtRisk(true)
      }
    } catch (e) {
      console.error('loadProfile:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadProfile() }, [loadProfile])

  const showNotification = useCallback((msg, type = 'success', duration = 3000) => {
    setNotification({ msg, type })
    setTimeout(() => setNotification(null), duration)
  }, [])

  const triggerFlux = useCallback((msg, duration = 5000) => {
    setFluxMessage(msg)
    setShowFluxMsg(true)
    setTimeout(() => setShowFluxMsg(false), duration)
  }, [])

  const refreshProfile = useCallback(async () => {
    await markTodayStreak()
    await loadProfile()
    setStreakAtRisk(false)
  }, [loadProfile])

  const setTheme = useCallback(async (t) => {
    setThemeState(t)
    applyTheme(t)
    await setSetting('theme', t)
  }, [])

  const setFontSize = useCallback(async (s) => {
    setFontSizeState(s)
    applyFontSize(s)
    await setSetting('fontSize', s)
  }, [])

  const signOut = useCallback(async () => {
    await Promise.all([
      setSetting('onboarded', false),
      setSetting('user_email', ''),
      setSetting('auth_method', ''),
      db.profile.clear(),
    ])
    setProfile(null)
    setUserEmail('')
  }, [])

  return (
    <AppContext.Provider value={{
      profile, setProfile,
      totalSessions, setTotalSessions,
      streak,
      fluxMessage, showFluxMsg, triggerFlux,
      loading,
      refreshProfile, loadProfile,
      notification, showNotification,
      userEmail,
      todayMood, setTodayMood,
      signOut,
      theme, setTheme,
      fontSize, setFontSize,
      streakAtRisk, setStreakAtRisk,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be inside AppProvider')
  return ctx
}
