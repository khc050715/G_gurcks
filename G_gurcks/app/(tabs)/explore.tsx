import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Dimensions,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── Config ───────────────────────────────────────────────────────────────────
const S    = 8;   // Board size
const T    = 20;  // Total turns per session

const { width: SCREEN_W } = Dimensions.get("window");
// Cell size: fit 8 cells + gaps + padding within screen
const CELL = Math.floor((Math.min(SCREEN_W, 420) - 48) / S - 2);

// ─── Pieces ───────────────────────────────────────────────────────────────────
const PIECES = [
  { shape: [[1]],                         v: 0 },
  { shape: [[1, 1]],                      v: 0 },
  { shape: [[1], [1]],                    v: 0 },
  { shape: [[1, 1, 1]],                   v: 1 },
  { shape: [[1], [1], [1]],              v: 1 },
  { shape: [[1, 1], [1, 1]],             v: 0 },
  { shape: [[1, 0], [1, 1]],             v: 0 },
  { shape: [[0, 1], [1, 1]],             v: 1 },
  { shape: [[1, 1], [1, 0]],             v: 1 },
  { shape: [[1, 1], [0, 1]],             v: 0 },
  { shape: [[1, 1, 1], [0, 1, 0]],       v: 1 },
  { shape: [[1, 0], [1, 0], [1, 1]],     v: 0 },
  { shape: [[0, 1], [0, 1], [1, 1]],     v: 1 },
  { shape: [[1, 1, 1, 1]],               v: 1 },
  { shape: [[1], [1], [1], [1]],         v: 1 },
];

// ─── Themes ───────────────────────────────────────────────────────────────────
const THEMES = {
  forest: {
    name: "FOREST",
    bg:      "#080e08",
    board:   "#0c150c",
    empty:   "#111c11",
    fill0:   "#3a6a3a",
    fill1:   "#4d8a4d",
    flash:   "#8fc98f",
    preview: "#3a6a3a",
    invalid: "#4a1a1a",
    text:    "#8fc98f",
    muted:   "#2e5c2e",
    dim:     "#1a3a1a",
    border:  "#162616",
  },
  rams: {
    name: "RAMS",
    // Dieter Rams / Braun-inspired: warm off-white, charcoal, accent orange
    bg:      "#f0ede8",
    board:   "#e4e0d8",
    empty:   "#d6d1c8",
    fill0:   "#1a1a1a",
    fill1:   "#3a3a3a",
    flash:   "#e05a00",
    preview: "#1a1a1a",
    invalid: "#e05a0033",
    text:    "#1a1a1a",
    muted:   "#6b6560",
    dim:     "#b0ab9f",
    border:  "#c8c2b8",
  },
};

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
      if (cell) b[row + ri][col + ci] = piece.v + 1;
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

// ─── Persistence (AsyncStorage) ───────────────────────────────────────────────
const HISTORY_KEY = "bc_history_v2";

