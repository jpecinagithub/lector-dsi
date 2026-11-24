import { useEffect, useMemo, useRef, useState } from 'react'
import book from './data/book.json'
import { chapterQuizzes, finalQuiz } from './data/quizzes.js'
import { tracks } from './data/music.js'

const LS = 'lector-dsi-v1'
function loadState() {
  try { return JSON.parse(localStorage.getItem(LS)) || {} } catch { return {} }
}
function useStore() {
  const [s, setS] = useState(loadState)
  useEffect(() => { try { localStorage.setItem(LS, JSON.stringify(s)) } catch {} }, [s])
  return [s, setS]
}
const fmtTime = (sec) => { if (!isFinite(sec) || sec == null) return '0:00'; const m = Math.floor(sec / 60), ss = Math.floor(sec % 60); return `${m}:${String(ss).padStart(2, '0')}` }

function Highlighted({ text, marks, search }) {
  const terms = useMemo(() => {
    const t = [...(marks || [])].filter(x => x && x.length >= 4)
    if (search && search.trim().length >= 3) t.push(search.trim())
    return [...new Set(t)].sort((a, b) => b.length - a.length)
  }, [marks, search])
  if (!terms.length) return <>{text}</>
  let parts = [text]
  terms.forEach(term => {
    const isSearch = search && term.toLowerCase() === search.trim().toLowerCase()
    const next = []
    parts.forEach(p => {
      if (typeof p !== 'string') { next.push(p); return }
      const low = p.toLowerCase(), tlow = term.toLowerCase()
      let i = 0, idx
      let found = false
      while ((idx = low.indexOf(tlow, i)) >= 0) {
        found = true
        if (idx > i) next.push(p.slice(i, idx))
        next.push(<mark key={Math.random()} className={isSearch ? 'search-hit' : ''}>{p.slice(idx, idx + term.length)}</mark>)
        i = idx + term.length
      }
      if (!found) next.push(p); else if (i < p.length) next.push(p.slice(i))
    })
    parts = next
  })
  return <>{parts}</>
}

