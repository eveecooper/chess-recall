import { Chessground } from "@lichess-org/chessground";
import type { Api } from "@lichess-org/chessground/api";
import type { Key, Piece } from "@lichess-org/chessground/types";
import { parseSquare, makeSquare } from "chessops/util";
import { chessgroundDests } from "chessops/compat";
import { parseFen } from "chessops/fen";
import type { NormalMove, Role } from "chessops/types";
import { importText, type Chapter } from "./core/library";
import { Session, type Options } from "./core/session";
import { validateSan } from "./core/notation";
import { gradeFen } from "./core/grader";
import * as storage from "./storage";
import * as lichess from "./lichess";
import "@lichess-org/chessground/assets/chessground.base.css";
import "@lichess-org/chessground/assets/chessground.cburnett.css";
import "./style.css";
const $ = <T extends HTMLElement = HTMLElement>(s: string) =>
  document.querySelector<T>(s)!;
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const empty = "8/8/8/8/8/8/8/8";
const samples = [
  ...importText(
    '[Event "The Italian opening"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d3 *',
  ),
  ...importText("8/5pk1/6p1/3P4/8/5K2/8/8 w - - 0 1"),
  ...importText(
    '[Event "A quick checkmate"]\n\n1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0',
  ),
];
samples[1].title = "King and pawn ending";
let libraries: storage.Library[] = [
    { id: "local", name: "On this device", chapters: samples },
  ],
  selected = "local",
  current = -1,
  session: Session | undefined,
  ground: Api | undefined,
  mini: Api[] = [],
  revealGround: Api | undefined,
  orientation: "white" | "black" = "white",
  flipTurn = false,
  options: Options = { check: "each", side: "both" },
  editor = empty,
  palette: Piece | "hand" | "trash" = "hand",
  fenGrade: ReturnType<typeof gradeFen> | undefined,
  revealIndex = 0,
  busy = false;
const library = () => libraries.find((l) => l.id === selected) || libraries[0];
const chapter = () => library().chapters[current];
const message = (text: string) => {
  $("#global-status").textContent = text;
};
const persist = async () => {
  try {
    await storage.save({ libraries, selected });
  } catch {
    message(
      "Your browser could not save the library. Export a backup before closing.",
    );
  }
};
const safe = async (fn: () => Promise<void>) => {
  if (busy) return;
  busy = true;
  try {
    await fn();
  } catch (e) {
    message(e instanceof Error ? e.message : String(e));
  } finally {
    busy = false;
  }
};
$("#app").innerHTML =
  `<header><a class="brand" href="#">♞ <span>CHESS RECALL</span></a><span class="header-note">A little practice. A lasting memory.</span><button id="login">Sign in with Lichess</button></header><main><div id="global-status" role="status" aria-live="polite"></div><section id="view"></section><section class="import-panel"><div><span class="eyebrow">GROW YOUR LIBRARY</span><h2>Keep a position worth remembering.</h2><p>Paste a game (PGN) or a position (FEN). Each becomes a new recall test.</p></div><form id="import"><label for="title">Chapter name <span class="muted">optional</span></label><input id="title" placeholder="e.g. My favourite endgame" maxlength="100"><label for="paste">PGN or FEN</label><textarea id="paste" rows="3" required placeholder="1. e4 e5 2. Nf3 Nc6 …"></textarea><div class="row"><button class="primary" type="submit">Add to library <span>＋</span></button><label class="file-label">Import file<input type="file" id="file" accept=".pgn,.fen,.txt" hidden></label></div><small id="save-destination"></small></form></section></main><footer><span>Made for the pleasure of knowing the board.</span><span><a href="https://github.com/eveecooper/chess-recall" target="_blank" rel="noopener">Source code · GPL-3.0-or-later</a> · Powered by Lichess libraries</span></footer>`;