async function getHistory() {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveHistory(lines) {
  const h = await getHistory();
  const d = today();
  const idx = h.findIndex((x) => x.d === d);
  if (idx >= 0) {
    if (lines > h[idx].l) h[idx].l = lines;
  } else {
    h.unshift({ d, l: lines });
  }
  const trimmed = h.slice(0, 30);
  try {
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  } catch {}
  return trimmed;
}

// ─── MiniPiece ────────────────────────────────────────────────────────────────
function MiniPiece({ piece, size, opacity = 1, C }) {
  return (
    <View style={{ opacity, flexDirection: "column" }}>
      {piece.shape.map((row, r) => (
        <View key={r} style={{ flexDirection: "row" }}>
          {row.map((cell, c) => (
            <View
              key={c}
              style={{
                width: size,
                height: size,
                borderRadius: 1,
                margin: 0.5,
                backgroundColor: cell
                  ? piece.v ? C.fill1 : C.fill0
                  : "transparent",
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

// ─── HistoryBar ───────────────────────────────────────────────────────────────
function HistoryBar({ history, large = false, C }) {
  const items = [...history].slice(0, 7).reverse();
  if (!items.length) return null;
  const maxL  = Math.max(...items.map((h) => h.l), 1);
  const maxH  = large ? 48 : 24;
  const barW  = large ? 20 : 8;
  const todayStr = today();

  return (
    <View style={{ alignItems: "center", gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: maxH, gap: large ? 8 : 4 }}>
        {items.map((h, i) => {
          const isToday = h.d === todayStr;
          const barH = Math.max(Math.round((h.l / maxL) * maxH), 2);
          return (
            <View key={i} style={{ alignItems: "center", gap: 3 }}>
              <View
                style={{
                  width: barW,
                  height: barH,
                  backgroundColor: isToday ? C.fill1 : C.dim,
                  borderRadius: 1,
                }}
              />
              {large && (
                <Text style={{ fontSize: 9, color: isToday ? C.muted : C.dim, fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace" }}>
                  {h.l}
                </Text>
              )}
            </View>
          );
        })}
      </View>
      {large && (
        <Text style={{ fontSize: 9, color: C.dim, letterSpacing: 2, fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace" }}>
          PAST SESSIONS
        </Text>
      )}
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function BlockChallenge() {
  const [board,     setBoard]     = useState(emptyBoard);
  const [queue,     setQueue]     = useState(makeQueue);
  const [turn,      setTurn]      = useState(0);
  const [lines,     setLines]     = useState(0);
  const [phase,     setPhase]     = useState("playing");
  const [selected,  setSelected]  = useState(null); // unused, kept for overlay sets
  const [flash,     setFlash]     = useState(new Set());
  const [history,   setHistory]   = useState([]);
  const [themeKey,  setThemeKey]  = useState("forest");

  const C = THEMES[themeKey];
  const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";

  const linesRef = useRef(0);
  useEffect(() => { linesRef.current = lines; }, [lines]);

  // Load history on mount
  useEffect(() => {
    getHistory().then(setHistory);
  }, []);

  const current  = turn < T ? queue[turn] : null;
  const upcoming = queue.slice(turn + 1, turn + 4);

  // Auto-end if no room
  useEffect(() => {
    if (phase === "playing" && current && !hasRoom(board, current)) {
      finish(linesRef.current);
    }
  }, [turn, board]); // eslint-disable-line

  async function finish(finalLines) {
    const h = await saveHistory(finalLines);
    setHistory(h);
    setPhase("ended");
  }

  function handleCellPress(r, c) {
    if (phase !== "playing" || !current) return;
    if (!canPlace(board, current, r, c)) return;
    doPlace(r, c);
  }

  function doPlace(r, c) {
    if (!current) return;
    const placed = place(board, current, r, c);
    const { board: cleared, lines: newL } = clearLines(placed);

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
    setSelected(null);

    if (nextTurn >= T) finish(totalLines);
  }

  function restart() {
    setBoard(emptyBoard());
    setQueue(makeQueue());
    setTurn(0);
    setLines(0);
    setPhase("playing");
    setSelected(null);
    setFlash(new Set());
  }

  function toggleTheme() {
    setThemeKey((k) => (k === "forest" ? "rams" : "forest"));
  }

  // Build preview / invalid sets
  const previewSet = new Set();
  const invalidSet = new Set();
  if (selected && current && phase === "playing") {
    const ok = canPlace(board, current, selected.r, selected.c);
    current.shape.forEach((row, ri) =>
      row.forEach((cell, ci) => {
        if (cell) {
          const k = `${selected.r + ri}-${selected.c + ci}`;
          ok ? previewSet.add(k) : invalidSet.add(k);
        }
      })
    );
  }

  const boardPx = CELL * S + 2 * (S - 1) + 16;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={styles.scroll}
      scrollEnabled={false}
    >
      <View style={[styles.container, { width: boardPx }]}>

        {/* ── Header ───────────────────────────────────────────── */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.label, { color: C.muted, fontFamily: MONO }]}>
              BLOCK CHALLENGE
            </Text>
            <View style={styles.row}>
              <Text style={[styles.bigNum, { color: C.text, fontFamily: MONO }]}>{turn}</Text>
              <Text style={[styles.dimNum, { color: C.dim, fontFamily: MONO }]}>/ {T}</Text>
            </View>
          </View>
          <View style={{ alignItems: "flex-end", gap: 6 }}>
            {/* Theme toggle */}
            <TouchableOpacity
              onPress={toggleTheme}
              activeOpacity={0.7}
              style={[styles.themeBtn, { borderColor: C.border }]}
            >
              <Text style={[styles.themeBtnText, { color: C.muted, fontFamily: MONO }]}>
                {C.name}
              </Text>
            </TouchableOpacity>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={[styles.label, { color: C.muted, fontFamily: MONO }]}>LINES</Text>
              <Text style={[styles.bigNum, { color: C.text, fontFamily: MONO }]}>{lines}</Text>
            </View>
          </View>
        </View>

        {/* ── Progress bar ─────────────────────────────────────── */}
        <View style={[styles.progressTrack, { backgroundColor: C.empty }]}>
          <View
            style={[
              styles.progressFill,
              { width: `${(turn / T) * 100}%`, backgroundColor: C.fill1 },
            ]}
          />
        </View>

        {/* ── Piece queue ──────────────────────────────────────── */}
        {current && (
          <View style={[styles.queue, { borderColor: C.border }]}>
            <Text style={[styles.label, { color: C.muted, fontFamily: MONO }]}>NOW</Text>
            <MiniPiece piece={current} size={14} C={C} />
            <View style={[styles.divider, { backgroundColor: C.border }]} />
            <Text style={[styles.label, { color: C.dim, fontFamily: MONO }]}>NEXT</Text>
            {upcoming.map((p, i) => (
              <MiniPiece key={i} piece={p} size={11} opacity={0.9 - i * 0.22} C={C} />
            ))}
          </View>
        )}

        {/* ── Board ────────────────────────────────────────────── */}
        <View style={[styles.boardWrap, { backgroundColor: C.board }]}>
          {board.map((row, r) => (
            <View key={r} style={styles.boardRow}>
              {row.map((cell, c) => {
                const k         = `${r}-${c}`;
                const isFlash   = flash.has(k);
                const isPreview = previewSet.has(k);
                const isInvalid = invalidSet.has(k);
                const isSel     = selected?.r === r && selected?.c === c;

                let bg = C.empty;
                if      (isFlash)   bg = C.flash;
                else if (cell === 1) bg = C.fill0;
                else if (cell === 2) bg = C.fill1;
                else if (isPreview)  bg = C.preview + "bb";
                else if (isInvalid)  bg = C.invalid;

                return (
                  <TouchableOpacity
                    key={k}
                    activeOpacity={0.85}
                    onPress={() => handleCellPress(r, c)}
                    style={[
                      styles.cell,
                      {
                        width: CELL,
                        height: CELL,
                        backgroundColor: bg,
                        borderWidth: isSel ? 1.5 : 0,
                        borderColor: isSel ? C.text : "transparent",
                      },
                    ]}
                  />
                );
              })}
            </View>
          ))}
        </View>

        {/* ── History bar ──────────────────────────────────────── */}
        <HistoryBar history={history} C={C} />

        {/* ── Hint ─────────────────────────────────────────────── */}
        <Text style={[styles.hint, { color: C.dim, fontFamily: MONO }]}>
          {phase === "playing"
            ? selected
              ? "TAP SAME CELL TO PLACE"
              : `TAP CELL TO PREVIEW · ${T - turn} LEFT`
            : ""}
        </Text>

        {/* ── End-screen overlay ───────────────────────────────── */}
        {phase === "ended" && (
          <View style={[styles.overlay, { backgroundColor: C.bg + "f5" }]}>
            <Text style={[styles.label, { color: C.muted, fontFamily: MONO, letterSpacing: 4, marginBottom: 20 }]}>
              ROUND COMPLETE
            </Text>
            <Text style={[styles.finalScore, { color: C.text, fontFamily: MONO }]}>{lines}</Text>
            <Text style={[styles.label, { color: C.muted, fontFamily: MONO, letterSpacing: 3, marginBottom: 28 }]}>
              LINES CLEARED
            </Text>
            <HistoryBar history={history} large C={C} />
            <TouchableOpacity
              onPress={restart}
              activeOpacity={0.7}
              style={[styles.retryBtn, { borderColor: C.border }]}
            >
              <Text style={[styles.retryText, { color: C.muted, fontFamily: MONO }]}>
                TRY AGAIN
              </Text>
            </TouchableOpacity>
          </View>
        )}

      </View>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  container: {
    alignItems: "center",
    gap: 16,
    position: "relative",
  },
  header: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  row: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 3,
  },
  label: {
    fontSize: 9,
    letterSpacing: 3,
    marginBottom: 4,
  },
  bigNum: {
    fontSize: 22,
    fontWeight: "500",
    lineHeight: 26,
  },
  dimNum: {
    fontSize: 11,
  },
  themeBtn: {
    borderWidth: 1,
    borderRadius: 2,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  themeBtnText: {
    fontSize: 8,
    letterSpacing: 2,
  },
  progressTrack: {
    width: "100%",
    height: 2,
    borderRadius: 1,
    overflow: "hidden",
  },
  progressFill: {
    height: 2,
    borderRadius: 1,
  },
  queue: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    height: 34,
    borderBottomWidth: 1,
    paddingBottom: 8,
  },
  divider: {
    width: 1,
    height: 18,
    marginHorizontal: 2,
  },
  boardWrap: {
    padding: 8,
    borderRadius: 4,
    gap: 2,
  },
  boardRow: {
    flexDirection: "row",
    gap: 2,
  },
  cell: {
    borderRadius: 2,
  },
  hint: {
    fontSize: 9,
    letterSpacing: 2,
    marginTop: 4,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
    zIndex: 10,
  },
  finalScore: {
    fontSize: 72,
    fontWeight: "500",
    lineHeight: 80,
    marginBottom: 4,
  },
  retryBtn: {
    marginTop: 28,
    borderWidth: 1,
    borderRadius: 2,
    paddingHorizontal: 28,
    paddingVertical: 10,
  },
  retryText: {
    fontSize: 9,
    letterSpacing: 3,
  },
});