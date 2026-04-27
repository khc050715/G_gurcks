import { useState, useEffect, useRef } from "react";

// ─── Config ───────────────────────────────────────────────────────────────────
const S    = 8;   // Board size
const T    = 20;  // Total turns per session
const CELL = 44;  // Cell size in px

// ─── Pieces ───────────────────────────────────────────────────────────────────
// v: 0 = primary fill color, 1 = alt fill color (2 tones only)
const PIECES = [
  { shape: [[1]],                          v: 0 },
  { shape: [[1, 1]],                       v: 0 },
  { shape: [[1], [1]],                     v: 0 },
  { shape: [[1, 1, 1]],                    v: 1 },
  { shape: [[1], [1], [1]],               v: 1 },
  { shape: [[1, 1], [1, 1]],              v: 0 },
  { shape: [[1, 0], [1, 1]],              v: 0 },
  { shape: [[0, 1], [1, 1]],              v: 1 },
  { shape: [[1, 1], [1, 0]],              v: 1 },
  { shape: [[1, 1], [0, 1]],              v: 0 },
  { shape: [[1, 1, 1], [0, 1, 0]],        v: 1 },
  { shape: [[1, 0], [1, 0], [1, 1]],      v: 0 },
  { shape: [[0, 1], [0, 1], [1, 1]],      v: 1 },
  { shape: [[1, 1, 1, 1]],                v: 1 },
  { shape: [[1], [1], [1], [1]],          v: 1 },
];

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  bg:      "#080e08",
  board:   "#0c150c",
  empty:   "#111c11",
  fill0:   "#3a6a3a",  // primary block color
  fill1:   "#4d8a4d",  // alt block color
  flash:   "#8fc98f",  // cleared-cell flash
  preview: "#3a6a3a",  // valid placement preview
  invalid: "#4a1a1a",  // invalid placement tint
  text:    "#8fc98f",  // primary text
  muted:   "#2e5c2e",  // muted text
  dim:     "#1a3a1a",  // very dim
  border:  "#162616",  // dividers
};

const MONO = "'DM Mono', 'Courier New', monospace";
const SANS = "'DM Sans', system-ui, sans-serif";

// ─── Pure helpers ─────────────────────────────────────────────────────────────
const emptyBoard = () =>
  Array.from({ length: S }, () => Array(S).fill(null));

const makeQueue = () =>
  Array.from({ length: T }, () => ({
    ...PIECES[Math.floor(Math.random() * PIECES.length)],
  }));

const today = () => new Date().toISOString().slice(0, 10);

function canPlace(board, piece, row, col) {
  return piece.shape.every((r, ri) =>
    r.every((cell, ci) => {
      if (!cell) return true;
      const nr = row + ri, nc = col + ci;
      return nr >= 0 && nr < S && nc >= 0 && nc < S && !board[nr][nc];
    })
  );
}

function place(board, piece, row, col) {
  const b = board.map((r) => [...r]);
  piece.shape.forEach((r, ri) =>
    r.forEach((cell, ci) => {
      if (cell) b[row + ri][col + ci] = piece.v + 1; // stored as 1 or 2
    })
  );
  return b;
}

function clearLines(board) {
  const b = board.map((r) => [...r]);
  const fullRows = b.reduce((acc, r, i) => (r.every(Boolean) ? [...acc, i] : acc), []);
  const fullCols = Array.from({ length: S }, (_, c) => c).filter((c) =>
    b.every((r) => r[c])
  );
  fullRows.forEach((r) => b[r].fill(null));
  fullCols.forEach((c) => b.forEach((r) => (r[c] = null)));
  return { board: b, lines: fullRows.length + fullCols.length };
}

function hasRoom(board, piece) {
  for (let r = 0; r < S; r++)
    for (let c = 0; c < S; c++)
      if (canPlace(board, piece, r, c)) return true;
  return false;
}

// ─── Persistence ──────────────────────────────────────────────────────────────
function getHistory() {
  try {
    return JSON.parse(localStorage.getItem("bc_history") || "[]");
  } catch {
    return [];
  }
}

function saveHistory(lines) {
  const h = getHistory();
  const d = today();
  const idx = h.findIndex((x) => x.d === d);
  if (idx >= 0) {
    if (lines > h[idx].l) h[idx].l = lines;
  } else {
    h.unshift({ d, l: lines });
  }
  const trimmed = h.slice(0, 30);
  try {
    localStorage.setItem("bc_history", JSON.stringify(trimmed));
  } catch {}
  return trimmed;
}

