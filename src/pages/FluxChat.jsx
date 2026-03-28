{/* ── Input ────────────────────────────────────────────────────────── */}
<div className="flex-shrink-0 px-4 py-3 glass-dark border-t border-white/5 safe-bottom">
  {voiceMode ? (
    /* Voice-only UI */
    <div className="flex flex-col items-center gap-3 py-2">
      <button
        onPointerDown={startListening}
        onPointerUp={stopListening}
        onPointerLeave={stopListening}
        className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl shadow-2xl
          transition-all active:scale-95 ${listening
            ? 'bg-red-500 shadow-red-500/40 scale-110'
            : 'bg-cyan-500 shadow-cyan-500/40 hover:bg-cyan-400'}`}>
        {listening ? '⏺' : '🎙️'}
      </button>

      <p className="text-white/30 text-xs">
        {listening ? 'Listening — release to send' : 'Hold to speak to Flux'}
      </p>

      <div className="flex gap-2">
        {fluxSpeaking && (
          <button onClick={() => { stopSpeaking(); setFluxSpeaking(false) }}
            className="text-xs px-3 py-1.5 rounded-full bg-white/10 text-white/40 active:scale-95">
            ⏹ Stop Flux
          </button>
        )}
        <button onClick={toggleVoiceMode}
          className="text-xs px-3 py-1.5 rounded-full bg-white/10 text-white/40 active:scale-95">
          ⌨️ Type instead
        </button>
      </div>
    </div>
  ) : (
    /* Text + mic UI */
    <div className="flex gap-2 items-end">

      {micOk && (
        <button
          onPointerDown={startListening}
          onPointerUp={stopListening}
          onPointerLeave={stopListening}
          className={`w-11 h-11 rounded-2xl flex items-center justify-center text-lg flex-shrink-0
            transition-all active:scale-90 ${listening
              ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/30'
              : 'bg-white/10 text-white/50 hover:bg-white/15'}`}>
          {listening ? '⏺' : '🎙️'}
        </button>
      )}

      {/* ✅ FIXED + AUTO-EXPANDING TEXTAREA */}
      <textarea
        value={input}
        onChange={e => {
          setInput(e.target.value)

          // ✅ Auto expand
          e.target.style.height = 'auto'
          e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
        }}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            sendMsg()
          }
        }}
        placeholder={listening ? '🎙️ Listening…' : 'Talk to Flux…'}
        rows={1}
        className="flex-1 rounded-2xl px-4 py-3 text-sm outline-none resize-none
                   placeholder-white/40 leading-relaxed transition-all"
        style={{
          minHeight: '44px',
          maxHeight: '120px',

          // ✅ HARD FIX (no more white box ever)
          background: 'rgba(15, 23, 42, 0.85)',
          color: '#ffffff',
          border: '1px solid rgba(255,255,255,0.12)'
        }}
        onFocus={(e) => {
          e.target.style.border = '1px solid rgba(34,211,238,0.6)'
        }}
        onBlur={(e) => {
          e.target.style.border = '1px solid rgba(255,255,255,0.12)'
        }}
      />

      <button
        onClick={() => sendMsg()}
        disabled={!input.trim() || loading}
        className="w-11 h-11 rounded-2xl bg-cyan-500 hover:bg-cyan-400 flex items-center justify-center
                   text-white disabled:opacity-30 active:scale-90 transition-all flex-shrink-0
                   shadow-lg shadow-cyan-500/20">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"/>
          <polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
      </button>
    </div>
  )}
</div>