$(".brand").onclick = (e) => {
  e.preventDefault();
  current = -1;
  render();
};
$("#login").onclick = () =>
  safe(async () => {
    if (lichess.signedIn()) {
      await lichess.logout();
      message("Signed out. Cached studies remain on this device.");
      render();
    } else await lichess.login();
  });
$("#file").onchange = () =>
  safe(async () => {
    const file = $<HTMLInputElement>("#file").files?.[0];
    if (file) $("#paste").textContent = "";
    if (file) $<HTMLTextAreaElement>("#paste").value = await file.text();
  });
$("#import").onsubmit = (e) => {
  e.preventDefault();
  void safe(async () => {
    const raw = $<HTMLTextAreaElement>("#paste").value;
    const added = importText(raw);
    const title = $<HTMLInputElement>("#title").value.trim();
    if (title && added.length === 1) added[0].title = title;
    if (selected !== "local") {
      if (!lichess.signedIn())
        throw Error("Sign in to save to Lichess, or select “On this device”.");
      if (library().chapters.length + added.length > 64)
        throw Error(
          "This study would exceed 64 chapters. Choose another study.",
        );
      await lichess.addChapter(
        selected,
        /^[prnbqkPRNBQK1-8]+\//.test(raw.trim()) ? added[0].pgn : raw,
        title,
      );
      try {
        library().chapters = importText(await lichess.readStudy(selected));
      } catch {
        message(
          "Saved on Lichess. Refresh the study to load the new chapters.",
        );
        return;
      }
    } else library().chapters.push(...added);
    await persist();
    current = -1;
    render();
    $<HTMLFormElement>("#import").reset();
    message(
      `${added.length} ${added.length === 1 ? "chapter" : "chapters"} added.`,
    );
  });
};
function render() {
  ground?.destroy();
  ground = undefined;
  revealGround?.destroy();
  revealGround = undefined;
  mini.forEach((g) => g.destroy());
  mini = [];
  $("#login").textContent = lichess.signedIn()
    ? "Sign out of Lichess"
    : "Sign in with Lichess";
  $("#save-destination").textContent =
    `Saving to: ${library().name}${selected === "local" ? " · stored in this browser" : ""}`;
  if (current < 0) renderLibrary();
  else renderTest();
}
function renderLibrary() {
  $("#view").innerHTML =
    `<div class="hero"><span class="eyebrow">YOUR PERSONAL CHESS MEMORY</span><h1>Make the board<br><em>second nature.</em></h1><p>Study a position. Look away. See what stays.</p></div><div class="library-heading"><div><span class="eyebrow">THE COLLECTION</span><h2>Your recall library <span class="count">${library().chapters.length}</span></h2></div><div class="row"><select id="libraries" aria-label="Choose library">${libraries.map((l) => `<option value="${escape(l.id)}" ${l.id === selected ? "selected" : ""}>${escape(l.name)}</option>`).join("")}</select><button id="export">Export PGN</button></div></div><details class="connect"><summary>Connect a Lichess study</summary><p>One study, one chapter per test. Your last library is available here even offline.</p><form id="study-form" class="row"><input id="study-url" aria-label="Lichess study URL" placeholder="https://lichess.org/study/…" required><button>Open study</button></form>${lichess.signedIn() ? '<button id="my-studies">Find my studies</button><div id="study-list"></div>' : ""}<a href="https://lichess.org/study" target="_blank" rel="noopener">Create or manage studies on Lichess ↗</a>${selected !== "local" ? '<button id="refresh">Refresh this study</button>' : ""}</details><div class="grid">${
      library()
        .chapters.map(
          (c, i) =>
            `<button class="chapter-card" data-index="${i}" aria-label="Practice ${escape(c.title)}"><div class="thumbnail" id="thumb-${i}"></div><div class="card-caption"><span class="eyebrow">${c.kind === "pgn" ? `${c.moves.length} HALF-MOVES · GAMEPLAY` : "POSITION · BOARD STATE"}</span><h3>${escape(c.title)}</h3><span class="practice">Practice recall <span>↗</span></span></div></button>`,
        )
        .join("") ||
      "<p>Your library is empty. Add a PGN or FEN below to begin.</p>"
    }</div>`;
  library().chapters.forEach((c, i) =>
    mini.push(
      Chessground($(`#thumb-${i}`), {
        fen: c.answer,
        viewOnly: true,
        coordinates: false,
        drawable: { enabled: false },
        animation: { enabled: false },
      }),
    ),
  );
  document
    .querySelectorAll<HTMLButtonElement>(".chapter-card")
    .forEach((b) => (b.onclick = () => start(Number(b.dataset.index))));
  $("#libraries").onchange = () => {
    selected = $<HTMLSelectElement>("#libraries").value;
    void persist();
    render();
  };
  $("#study-form").onsubmit = (e) => {
    e.preventDefault();
    void safe(async () =>
      openStudy(lichess.studyId($<HTMLInputElement>("#study-url").value)),
    );
  };
  if ($("#refresh"))
    $("#refresh").onclick = () =>
      safe(async () => openStudy(selected, library().name));
  if ($("#my-studies"))
    $("#my-studies").onclick = () =>
      safe(async () => {
        const studies = await lichess.studies();
        $("#study-list").innerHTML =
          studies
            .map(
              (s) =>
                `<button data-study="${escape(s.id)}">${escape(s.name)}</button>`,
            )
            .join("") ||
          "<p>No studies yet. Create one on Lichess using the link below.</p>";
        document
          .querySelectorAll<HTMLButtonElement>("[data-study]")
          .forEach(
            (b) =>
              (b.onclick = () =>
                safe(async () => openStudy(b.dataset.study!, b.textContent!))),
          );
      });
  $("#export").onclick = () => {
    const blob = new Blob(
      [
        library()
          .chapters.map((c) => c.pgn)
          .join("\n\n"),
      ],
      { type: "application/x-chess-pgn" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "chess-recall.pgn";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
}
async function openStudy(id: string, name = `Study ${id}`) {
  const chapters = importText(await lichess.readStudy(id));
  const old = libraries.find((l) => l.id === id);
  if (old) old.chapters = chapters;
  else libraries.push({ id, name, chapters });
  selected = id;
  current = -1;
  await persist();
  render();
  message("Study loaded.");
}
function start(index: number) {
  current = index;
  const c = chapter();
  session = c.kind === "pgn" ? new Session(c, { ...options }) : undefined;
  editor = empty;
  fenGrade = undefined;
  palette = "hand";
  revealIndex = 0;
  render();
}
function renderTest() {
  const c = chapter(),
    isPgn = c.kind === "pgn";
  $("#view").innerHTML =
    `<div class="test-heading"><button id="back">← Library</button><span>${current + 1} / ${library().chapters.length}</span><div class="row"><button id="prev" aria-label="Previous chapter" ${current === 0 ? "disabled" : ""}>←</button><button id="next" aria-label="Next chapter" ${current === library().chapters.length - 1 ? "disabled" : ""}>→</button></div></div><div class="workspace"><section class="board-area"><span class="eyebrow">${isPgn ? "RECITE THE GAMEPLAY" : "RECITE THE BOARD STATE"}</span><h1>${escape(c.title)}</h1>${!isPgn ? '<div class="palette" id="black-palette"></div>' : ""}<div id="board" class="board"></div>${!isPgn ? '<div class="palette" id="white-palette"></div>' : ""}<div class="board-toolbar"><label><input id="flip" type="checkbox" ${orientation === "black" ? "checked" : ""}> Black’s perspective</label>${isPgn ? `<label><input id="flip-turn" type="checkbox" ${flipTurn ? "checked" : ""}> Flip each turn</label>` : ""}<a id="analysis" target="_blank" rel="noopener">Continue on Lichess ↗</a></div><p id="status" role="status" aria-live="polite"></p></section><aside><section class="panel"><span class="eyebrow">${isPgn ? "ONE MOVE AT A TIME" : "PIECE BY PIECE"}</span><h2>${isPgn ? "Find your rhythm." : "Rebuild what you remember."}</h2><p>${isPgn ? "Drag a piece or type a move. Take your time; the board is yours." : "Choose a piece, then tap a square to place it. Use the hand to move pieces."}</p>${isPgn ? `<div class="settings"><label>Check answers<select id="check"><option value="each" ${options.check === "each" ? "selected" : ""}>After each move</option><option value="end" ${options.check === "end" ? "selected" : ""}>At the end</option></select></label><label>Play as<select id="side"><option value="both">Both sides</option><option value="white" ${options.side === "white" ? "selected" : ""}>White · auto-play Black</option><option value="black" ${options.side === "black" ? "selected" : ""}>Black · auto-play White</option></select></label></div><form id="move-form"><label for="notation">Your move <span class="muted">strict SAN</span></label><div class="row"><input id="notation" placeholder="e.g. Nf3" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="primary">Play →</button></div></form><div id="promotion" hidden>Promote to: ${["queen", "rook", "bishop", "knight"].map((r) => `<button data-promotion="${r}">${r}</button>`).join("")}</div><div class="progress-track"><div id="progress"></div></div><small id="progress-text"></small>` : `<div class="row"><button id="hand">Hand</button><button id="trash">Trash</button><button id="clear">Clear board</button></div><button class="primary full" id="grade">Check position →</button>`}<div id="score" aria-live="polite"></div><button id="redo" class="full">↻ Start again</button></section><details id="reveal" class="panel"><summary>Reveal the answer <span>Peeking is free</span></summary><div class="reveal-board" id="reveal-board"></div>${isPgn ? '<div class="row"><button id="reveal-prev">← Previous</button><button id="reveal-next">Next →</button></div><div id="moves" class="move-list"></div>' : ""}</details></aside></div>`;
  $("#back").onclick = () => {
    current = -1;
    render();
  };
  $("#prev").onclick = () => start(current - 1);
  $("#next").onclick = () => start(current + 1);
  $("#redo").onclick = () => start(current);
  $("#flip").onchange = () => {
    orientation = $<HTMLInputElement>("#flip").checked ? "black" : "white";
    ground?.set({ orientation });
    revealGround?.set({ orientation });
  };
  if (isPgn) {
    $("#flip-turn").onchange = () => {
      flipTurn = $<HTMLInputElement>("#flip-turn").checked;
      updateBoard();
    };
    $("#check").onchange = () => {
      options.check = $<HTMLSelectElement>("#check").value as Options["check"];
      start(current);
    };
    $("#side").onchange = () => {
      options.side = $<HTMLSelectElement>("#side").value as Options["side"];
      start(current);
    };
    $("#move-form").onsubmit = (e) => {
      e.preventDefault();
      typed(true);
    };
    $("#notation").oninput = () => typed(false);
  } else {
    for (const color of ["black", "white"] as const) {
      const chars = color === "white" ? "♔♕♖♗♘♙" : "♚♛♜♝♞♟";
      $(`#${color}-palette`).innerHTML = [
        "king",
        "queen",
        "rook",
        "bishop",
        "knight",
      ]
        .concat("pawn")
        .map(
          (r, i) =>
            `<button data-role="${r}" data-color="${color}" aria-label="${color} ${r}">${chars[i]}</button>`,
        )
        .join("");
    }
    document.querySelectorAll<HTMLButtonElement>("[data-role]").forEach(
      (b) =>
        (b.onclick = () => {
          palette = {
            role: b.dataset.role as Piece["role"],
            color: b.dataset.color as Piece["color"],
          };
          setTool();
        }),
    );
    $("#hand").onclick = () => {
      palette = "hand";
      setTool();
    };
    $("#trash").onclick = () => {
      palette = "trash";
      setTool();
    };
    $("#clear").onclick = () => {
      editor = empty;
      fenGrade = undefined;
      ground?.set({ fen: empty });
      updateBoard();
    };
    $("#grade").onclick = () => {
      editor = ground!.getFen();
      fenGrade = gradeFen(c.answer, editor);
      updateBoard();
    };
  }
  ground = Chessground($("#board"), {
    fen: isPgn ? session!.fen : editor,
    orientation,
    autoCastle: isPgn,
    premovable: { enabled: false },
    drawable: { enabled: false },
    animation: { enabled: true, duration: 140 },
    movable: {
      free: !isPgn,
      color: isPgn ? session!.pos.turn : "both",
      showDests: false,
      events: {
        after: (from, to) => {
          if (isPgn) drag(from, to);
          else {
            editor = ground!.getFen();
            fenGrade = undefined;
            updateBoard();
          }
        },
      },
    },
    events: {
      select: (key) => {
        if (!isPgn && palette !== "hand") {
          ground!.setPieces(
            new Map([[key, palette === "trash" ? undefined : palette]]),
          );
          editor = ground!.getFen();
          fenGrade = undefined;
          updateBoard();
        }
      },
    },
    draggable: { deleteOnDropOff: !isPgn },
  });
  $("#reveal").ontoggle = () => {
    if ($<HTMLDetailsElement>("#reveal").open) {
      if (!revealGround)
        revealGround = Chessground($("#reveal-board"), {
          fen: isPgn ? c.start : c.answer,
          orientation,
          viewOnly: true,
          drawable: { enabled: false },
        });
      updateReveal();
    }
  };
  if (isPgn) {
    $("#reveal-prev").onclick = () => {
      revealIndex = Math.max(0, revealIndex - 1);
      updateReveal();
    };
    $("#reveal-next").onclick = () => {
      revealIndex = Math.min(c.moves.length, revealIndex + 1);
      updateReveal();
    };
  }
  updateBoard();
}
function setTool() {
  document
    .querySelectorAll<HTMLButtonElement>("[data-role]")
    .forEach((b) =>
      b.classList.toggle(
        "active",
        typeof palette === "object" &&
          b.dataset.role === palette.role &&
          b.dataset.color === palette.color,
      ),
    );
  $("#hand").classList.toggle("active", palette === "hand");
  $("#trash").classList.toggle("active", palette === "trash");
  ground?.set({ draggable: { enabled: palette === "hand" } });
}
function typed(commit: boolean) {
  if (!session || session.done) return;
  const input = $<HTMLInputElement>("#notation");
  const text = input.value.trim();
  if (!text) {
    $("#status").textContent = "";
    return;
  }
  const v = session.validate(text);
  if (!v.ok) {
    $("#status").textContent = v.message;
    if (commit && options.check === "each") session.attempted = true;
    if (commit && session.diverged && v.layer === "legality") {
      start(current);
      $("#status").textContent = "Invalid piece movement. Test restarted.";
    }
    return;
  }
  $("#status").textContent = "";
  if (commit) {
    if (session.submit(v.move)) input.value = "";
    updateBoard();
  }
}
function drag(from: Key, to: Key) {
  const s = session!;
  const move: NormalMove = { from: parseSquare(from)!, to: parseSquare(to)! };
  const piece = s.pos.board.get(move.from);
  if (piece?.role === "pawn" && (to[1] === "8" || to[1] === "1")) {
    ground!.set({ fen: s.fen });
    $("#promotion").hidden = false;
    document.querySelectorAll<HTMLButtonElement>("[data-promotion]").forEach(
      (b) =>
        (b.onclick = () => {
          move.promotion = b.dataset.promotion as Role;
          $("#promotion").hidden = true;
          s.submit(move);
          if (s.failed) {
            start(current);
            $("#status").textContent =
              "Invalid piece movement. Test restarted.";
          } else updateBoard();
        }),
    );
    return;
  }
  s.submit(move);
  if (s.failed) {
    start(current);
    $("#status").textContent = "Invalid piece movement. Test restarted.";
  } else updateBoard();
}
function updateBoard() {
  if (!ground) return;
  const c = chapter();
  if (c.kind === "pgn") {
    const s = session!;
    if (flipTurn) {
      orientation = s.pos.turn;
      $<HTMLInputElement>("#flip").checked = orientation === "black";
    }
    ground.set({
      fen: s.fen,
      orientation,
      turnColor: s.pos.turn,
      movable: {
        color: s.done || s.failed ? undefined : s.pos.turn,
        free: s.diverged,
        dests: s.diverged ? undefined : chessgroundDests(s.pos),
      },
      viewOnly: s.done || s.failed,
    });
    $("#status").textContent =
      s.status ||
      (s.done
        ? "Test complete."
        : `${s.pos.turn === "white" ? "White" : "Black"} to move`);
    $("#progress").style.width = `${(s.index / c.moves.length) * 100}%`;
    $("#progress-text").textContent =
      `${s.index} of ${c.moves.length} half-moves`;
    $<HTMLInputElement>("#notation").disabled = s.done || s.failed;
    if (s.done) {
      $("#score").innerHTML =
        `<div class="score-value">${Math.round(s.score.percent)}<span>%</span></div><p>${s.score.correct} of ${s.score.total} moves correct${options.check === "each" ? " on the first try" : ""}.</p>${options.check === "end" ? `<div class="attempt-list">${s.results.map((r) => `<span class="${r.correct ? "" : "incorrect"}">${r.index + 1}. ${escape(r.san)} ${r.correct ? "✓" : "×"}</span>`).join("")}</div>` : ""}`;
    }
  } else {
    const missed = fenGrade?.missed || [];
    ground.set({
      highlight: {
        custom: new Map(missed.map((s) => [s as Key, "wrong-square"])),
      },
    });
    $("#status").textContent = fenGrade
      ? `${missed.length} missed squares. Correct the red squares and check again.`
      : "";
    $("#score").innerHTML = fenGrade
      ? `<div class="score-value">${Math.round(fenGrade.percent)}<span>%</span></div><p>${fenGrade.correct} / ${fenGrade.total} pieces correct · ${missed.length} missed squares</p>`
      : "";
  }
  $<HTMLAnchorElement>("#analysis").href =
    "https://lichess.org/analysis/" +
    encodeURIComponent(
      c.kind === "pgn" ? session!.fen : ground.getFen() + " w - - 0 1",
    );
}
function updateReveal() {
  const c = chapter();
  if (c.kind === "fen") return;
  revealGround?.set({
    fen: revealIndex ? c.moves[revealIndex - 1].after : c.start,
    orientation,
  });
  $("#moves").innerHTML = c.moves
    .map(
      (m, i) =>
        `<button data-ply="${i + 1}" class="${revealIndex === i + 1 ? "active" : ""}">${parseFen(m.before).unwrap().fullmoves}${m.color === "white" ? "." : "…"} ${escape(m.san)}</button>`,
    )
    .join("");
  document.querySelectorAll<HTMLButtonElement>("[data-ply]").forEach(
    (b) =>
      (b.onclick = () => {
        revealIndex = Number(b.dataset.ply);
        updateReveal();
      }),
  );
  $<HTMLButtonElement>("#reveal-prev").disabled = revealIndex === 0;
  $<HTMLButtonElement>("#reveal-next").disabled =
    revealIndex === c.moves.length;
}
async function boot() {
  try {
    const cached = await storage.load();
    if (cached) {
      libraries = cached.libraries;
      selected = cached.selected;
    }
  } catch {
    message("Local cache is unavailable in this browser.");
  }
  render();
  try {
    await lichess.callback();
    render();
  } catch (e) {
    message(e instanceof Error ? e.message : String(e));
  }
}
void boot();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register('./sw.js').catch(() => {});
}