// ─── MiniPiece ────────────────────────────────────────────────────────────────
function MiniPiece({ piece, size, opacity = 1 }) {
  const rows = piece.shape.length;
  const cols = Math.max(...piece.shape.map((r) => r.length));
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, ${size}px)`,
        gridTemplateRows: `repeat(${rows}, ${size}px)`,
        gap: 1,
        opacity,
      }}
    >
      {piece.shape.map((row, r) =>
        row.map((cell, c) => (
          <div
            key={`${r}-${c}`}
            style={{
              width: size,
              height: size,
              borderRadius: 1,
              background: cell ? (piece.v ? C.fill1 : C.fill0) : "transparent",
            }}
          />
        ))
      )}
    </div>
  );
}

// ─── HistoryBar ───────────────────────────────────────────────────────────────
function HistoryBar({ history, large = false }) {
  const items = [...history].slice(0, 7).reverse();
  if (!items.length) return null;
  const maxL = Math.max(...items.map((h) => h.l), 1);
  const maxH = large ? 48 : 24;
  const barW = large ? 20 : 8;
  const todayStr = today();

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <div style={{ display: "flex", gap: large ? 8 : 4, alignItems: "flex-end", height: maxH }}>
        {items.map((h, i) => {
          const isToday = h.d === todayStr;
          const barH = Math.max(Math.round((h.l / maxL) * maxH), 2);
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              <div
                style={{
                  width: barW,
                  height: barH,
                  background: isToday ? C.fill1 : C.dim,
                  borderRadius: 1,
                }}
              />
              {large && (
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 9,
                    color: isToday ? C.muted : C.dim,
                  }}
                >
                  {h.l}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {large && (
        <div
          style={{
            fontFamily: MONO,
            fontSize: 9,
            color: C.dim,
            letterSpacing: 2,
            textTransform: "uppercase",
          }}
        >
          past sessions
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function BlockChallenge() {
  const [board,   setBoard]   = useState(emptyBoard);
  const [queue,   setQueue]   = useState(makeQueue);
  const [turn,    setTurn]    = useState(0);
  const [lines,   setLines]   = useState(0);
  const [phase,   setPhase]   = useState("playing"); // 'playing' | 'ended'
  const [hover,   setHover]   = useState(null);      // { r, c }
  const [flash,   setFlash]   = useState(new Set());
  const [history, setHistory] = useState(getHistory);

  // Ref to avoid stale closure in useEffect
  const linesRef = useRef(0);
  useEffect(() => { linesRef.current = lines; }, [lines]);

  const current  = turn < T ? queue[turn] : null;
  const upcoming = queue.slice(turn + 1, turn + 4);

  // Auto-end if current piece has no valid position on the board
  useEffect(() => {
    if (phase === "playing" && current && !hasRoom(board, current)) {
      finish(linesRef.current);
    }
  }, [turn, board]); // eslint-disable-line react-hooks/exhaustive-deps

  function finish(finalLines) {
    const h = saveHistory(finalLines);
    setHistory(h);
    setPhase("ended");
  }

  function handleClick(r, c) {
    if (phase !== "playing" || !current) return;
    if (!canPlace(board, current, r, c)) return;

    const placed = place(board, current, r, c);
    const { board: cleared, lines: newL } = clearLines(placed);

    // Collect flash cells (cells that were cleared)
    const f = new Set();
    for (let rr = 0; rr < S; rr++)
      for (let cc = 0; cc < S; cc++)
        if (placed[rr][cc] && !cleared[rr][cc]) f.add(`${rr}-${cc}`);

    if (f.size) {
      setFlash(f);
      setTimeout(() => setFlash(new Set()), 280);
    }

    const totalLines = lines + newL;
    const nextTurn   = turn + 1;

    setBoard(cleared);
    setLines(totalLines);
    setTurn(nextTurn);
    setHover(null);

    if (nextTurn >= T) {
      finish(totalLines);
    }
  }

  function restart() {
    setBoard(emptyBoard());
    setQueue(makeQueue());
    setTurn(0);
    setLines(0);
    setPhase("playing");
    setHover(null);
    setFlash(new Set());
  }

  // Build preview / invalid overlay sets
  const previewSet = new Set();
  const invalidSet = new Set();
  if (hover && current && phase === "playing") {
    const ok = canPlace(board, current, hover.r, hover.c);
    current.shape.forEach((row, ri) =>
      row.forEach((cell, ci) => {
        if (cell) {
          const k = `${hover.r + ri}-${hover.c + ci}`;
          ok ? previewSet.add(k) : invalidSet.add(k);
        }
      })
    );
  }

  const boardW = S * CELL + (S - 1) * 2 + 16; // board pixel width

  return (
    <div
      style={{
        background: C.bg,
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: SANS,
        padding: "24px 16px",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0);   }
        }
        button:hover { opacity: 0.75; }
      `}</style>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 18,
          position: "relative",
          width: boardW,
        }}
      >
        {/* ── Header ──────────────────────────────────────────── */}
        <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 9,
                color: C.muted,
                letterSpacing: 3,
                textTransform: "uppercase",
                marginBottom: 4,
              }}
            >
              Block Challenge
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
              <span style={{ fontFamily: MONO, fontSize: 22, fontWeight: 500, color: C.text, lineHeight: 1 }}>
                {turn}
              </span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: C.dim }}>/ {T}</span>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 9,
                color: C.muted,
                letterSpacing: 3,
                textTransform: "uppercase",
                marginBottom: 4,
              }}
            >
              Lines
            </div>
            <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 500, color: C.text, lineHeight: 1 }}>
              {lines}
            </div>
          </div>
        </div>

        {/* ── Progress bar ─────────────────────────────────────── */}
        <div style={{ width: "100%", height: 2, background: C.empty, borderRadius: 1 }}>
          <div
            style={{
              height: 2,
              width: `${(turn / T) * 100}%`,
              background: C.fill1,
              borderRadius: 1,
              transition: "width 0.2s ease",
            }}
          />
        </div>

        {/* ── Piece queue ──────────────────────────────────────── */}
        <div
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 14,
            height: 30,
          }}
        >
          {current && (
            <>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 9,
                  color: C.muted,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                }}
              >
                Now
              </span>
              <MiniPiece piece={current} size={14} />
              <div style={{ flex: 1 }} />
              <div style={{ width: 1, height: 18, background: C.border }} />
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 9,
                  color: C.dim,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                }}
              >
                Next
              </span>
              {upcoming.map((p, i) => (
                <MiniPiece key={i} piece={p} size={11} opacity={0.9 - i * 0.22} />
              ))}
            </>
          )}
        </div>

        {/* ── Board ────────────────────────────────────────────── */}
        <div
          style={{ background: C.board, padding: 8, borderRadius: 4, position: "relative" }}
          onMouseLeave={() => setHover(null)}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${S}, ${CELL}px)`,
              gridTemplateRows: `repeat(${S}, ${CELL}px)`,
              gap: 2,
            }}
          >
            {board.map((row, r) =>
              row.map((cell, c) => {
                const k         = `${r}-${c}`;
                const isFlash   = flash.has(k);
                const isPreview = previewSet.has(k);
                const isInvalid = invalidSet.has(k);

                let bg = C.empty;
                if      (isFlash)    bg = C.flash;
                else if (cell === 1) bg = C.fill0;
                else if (cell === 2) bg = C.fill1;
                else if (isPreview)  bg = C.preview + "aa";
                else if (isInvalid)  bg = C.invalid + "88";

                return (
                  <div
                    key={k}
                    style={{
                      width: CELL,
                      height: CELL,
                      borderRadius: 2,
                      background: bg,
                      cursor: phase === "playing" ? "pointer" : "default",
                      transition: "background 0.07s",
                    }}
                    onClick={() => handleClick(r, c)}
                    onMouseEnter={() => phase === "playing" && setHover({ r, c })}
                  />
                );
              })
            )}
          </div>
        </div>

        {/* ── History bar ──────────────────────────────────────── */}
        <HistoryBar history={history} />

        {/* ── Hint ─────────────────────────────────────────────── */}
        <div
          style={{
            fontFamily: MONO,
            fontSize: 9,
            color: C.dim,
            letterSpacing: 2,
            textTransform: "uppercase",
          }}
        >
          {phase === "playing" ? `Place piece · ${T - turn} left` : ""}
        </div>

        {/* ── End-screen overlay ───────────────────────────────── */}
        {phase === "ended" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(8,14,8,0.96)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 4,
              animation: "fadeUp 0.25s ease",
              zIndex: 10,
            }}
          >
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 9,
                  color: C.muted,
                  letterSpacing: 4,
                  textTransform: "uppercase",
                  marginBottom: 20,
                }}
              >
                Round complete
              </div>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 72,
                  fontWeight: 500,
                  color: C.text,
                  lineHeight: 1,
                  marginBottom: 2,
                }}
              >
                {lines}
              </div>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 9,
                  color: C.muted,
                  letterSpacing: 3,
                  textTransform: "uppercase",
                  marginBottom: 28,
                }}
              >
                Lines cleared
              </div>
              <HistoryBar history={history} large />
              <button
                onClick={restart}
                style={{
                  display: "block",
                  margin: "28px auto 0",
                  fontFamily: MONO,
                  fontSize: 9,
                  letterSpacing: 3,
                  textTransform: "uppercase",
                  background: "transparent",
                  border: `1px solid ${C.border}`,
                  color: C.muted,
                  padding: "10px 28px",
                  borderRadius: 2,
                  cursor: "pointer",
                }}
              >
                Try again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}