import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { addBraveWallPost, getBraveWallPosts, db } from '../utils/db'
import { useApp } from '../hooks/useAppContext'
import { haptics } from '../utils/haptics'
import useFluxVoice from '../hooks/useFluxVoice'
import { getOfflineResponse } from '../ai/fluxEngine'

// ─── SEED POSTS (shown when wall is empty) ────────────────────────────────────
const SEED_POSTS = [
  { id: 's1', situation: "I called the pharmacy instead of texting them today. My voice shook. But I did it.", date: new Date(Date.now() - 86400000*2).toISOString(), likes: 47, isAnon: true },
  { id: 's2', situation: "First day at my new job. I introduced myself in the team meeting and didn't hide a single word. Three months ago I would have called in sick.", date: new Date(Date.now() - 86400000*5).toISOString(), likes: 89, isAnon: true },
  { id: 's3', situation: "I told my crush I liked them. I stuttered on her name. She smiled anyway.", date: new Date(Date.now() - 86400000*1).toISOString(), likes: 134, isAnon: true },
  { id: 's4', situation: "Ordered my own food at a restaurant without pointing at the menu. Small win. Huge deal.", date: new Date(Date.now() - 86400000*7).toISOString(), likes: 61, isAnon: true },
  { id: 's5', situation: "I gave a 3-minute presentation at school today. Not fluent. But brave. My teacher said it was the best one.", date: new Date(Date.now() - 86400000*3).toISOString(), likes: 102, isAnon: true },
  { id: 's6', situation: "Stuttered intentionally during a BraveMission for the first time. It was terrifying and somehow freeing.", date: new Date(Date.now() - 86400000*0.5).toISOString(), likes: 38, isAnon: true },
  { id: 's7', situation: "I stopped substituting words. For a whole day. I said every word I meant, even when I knew I'd stutter on it.", date: new Date(Date.now() - 86400000*4).toISOString(), likes: 77, isAnon: true },
  { id: 's8', situation: "My boss asked me to lead the client call. I almost said no. I said yes instead. It went fine.", date: new Date(Date.now() - 86400000*6).toISOString(), likes: 55, isAnon: true },
]

const REACTION_TYPES = [
  { emoji: '💧', label: 'I feel this', color: 'var(--aqua)' },
  { emoji: '⭐', label: 'Brave star', color: 'var(--amber)' },
  { emoji: '🌊', label: 'Keep flowing', color: '#38bdf8' },
  { emoji: '🦁', label: 'Legend', color: 'var(--rose)' },
]

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr)
  const mins = Math.floor(diff / 60000)
  const hrs  = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 60) return `${mins}m ago`
  if (hrs < 24)  return `${hrs}h ago`
  return `${days}d ago`
}

