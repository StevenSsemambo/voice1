// ─── HAPTIC ENGINE ─────────────────────────────────────────────────────────────
// navigator.vibrate() — works offline, no network needed
// Gracefully no-ops on desktop / unsupported browsers
// ─────────────────────────────────────────────────────────────────────────────

const vibe = (pattern) => {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern)
  } catch { /* silent fail on unsupported devices */ }
}

export const haptics = {
  // UI interactions
  tap:          () => vibe(10),
  select:       () => vibe(15),
  confirm:      () => vibe([12, 8, 12]),
  back:         () => vibe(8),

  // Success & achievement
  success:      () => vibe([20, 10, 40]),
  achievement:  () => vibe([30, 15, 60, 15, 30]),
  bravestar:    () => vibe([10, 8, 10, 8, 80]),
  sessionDone:  () => vibe([20, 10, 20, 10, 60]),

  // Alerts & warnings
  warning:      () => vibe([40, 20, 40]),
  error:        () => vibe([60, 20, 60]),
  streak:       () => vibe([15, 8, 15, 8, 15, 8, 60]),

  // Speech analysis events
  fillerDetected: () => vibe([25, 15, 25]),
  recordStart:    () => vibe([10, 5, 20]),
  recordStop:     () => vibe([20, 10, 10]),

  // Custom
  custom: (pattern) => vibe(pattern),
}