function Quiz({ quizKey, questions, title, store, setStore, onDone }) {
  const saved = store.quizzes?.[quizKey]
  const [answers, setAnswers] = useState({})
  const [result, setResult] = useState(saved?.last || null)
  const answered = Object.keys(answers).length
  const submit = () => {
    let score = 0
    questions.forEach((q, i) => { if (answers[i] === q.a) score++ })
    const r = { score, total: questions.length, date: new Date().toISOString() }
    setResult(r)
    setStore(prev => ({ ...prev, quizzes: { ...(prev.quizzes || {}), [quizKey]: { best: Math.max(prev.quizzes?.[quizKey]?.best || 0, score), last: r } } }))
    if (onDone) onDone(r)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const retry = () => { setAnswers({}); setResult(null) }
  return (
    <div className="quiz">
      <h2>{title}</h2>
      {saved?.best != null && <p className="quiz-best">Tu mejor resultado: {saved.best}/{questions.length}</p>}
      {result && (
        <div className={`quiz-result ${result.score >= result.total * 0.6 ? 'ok' : 'ko'}`}>
          <strong>{result.score}/{result.total}</strong>
          <span>{result.score === result.total ? '¡Perfecto! Dominas el capítulo.' : result.score >= result.total * 0.6 ? '¡Bien hecho! Revisa las explicaciones de los fallos.' : 'Buen intento: vuelve al texto, subraya lo importante y reinténtalo.'}</span>
          <button className="btn" onClick={retry}>Repetir el quiz</button>
        </div>
      )}
      {questions.map((q, i) => {
        const chosen = answers[i]
        const show = !!result
        return (
          <fieldset key={i} className="quiz-q">
            <legend>{i + 1}. {q.q}</legend>
            {q.o.map((opt, j) => {
              const cls = show ? (j === q.a ? 'correct' : (chosen === j ? 'wrong' : '')) : (chosen === j ? 'chosen' : '')
              return (
                <label key={j} className={`quiz-opt ${cls}`}>
                  <input type="radio" name={`${quizKey}-${i}`} disabled={show} checked={chosen === j} onChange={() => setAnswers(a => ({ ...a, [i]: j }))} />
                  {opt}
                </label>
              )
            })}
            {show && <p className="quiz-exp">{q.e}</p>}
          </fieldset>
        )
      })}
      {!result && <button className="btn primary big" disabled={answered < questions.length} onClick={submit}>Corregir ({answered}/{questions.length} respondidas)</button>}
    </div>
  )
}

export default function App() {
  const [store, setStore] = useStore()
  const urlCap = (() => { try { const n = parseInt(new URLSearchParams(window.location.search).get('cap'), 10); return n >= 1 && n <= 10 ? n : null } catch { return null } })()
  const urlVista = (() => { try { const v = new URLSearchParams(window.location.search).get('vista'); return { musica: 'music', leer: 'read', estudio: 'my', inicio: 'home' }[v] || null } catch { return null } })()
  const [view, setView] = useState(urlVista || (urlCap ? 'read' : (store.lastChapter ? 'read' : 'home'))) // home | read | music | my
  const [chapterId, setChapterId] = useState(urlCap || store.lastChapter || 1)
  const [mode, setMode] = useState('text') // text | quiz dentro del lector
  const [panel, setPanel] = useState(null) // index | notes | marks | settings
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState(null)
  const [pendingMark, setPendingMark] = useState(null)
  const [speaking, setSpeaking] = useState(false)
  const [trackInfo, setTrackInfo] = useState(null)
  const readerRef = useRef(null)

  const urlTema = (() => { try { const t = new URLSearchParams(window.location.search).get('tema'); return t === 'dia' ? 'light' : t === 'noche' ? 'atlas' : t === 'sepia' ? 'sepia' : null } catch { return null } })()
  const settings = { fontSize: 19, lineHeight: 1.75, theme: 'atlas', font: 'sans', ...(store.settings || {}), ...(urlTema && !store.settings?.theme ? { theme: urlTema } : {}) }
  const setSettings = (patch) => setStore(p => ({ ...p, settings: { ...settings, ...patch } }))
  const chapter = book.chapters.find(c => c.id === chapterId)
  const highlights = store.highlights || {}
  const readSet = new Set(store.read || [])
  const totalWords = book.chapters.reduce((a, c) => a + c.words, 0)
  const progressPct = Math.round((readSet.size / book.chapters.length) * 100)

  // ---- música (reproductor global) ----
  const audioRef = useRef(null)
  const [trackIdx, setTrackIdx] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [cur, setCur] = useState(0)
  const [dur, setDur] = useState(0)
  const [volume, setVolume] = useState(0.8)
  const track = trackIdx != null ? tracks[trackIdx] : null
  const playTrack = (i) => {
    if (trackIdx === i && audioRef.current) { playing ? audioRef.current.pause() : audioRef.current.play(); return }
    setTrackIdx(i)
    setTimeout(() => { if (audioRef.current) { audioRef.current.src = '/' + tracks[i].file; audioRef.current.play().catch(() => {}) } }, 0)
  }
  const stepTrack = (d) => { if (trackIdx == null) return; playTrack((trackIdx + d + tracks.length) % tracks.length) }
  useEffect(() => { if (audioRef.current) audioRef.current.volume = volume }, [volume])

  const openChapter = (id, withQuiz = false) => {
    setChapterId(id); setView('read'); setMode(withQuiz ? 'quiz' : 'text'); setPanel(null)
    setStore(p => ({ ...p, lastChapter: id }))
    setTimeout(() => { const el = readerRef.current; if (el) el.scrollTop = 0 }, 30)
  }
  const markRead = (id) => setStore(p => ({ ...p, read: [...new Set([...(p.read || []), id])] }))

  // guardar posición de lectura
  const onReaderScroll = () => {
    const el = readerRef.current; if (!el) return
    const frac = el.scrollHeight - el.clientHeight > 0 ? el.scrollTop / (el.scrollHeight - el.clientHeight) : 0
    setStore(p => ({ ...p, pos: { ...(p.pos || {}), [chapterId]: frac } }))
    if (frac > 0.92 && !readSet.has(chapterId)) markRead(chapterId)
  }
  useEffect(() => {
    if (view !== 'read' || mode !== 'text') return
    const el = readerRef.current; if (!el) return
    const frac = store.pos?.[chapterId] || 0
    const t = setTimeout(() => { el.scrollTop = frac * (el.scrollHeight - el.clientHeight) }, 60)
    return () => clearTimeout(t)
  }, [chapterId, view, mode]) // eslint-disable-line

  const captureSelection = () => {
    const sel = window.getSelection()
    const txt = sel ? sel.toString().trim().replace(/\s+/g, ' ') : ''
    setPendingMark(txt.length >= 8 ? txt : null)
  }
  const saveMark = () => {
    if (!pendingMark) return
    setStore(p => ({ ...p, highlights: { ...(p.highlights || {}), [chapterId]: [...new Set([...((p.highlights || {})[chapterId] || []), pendingMark])] } }))
    setPendingMark(null); window.getSelection()?.removeAllRanges()
  }
  const removeMark = (chId, txt) => setStore(p => ({ ...p, highlights: { ...(p.highlights || {}), [chId]: ((p.highlights || {})[chId] || []).filter(x => x !== txt) } }))

  const doSearch = (q) => {
    setSearch(q)
    if (q.trim().length < 3) { setSearchResults(null); return }
    const res = []
    book.chapters.forEach(c => c.sections.forEach(s => s.paragraphs.forEach(p => {
      const i = p.toLowerCase().indexOf(q.trim().toLowerCase())
      if (i >= 0) res.push({ ch: c.id, title: c.title, snippet: p.slice(Math.max(0, i - 60), i + q.length + 80) })
    })))
    setSearchResults(res.slice(0, 30))
  }

  const speak = () => {
    if (speaking) { speechSynthesis.cancel(); setSpeaking(false); return }
    const text = chapter.sections.flatMap(s => s.paragraphs).join(' ')
    const u = new SpeechSynthesisUtterance(text.slice(0, 12000))
    u.lang = 'es-ES'; u.rate = 1
    u.onend = () => setSpeaking(false)
    speechSynthesis.cancel(); speechSynthesis.speak(u); setSpeaking(true)
  }
  useEffect(() => () => speechSynthesis.cancel(), [chapterId])

  const exportNotes = () => {
    let md = `# Mis notas y subrayados — ${book.title}\n\n`
    book.chapters.forEach(c => {
      const note = (store.notes || {})[c.id]
      const marks = (store.highlights || {})[c.id] || []
      if (note || marks.length) {
        md += `## ${c.title}\n\n`
        marks.forEach(m => { md += `> ${m}\n\n` })
        if (note) md += `${note}\n\n`
      }
    })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }))
    a.download = 'mis-notas-lector-dsi.md'; a.click()
  }

  const quizDoneCount = Object.keys(store.quizzes || {}).filter(k => (store.quizzes[k]?.best || 0) > 0).length

  return (
    <div className={`app theme-${settings.theme}`}>
      <header className="topbar">
        <button className="brand" onClick={() => setView('home')}>
          <img src="/icon.svg" alt="" width="30" height="30" />
          <span>Lector <strong>DSI</strong></span>
        </button>
        <nav className="topnav">
          <button className={view === 'home' ? 'on' : ''} onClick={() => setView('home')}>Inicio</button>
          <button className={view === 'read' ? 'on' : ''} onClick={() => setView('read')}>Leer</button>
          <button className={view === 'music' ? 'on' : ''} onClick={() => setView('music')}>🎵 Música</button>
          <button className={view === 'my' ? 'on' : ''} onClick={() => setView('my')}>Mi estudio</button>
        </nav>
        <button className="btn small theme-toggle" onClick={() => setSettings({ theme: settings.theme === 'light' ? 'atlas' : 'light' })} title="Cambiar entre modo día y modo noche">
          {settings.theme === 'light' ? '🌙 Noche' : '☀️ Día'}
        </button>
        <div className="top-progress" title="Capítulos leídos">
          <div className="bar"><div style={{ width: progressPct + '%' }} /></div>
          <span>{progressPct}%</span>
        </div>
      </header>

      {view === 'home' && (
        <main className="home">
          <section className="hero">
            <img src="/cover.jpg" alt="Portada del libro" className="cover" />
            <div>
              <h1>{book.title}</h1>
              <p className="subtitle">{book.subtitle}</p>
              <p className="authors">{book.authors.join(' · ')}</p>
              <div className="stats">
                <span><strong>{book.chapters.length}</strong> capítulos</span>
                <span><strong>{totalWords.toLocaleString('es-ES')}</strong> palabras</span>
                <span><strong>{Math.round(totalWords / 180)}</strong> min de lectura</span>
                <span><strong>10</strong> piezas de música clásica</span>
              </div>
              <div className="hero-actions">
                <button className="btn primary big" onClick={() => openChapter(store.lastChapter || 1)}>
                  {store.lastChapter ? 'Continuar leyendo' : 'Empezar a leer'}
                </button>
                <button className="btn big" onClick={() => setView('music')}>🎵 Escuchar música clásica</button>
              </div>
              <p className="hint">Subraya en amarillo lo importante, toma notas por capítulo, escucha música mientras lees y pon a prueba lo aprendido con un quiz al final de cada capítulo y un examen final. Todo se guarda en tu navegador.</p>
            </div>
          </section>

          <section className="search-box">
            <input value={search} onChange={e => doSearch(e.target.value)} placeholder="🔎 Buscar en todo el libro… (mín. 3 letras)" />
            {searchResults && <p className="search-count">{searchResults.length} resultados</p>}
            {searchResults?.map((r, i) => (
              <button key={i} className="search-result" onClick={() => openChapter(r.ch)}>
                <strong>{r.title}</strong><span>…{r.snippet}…</span>
              </button>
            ))}
          </section>

          <h2 className="section-title">Índice del libro</h2>
          <ol className="index-list">
            {book.chapters.map(c => (
              <li key={c.id} className="index-item">
                <button className="index-main" onClick={() => openChapter(c.id)}>
                  <span className={`check ${readSet.has(c.id) ? 'done' : ''}`}>{readSet.has(c.id) ? '✓' : c.id}</span>
                  <span className="index-text"><strong>{c.title}</strong><small>{c.author} · {c.words.toLocaleString('es-ES')} palabras · ~{c.minutes} min{(store.quizzes?.[c.id]?.best != null) ? ` · Quiz: ${store.quizzes[c.id].best}/5` : ''}</small></span>
                </button>
                <button className="btn small" onClick={() => openChapter(c.id, true)}>Quiz</button>
              </li>
            ))}
          </ol>
          <div className="final-card">
            <div><h3>Examen final</h3><p>15 preguntas de todos los capítulos. {store.quizzes?.final?.best != null ? `Tu mejor nota: ${store.quizzes.final.best}/15.` : 'Hazlo cuando termines el libro.'}</p></div>
            <button className="btn primary" onClick={() => { setView('read'); setMode('final') }}>Hacer el examen final</button>
          </div>
        </main>
      )}

      {view === 'read' && (
        <div className="reader-layout">
          <aside className={`side ${panel === 'index' ? 'open' : ''}`}>
            <h3>Índice</h3>
            {book.chapters.map(c => (
              <button key={c.id} className={`side-item ${c.id === chapterId ? 'on' : ''}`} onClick={() => openChapter(c.id)}>
                <span>{readSet.has(c.id) ? '✓ ' : ''}{c.title}</span><small>{c.minutes} min</small>
              </button>
            ))}
            <button className={`side-item ${mode === 'final' ? 'on' : ''}`} onClick={() => setMode('final')}><span>🏆 Examen final</span><small>15 preguntas</small></button>
          </aside>

          <main className="reader-main">
            <div className="reader-tools">
              <button className="tool only-mobile" onClick={() => setPanel(panel === 'index' ? null : 'index')}>☰ Índice</button>
              <button className="tool" onClick={() => setMode(mode === 'text' ? 'quiz' : 'text')}>{mode === 'text' ? '✎ Quiz del capítulo' : '📖 Volver al texto'}</button>
              <button className="tool" onClick={speak}>{speaking ? '⏹ Detener voz' : '🔊 Escuchar'}</button>
              <button className="tool" onClick={() => setPanel(panel === 'notes' ? null : 'notes')}>📝 Notas</button>
              <button className="tool" onClick={() => setPanel(panel === 'marks' ? null : 'marks')}>🖍 Subrayados ({(highlights[chapterId] || []).length})</button>
              <button className="tool" onClick={() => setPanel(panel === 'settings' ? null : 'settings')}>Aa Ajustes</button>
            </div>

            {panel === 'settings' && (
              <div className="panel-box">
                <label>Tamaño de letra <input type="range" min="16" max="24" value={settings.fontSize} onChange={e => setSettings({ fontSize: +e.target.value })} /> {settings.fontSize}px</label>
                <label>Interlineado <input type="range" min="1.4" max="2.2" step="0.05" value={settings.lineHeight} onChange={e => setSettings({ lineHeight: +e.target.value })} /></label>
                <label>Tema
                  <select value={settings.theme} onChange={e => setSettings({ theme: e.target.value })}>
                    <option value="atlas">🌙 Noche (Atlas)</option><option value="light">☀️ Día (claro)</option><option value="sepia">Sepia</option>
                  </select>
                </label>
                <label>Fuente
                  <select value={settings.font} onChange={e => setSettings({ font: e.target.value })}>
                    <option value="sans">Sans limpia (estilo Atlas)</option><option value="serif">Serif clásica</option>
                  </select>
                </label>
              </div>
            )}
            {panel === 'notes' && (
              <div className="panel-box">
                <h4>📝 Mis notas — {chapter.title}</h4>
                <textarea rows="7" placeholder="Escribe aquí tus notas de este capítulo. Se guardan automáticamente en tu navegador…"
                  value={(store.notes || {})[chapterId] || ''}
                  onChange={e => setStore(p => ({ ...p, notes: { ...(p.notes || {}), [chapterId]: e.target.value } }))} />
                <button className="btn" onClick={exportNotes}>⬇ Exportar todas mis notas y subrayados (.md)</button>
              </div>
            )}
            {panel === 'marks' && (
              <div className="panel-box">
                <h4>🖍 Mis subrayados de este capítulo</h4>
                {((highlights[chapterId] || []).length === 0) && <p className="hint">Selecciona cualquier frase del texto y pulsa «Subrayar en amarillo».</p>}
                {(highlights[chapterId] || []).map((m, i) => (
                  <div key={i} className="mark-item"><mark>{m}</mark><button onClick={() => removeMark(chapterId, m)}>✕</button></div>
                ))}
              </div>
            )}

            {mode === 'final' ? (
              <div className="reader-scroll-static"><Quiz quizKey="final" questions={finalQuiz} title="🏆 Examen final — Todo el libro" store={store} setStore={setStore} /></div>
            ) : mode === 'quiz' ? (
              <div className="reader-scroll-static"><Quiz quizKey={String(chapterId)} questions={chapterQuizzes[chapterId]} title={`Quiz — ${chapter.title}`} store={store} setStore={setStore} /></div>
            ) : (
              <>
                <div className="reader-scroll" ref={readerRef} onScroll={onReaderScroll} onMouseUp={captureSelection} onTouchEnd={captureSelection}
                  style={{ fontSize: settings.fontSize, lineHeight: settings.lineHeight, fontFamily: settings.font === 'serif' ? 'Georgia, "Times New Roman", serif' : 'system-ui, sans-serif' }}>
                  <h1 className="ch-title">{chapter.title}</h1>
                  <p className="ch-author">{chapter.author} · {chapter.words.toLocaleString('es-ES')} palabras · ~{chapter.minutes} min de lectura</p>
                  {chapter.sections.map((s, si) => (
                    <section key={si}>
                      {s.heading && !(si === 0 && s.heading.replace(/\s+\d+$/,'').trim().toLowerCase().startsWith(chapter.title.slice(0, 40).toLowerCase().replace(/\s+\d+$/,''))) && <h2 className="sec-title">{s.heading}</h2>}
                      {s.paragraphs.map((p, pi) => <p key={pi}><Highlighted text={p} marks={highlights[chapterId]} search={searchResults ? search : ''} /></p>)}
                    </section>
                  ))}
                  {chapter.reflection?.length > 0 && (
                    <section className="reflection">
                      <h2 className="sec-title">Preguntas para la reflexión</h2>
                      <ol>{chapter.reflection.map((q, i) => <li key={i}>{q}</li>)}</ol>
                    </section>
                  )}
                  <div className="ch-end">
                    {!readSet.has(chapterId)
                      ? <button className="btn" onClick={() => markRead(chapterId)}>✓ Marcar capítulo como leído</button>
                      : <span className="read-badge">✓ Capítulo leído</span>}
                    <button className="btn primary" onClick={() => setMode('quiz')}>Hacer el quiz de este capítulo →</button>
                    {chapterId < book.chapters.length && <button className="btn" onClick={() => openChapter(chapterId + 1)}>Siguiente capítulo →</button>}
                    {chapterId === book.chapters.length && <button className="btn" onClick={() => setMode('final')}>Ir al examen final 🏆</button>}
                  </div>
                </div>
                {pendingMark && (
                  <div className="mark-bar">
                    <span>«{pendingMark.slice(0, 60)}{pendingMark.length > 60 ? '…' : ''}»</span>
                    <button className="btn primary" onClick={saveMark}>🖍 Subrayar en amarillo</button>
                    <button className="btn" onClick={() => { navigator.clipboard?.writeText(pendingMark); setPendingMark(null) }}>Copiar cita</button>
                    <button className="btn ghost" onClick={() => setPendingMark(null)}>✕</button>
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      )}

      {view === 'music' && (
        <main className="music-page">
          <h1>🎵 Música clásica para leer</h1>
          <p className="hint">Diez piezas famosas en MP3, con grabaciones de dominio público o licencia libre (Wikimedia Commons). Pulsa una pieza para escucharla: seguirá sonando mientras lees. En cada ficha tienes autor, época, estilo y la historia de la obra.</p>
          <div className="track-grid">
            {tracks.map((t, i) => (
              <article key={t.id} className={`track-card ${trackIdx === i ? 'playing' : ''}`}>
                <button className="track-play" onClick={() => playTrack(i)}>{trackIdx === i && playing ? '⏸' : '▶'}</button>
                <div className="track-body">
                  <h3>{t.title}</h3>
                  <p className="track-author">{t.composer}</p>
                  <button className="track-link" onClick={() => setTrackInfo(t)}>Ver detalle →</button>
                </div>
              </article>
            ))}
          </div>
        </main>
      )}

      {view === 'my' && (
        <main className="my-page">
          <h1>Mi estudio</h1>
          <div className="my-grid">
            <div className="my-card"><strong>{readSet.size}/{book.chapters.length}</strong><span>capítulos leídos ({progressPct}%)</span></div>
            <div className="my-card"><strong>{Object.values(highlights).reduce((a, v) => a + v.length, 0)}</strong><span>subrayados</span></div>
            <div className="my-card"><strong>{Object.values(store.notes || {}).filter(x => x?.trim()).length}</strong><span>capítulos con notas</span></div>
            <div className="my-card"><strong>{quizDoneCount}</strong><span>quizzes realizados</span></div>
            <div className="my-card"><strong>{store.quizzes?.final?.best != null ? store.quizzes.final.best + '/15' : '—'}</strong><span>mejor nota del examen final</span></div>
          </div>
          <h2 className="section-title">Todos mis subrayados</h2>
          {book.chapters.map(c => ((highlights[c.id] || []).length > 0) && (
            <div key={c.id} className="my-marks">
              <h4>{c.title}</h4>
              {(highlights[c.id] || []).map((m, i) => <div key={i} className="mark-item"><mark>{m}</mark><button onClick={() => removeMark(c.id, m)}>✕</button></div>)}
            </div>
          ))}
          <h2 className="section-title">Resultados de los quizzes</h2>
          {book.chapters.map(c => (
            <p key={c.id} className="my-quiz-row">{c.title}: <strong>{store.quizzes?.[c.id]?.best != null ? `${store.quizzes[c.id].best}/5` : 'sin hacer'}</strong></p>
          ))}
          <div className="my-actions">
            <button className="btn primary" onClick={exportNotes}>⬇ Exportar notas y subrayados (.md)</button>
            <button className="btn" onClick={() => window.print()}>🖨 Imprimir</button>
          </div>
          <footer className="credits">
            <p><strong>{book.title}</strong> — {book.authors.join(', ')}.</p>
            <p>Lector creado para Jon Peciña (jpecina@gmail.com). Contenido del libro reproducido a partir del ejemplar aportado por el usuario. Música: grabaciones de dominio público o con licencia libre vía Wikimedia Commons.</p>
          </footer>
        </main>
      )}

      {trackInfo && (
        <div className="modal-bg" onClick={() => setTrackInfo(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-x" onClick={() => setTrackInfo(null)}>✕</button>
            <h2>{trackInfo.title}</h2>
            <p className="track-work">{trackInfo.work}</p>
            <table className="ficha">
              <tbody>
                <tr><th>Autor</th><td>{trackInfo.composer} ({trackInfo.years}), {trackInfo.country}</td></tr>
                <tr><th>Época</th><td>{trackInfo.era}</td></tr>
                <tr><th>Estilo / forma</th><td>{trackInfo.style}</td></tr>
                <tr><th>Año</th><td>{trackInfo.year}</td></tr>
                <tr><th>Intérprete</th><td>{trackInfo.performer}</td></tr>
                <tr><th>Licencia</th><td>{trackInfo.license}</td></tr>
              </tbody>
            </table>
            <p>{trackInfo.desc}</p>
            <p className="track-mood">🎧 {trackInfo.mood}</p>
            <button className="btn primary" onClick={() => { playTrack(tracks.findIndex(t => t.id === trackInfo.id)); setTrackInfo(null) }}>▶ Escuchar ahora</button>
          </div>
        </div>
      )}

      {track && (
        <div className="player">
          <button onClick={() => stepTrack(-1)}>⏮</button>
          <button className="player-main" onClick={() => playTrack(trackIdx)}>{playing ? '⏸' : '▶'}</button>
          <button onClick={() => stepTrack(1)}>⏭</button>
          <div className="player-info">
            <strong>{track.title}</strong><small>{track.composer} · {track.era}</small>
            <div className="player-bar" onClick={e => { const r = e.currentTarget.getBoundingClientRect(); if (audioRef.current && dur) audioRef.current.currentTime = ((e.clientX - r.left) / r.width) * dur }}>
              <div style={{ width: (dur ? (cur / dur) * 100 : 0) + '%' }} />
            </div>
          </div>
          <span className="player-time">{fmtTime(cur)} / {fmtTime(dur)}</span>
          <input className="player-vol" type="range" min="0" max="1" step="0.05" value={volume} onChange={e => setVolume(+e.target.value)} title="Volumen" />
          <button onClick={() => setTrackInfo(track)}>ℹ</button>
        </div>
      )}
      <audio ref={audioRef} preload="metadata"
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onTimeUpdate={e => setCur(e.target.currentTime)} onLoadedMetadata={e => setDur(e.target.duration)}
        onEnded={() => stepTrack(1)} />
    </div>
  )
}
