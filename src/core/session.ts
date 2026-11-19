import { Chess, normalizeMove } from "chessops/chess";
import { parseFen, makeFen } from "chessops/fen";
import { makeSan } from "chessops/san";
import { makeUci, opposite } from "chessops/util";
import type { Color, Move, NormalMove } from "chessops/types";
import { position, type Chapter } from "./library.js";
import { SquareSet } from "chessops/squareSet";
import { validateSan } from "./notation.js";
import { gradeMoves } from "./grader.js";
export interface Options {
  check: "each" | "end";
  side: "both" | Color;
}
export class Session {
  pos;
  index = 0;
  diverged = false;
  failed = false;
  attempted = false;
  results: { san: string; correct: boolean; index: number }[] = [];
  status = "";
  constructor(
    public chapter: Chapter,
    public options: Options = { check: "each", side: "both" },
  ) {
    this.pos = position(chapter.start);
    this.autoplay();
  }
  get done() {
    return this.index >= this.chapter.moves.length;
  }
  get fen() {
    return makeFen(this.pos.toSetup());
  }
  get score() {
    return gradeMoves(this.results);
  }
  submit(move: Move, notationCorrect = true) {
    if (this.done || this.failed) return false;
    if (
      !("from" in move) ||
      !(this.diverged ? this.pseudoLegal(move) : this.pos.isLegal(move))
    ) {
      this.status = "That move is not legal here.";
      if (this.diverged) {
        this.failed = true;
        this.status = "Invalid piece movement. Restart the test.";
      }
      return false;
    }
    const normalized = this.diverged ? move : normalizeMove(this.pos, move);
    const expected = this.chapter.moves[this.index];
    const correct =
      makeUci(normalized) === makeUci(expected.move) && notationCorrect;
    if (this.options.check === "each" && !correct) {
      this.attempted = true;
      this.status = "Wrong. Try again.";
      return false;
    }
    const san = this.diverged ? makeUci(move) : makeSan(this.pos, move);
    this.results.push({
      san,
      correct: correct && !this.attempted,
      index: this.index,
    });
    if (this.diverged) this.playPseudo(move);
    else this.pos.play(move);
    this.index++;
    this.attempted = false;
    this.status = this.diverged ? "Position diverged" : "";
    this.autoplay();
    return true;
  }
  validate(input: string) {
    if (!this.diverged) return validateSan(this.pos, input);
    const pos = this.pos.clone();
    pos.dests = (from: number) => {
      let dests = SquareSet.empty();
      for (let to = 0; to < 64; to++) {
        const p = pos.board.get(from);
        const promotion =
          p?.role === "pawn" && (to < 8 || to >= 56) ? "queen" : undefined;
        if (this.pseudoLegal({ from, to, promotion })) dests = dests.with(to);
      }
      return dests;
    };
    pos.isLegal = (move: Move) => "from" in move && this.pseudoLegal(move);
    return validateSan(pos, input);
  }
  pseudoLegal(m: NormalMove) {
    const p = this.pos.board.get(m.from),
      target = this.pos.board.get(m.to);
    if (
      !p ||
      p.color !== this.pos.turn ||
      target?.color === p.color ||
      m.from === m.to
    )
      return false;
    const dx = (m.to % 8) - (m.from % 8),
      dy = Math.floor(m.to / 8) - Math.floor(m.from / 8),
      ax = Math.abs(dx),
      ay = Math.abs(dy);
    const direction = p.color === "white" ? 1 : -1;
    if (p.role === "pawn") {
      const promote = Math.floor(m.to / 8) === (p.color === "white" ? 7 : 0);
      if (promote !== Boolean(m.promotion)) return false;
      if (
        m.promotion &&
        !["queen", "rook", "bishop", "knight"].includes(m.promotion)
      )
        return false;
      return (
        (dx === 0 &&
          !target &&
          (dy === direction ||
            (dy === 2 * direction &&
              Math.floor(m.from / 8) === (p.color === "white" ? 1 : 6) &&
              !this.pos.board.get(m.from + 8 * direction)))) ||
        (ax === 1 && dy === direction && Boolean(target))
      );
    }
    if (m.promotion) return false;
    if (p.role === "knight") return ax * ay === 2;
    if (p.role === "king") return Math.max(ax, ay) === 1;
    if (
      (p.role === "bishop" && ax !== ay) ||
      (p.role === "rook" && dx !== 0 && dy !== 0) ||
      (p.role === "queen" && dx !== 0 && dy !== 0 && ax !== ay)
    )
      return false;
    const step = Math.sign(dx) + 8 * Math.sign(dy);
    for (let s = m.from + step; s !== m.to; s += step)
      if (this.pos.board.get(s)) return false;
    return true;
  }
  playPseudo(m: NormalMove) {
    const p = this.pos.board.take(m.from)!;
    this.pos.board.set(m.to, { ...p, role: m.promotion || p.role });
    this.pos.turn = opposite(this.pos.turn);
    this.pos.epSquare = undefined;
  }
  autoplay() {
    while (
      !this.done &&
      this.options.side !== "both" &&
      this.pos.turn !== this.options.side
    ) {
      const recorded = this.chapter.moves[this.index];
      const move = recorded.move;
      if (
        !this.diverged &&
        this.pos.isLegal(move) &&
        "from" in move &&
        this.pos.board.get(move.from)?.role === recorded.piece.role
      ) {
        this.pos.play(move);
      } else {
        // Apply all squares changed by the recorded move (including castling and en passant).
        const before = parseFen(recorded.before).unwrap().board,
          after = parseFen(recorded.after).unwrap().board;
        for (let s = 0; s < 64; s++) {
          const a = before.get(s),
            b = after.get(s);
          if (a?.role !== b?.role || a?.color !== b?.color) {
            if (b) this.pos.board.set(s, b);
            else {
              const actual = this.pos.board.get(s);
              if (actual?.role === a?.role && actual?.color === a?.color)
                this.pos.board.take(s);
            }
          }
        }
        this.pos.turn = opposite(recorded.color);
        this.pos.epSquare = undefined;
        if (Chess.fromSetup(this.pos.toSetup()).isErr) this.diverged = true;
      }
      this.index++;
    }
    if (this.diverged) this.status = "Position diverged";
  }
}