function BravePost({ post, onReact }) {
  const [liked, setLiked]   = useState(false)
  const [localLikes, setLocalLikes] = useState(post.likes || 0)
  const [showReactions, setShowReactions] = useState(false)

  const handleReact = (r) => {
    if (!liked) {
      setLiked(true)
      setLocalLikes(l => l + 1)
      setShowReactions(false)
      onReact?.(post.id, r)
    }
  }

  return (
    <div className="card animate-slide-up relative overflow-hidden"
      style={{ borderColor: liked ? 'rgba(251,191,36,0.25)' : 'rgba(255,255,255,0.08)' }}>
      {liked && (
        <div className="absolute top-0 left-0 right-0 h-0.5 rounded-full"
          style={{ background: 'linear-gradient(90deg, var(--amber), var(--aqua))' }}/>
      )}

      <p className="text-white/80 text-sm leading-relaxed mb-3 font-body">"{post.situation}"</p>

      <div className="flex items-center justify-between">
        <span className="text-white/25 text-xs">{timeAgo(post.date)}</span>

        <div className="flex items-center gap-2">
          <span className="text-white/30 text-xs">{localLikes}</span>

          <div className="relative">
            <button
              onClick={() => setShowReactions(s => !s)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all active:scale-90"
              style={{
                background: liked ? 'rgba(251,191,36,0.12)' : 'rgba(255,255,255,0.06)',
                border: `1px solid ${liked ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.1)'}`,
              }}>
              <span className="text-sm">{liked ? '⭐' : '💧'}</span>
              <span className="text-xs font-display" style={{ color: liked ? 'var(--amber)' : 'rgba(255,255,255,0.5)' }}>
                {liked ? 'Reacted' : 'React'}
              </span>
            </button>

            {showReactions && !liked && (
              <div className="absolute bottom-full right-0 mb-2 flex gap-1.5 p-2 rounded-2xl animate-scale-in"
                style={{ background: 'rgba(12,17,32,0.98)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter:'blur(20px)' }}>
                {REACTION_TYPES.map(r => (
                  <button key={r.emoji} onClick={() => handleReact(r)}
                    className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl hover:bg-white/10 transition-all active:scale-90">
                    <span className="text-xl">{r.emoji}</span>
                    <span className="text-[9px] text-white/40 whitespace-nowrap">{r.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function BraveWall() {
  const [posts, setPosts]       = useState([])
  const [composing, setComposing] = useState(false)
  const [newPost, setNewPost]   = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [filter, setFilter]     = useState('all') // all | mine
  const navigate = useNavigate()
  const { profile } = useApp()
  const { fluxSay } = useFluxVoice()

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    const local = await getBraveWallPosts(30)
    // Merge local posts with seed posts (seed posts shown only if no local posts exist)
    const allPosts = local.length > 3
      ? local
      : [...local, ...SEED_POSTS.filter(s => !local.some(l => l.situation === s.situation))]
    setPosts(allPosts.sort((a, b) => new Date(b.date) - new Date(a.date)))
  }

  const handleSubmit = async () => {
    if (!newPost.trim() || newPost.trim().length < 10) return
    setSubmitting(true)
    haptics.bravestar()
    await addBraveWallPost(newPost.trim(), true)
    setNewPost('')
    setSubmitting(false)
    setSubmitted(true)
    setComposing(false)
    fluxSay(getOfflineResponse('voluntary_stutter'), true)
    await load()
    setTimeout(() => setSubmitted(false), 4000)
  }

  const displayPosts = filter === 'mine'
    ? posts.filter(p => !p.isAnon && p.situation)
    : posts

  return (
    <div className="min-h-full pb-28 page-enter" style={{ zIndex: 1 }}>
      <div className="flex items-center gap-3 px-5 pt-8 pb-4">
        <button onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full glass flex items-center justify-center text-white text-lg">←</button>
        <div>
          <h1 className="font-display text-xl font-bold text-white">Brave Wall</h1>
          <p className="text-white/35 text-xs">Anonymous brave moments · You are not alone</p>
        </div>
        <span className="ml-auto text-2xl">🌊</span>
      </div>

      {/* Banner */}
      <div className="mx-5 mb-5 p-4 rounded-2xl"
        style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.1), rgba(167,139,250,0.08))', border: '1px solid rgba(34,211,238,0.2)' }}>
        <p className="text-white/70 text-sm leading-relaxed">
          Every post here is anonymous. Real people. Real courage. No names. No judgement. Just brave moments shared so no one feels alone in this.
        </p>
      </div>

      {/* Submit */}
      {!composing && !submitted && (
        <div className="px-5 mb-5">
          <button onClick={() => setComposing(true)}
            className="w-full p-4 rounded-2xl border border-dashed text-center transition-all active:scale-[0.98]"
            style={{ borderColor: 'rgba(34,211,238,0.25)', background: 'rgba(34,211,238,0.04)' }}>
            <span className="font-display font-semibold text-sm" style={{ color: 'var(--aqua)' }}>
              + Share a brave moment
            </span>
            <p className="text-white/30 text-xs mt-0.5">100% anonymous · Inspires others</p>
          </button>
        </div>
      )}

      {submitted && (
        <div className="mx-5 mb-5 p-4 rounded-2xl animate-scale-in"
          style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)' }}>
          <p className="text-center font-display font-bold text-emerald-400 text-sm" style={{ color:'var(--jade)' }}>
            ⭐ Your brave moment is on the wall!
          </p>
        </div>
      )}

      {composing && (
        <div className="mx-5 mb-5 card animate-slide-up" style={{ borderColor: 'rgba(34,211,238,0.25)' }}>
          <p className="section-label mb-2">Your brave moment</p>
          <p className="text-white/40 text-xs mb-3">What did you do? What situation did you face? Describe it honestly. Completely anonymous.</p>
          <textarea
            value={newPost}
            onChange={e => setNewPost(e.target.value)}
            placeholder="I spoke up in the meeting today even though I knew I'd stutter. It wasn't perfect, but I didn't hide..."
            className="input-field mb-3 text-sm"
            rows={4}
            maxLength={280}
          />
          <div className="flex items-center justify-between mb-3">
            <span className="text-white/25 text-xs">{newPost.length}/280</span>
            <span className="pill text-[10px]" style={{ background:'rgba(52,211,153,0.1)', borderColor:'rgba(52,211,153,0.2)', color:'var(--jade)' }}>
              🔒 100% anonymous
            </span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setComposing(false); setNewPost('') }} className="btn-ghost flex-1 text-sm font-display py-3">Cancel</button>
            <button onClick={handleSubmit} disabled={submitting || newPost.trim().length < 10}
              className="btn-aqua flex-1 text-sm font-display py-3 disabled:opacity-40" style={{ color:'#05080f' }}>
              {submitting ? 'Posting…' : 'Post Brave Moment'}
            </button>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 px-5 mb-4">
        {[{id:'all', label:'All moments'}, {id:'mine', label:'Mine'}].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className="px-4 py-2 rounded-xl text-xs font-display font-semibold transition-all"
            style={{
              background: filter === f.id ? 'var(--aqua)' : 'rgba(255,255,255,0.06)',
              color: filter === f.id ? '#05080f' : 'rgba(255,255,255,0.45)',
              border: `1px solid ${filter === f.id ? 'transparent' : 'rgba(255,255,255,0.09)'}`,
            }}>
            {f.label}
          </button>
        ))}
        <span className="text-white/25 text-xs self-center ml-auto">{displayPosts.length} moments</span>
      </div>

      {/* Posts */}
      <div className="px-5 flex flex-col gap-3">
        {displayPosts.map((post, i) => (
          <BravePost key={post.id || i} post={post} onReact={() => {}}/>
        ))}

        {displayPosts.length === 0 && (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">🌊</div>
            <p className="text-white/35 text-sm">Be the first to post a brave moment.</p>
          </div>
        )}
      </div>
    </div>
  )
}
