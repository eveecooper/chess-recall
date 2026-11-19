import {describe,it,expect} from 'vitest';
import {importText,position} from '../src/core/library';
import {gradeFen} from '../src/core/grader';
import {validateSan} from '../src/core/notation';
import {Session} from '../src/core/session';
import {parseSan} from 'chessops/san';
import {parseSquare} from 'chessops/util';
const game=()=>importText('1. e4 e5 2. Nf3 Nc6 *')[0];
describe('imports',()=>{
 it('classifies FEN and games',()=>{expect(game().kind).toBe('pgn');expect(importText('8/8/8/8/8/8/PPP5/8 w - - 0 1')[0].kind).toBe('fen');});
 it('ignores side variations and comments',()=>expect(importText('1. e4 {hello} (1. d4 d5) e5 2. Nf3 *')[0].moves.map(m=>m.san)).toEqual(['e4','e5','Nf3']));
 it('supports black-to-move custom starts',()=>expect(importText('[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/8/4K3 b - - 0 1"]\n\n1... Kf7 *')[0].moves[0].color).toBe('black'));
 it('rejects invalid and illegal input',()=>{expect(()=>importText('garbage')).toThrow();expect(()=>importText('1. e5 *')).toThrow();expect(()=>importText('1. e4 h9 *')).toThrow();});
 it('exports individual games without duplication',()=>{const cs=importText('[Event "A"]\n\n1. e4 *\n\n[Event "B"]\n\n1. d4 *');expect(cs).toHaveLength(2);expect(importText(cs.map(c=>c.pgn).join('\n\n'))).toHaveLength(2);});
});
describe('placement scoring',()=>{
 const answer='8/8/8/8/8/8/PPP5/8 w - - 0 1';
 it('counts correct pieces and all differing squares',()=>{const r=gradeFen(answer,'8/8/8/8/8/7P/PP6/8');expect(r.correct).toBe(2);expect(r.total).toBe(3);expect(r.percent).toBeCloseTo(200/3);expect(r.missed).toHaveLength(2);});
 it('missing pawn also scores two thirds',()=>expect(gradeFen(answer,'8/8/8/8/8/8/PP6/8').percent).toBeCloseTo(200/3));
 it('extra pieces affect missed squares, not percent',()=>{const r=gradeFen(answer,'8/8/8/8/8/7P/PPP5/8');expect(r.percent).toBe(100);expect(r.missed).toEqual(['h3']);});
 it('wrong color is incorrect; FEN metadata is not tested',()=>{expect(gradeFen(answer,'8/8/8/8/8/8/ppp5/8').correct).toBe(0);expect(gradeFen(answer,answer.replace('w','b')).percent).toBe(100);});
});
describe('strict notation',()=>{
 const pos=()=>position(game().start);
 it('rejects lowercase piece names and nonexistent squares',()=>{expect(validateSan(pos(),'nf3').ok).toBe(false);expect(validateSan(pos(),'h9').ok).toBe(false);});
 it('requires correct check symbols',()=>{expect(validateSan(pos(),'Nf3+').ok).toBe(false);expect(validateSan(pos(),'Nf3').ok).toBe(true);});
 it('requires capture x',()=>{const p=pos();p.play(parseSan(p,'e4')!);p.play(parseSan(p,'d5')!);expect(validateSan(p,'ed5').ok).toBe(false);expect(validateSan(p,'exd5').ok).toBe(true);});
 it('accepts both castling spellings',()=>{const p=position('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');expect(validateSan(p,'O-O').ok).toBe(true);expect(validateSan(p,'0-0').ok).toBe(true);});
 it('accepts both promotion spellings',()=>{const p=position('8/P6k/8/8/8/8/8/4K3 w - - 0 1');expect(validateSan(p,'a8=Q').ok).toBe(true);expect(validateSan(p,'a8Q').ok).toBe(true);});
 it('rejects ambiguous knights',()=>expect(validateSan(position('4k3/8/8/8/8/8/8/1N2KN2 w - - 0 1'),'Nd2').ok).toBe(false));
});
describe('sessions',()=>{
 it('wrong retries stay on the same ply and lose first-try credit',()=>{const s=new Session(game());expect(s.submit(parseSan(s.pos,'d4')!)).toBe(false);expect(s.index).toBe(0);s.submit(parseSan(s.pos,'e4')!);expect(s.score.percent).toBe(0);});
 it('rejects illegal moves without changing position',()=>{const s=new Session(game());const before=s.fen;s.submit({from:12,to:36});expect(s.fen).toBe(before);});
 it('records wrong legal moves silently in end mode',()=>{const s=new Session(game(),{check:'end',side:'both'});s.submit(parseSan(s.pos,'d4')!);expect(s.index).toBe(1);expect(s.status).toBe('');expect(s.score.percent).toBe(0);});
 it('only scores the user side with auto-play',()=>{const s=new Session(game(),{check:'each',side:'white'});s.submit(parseSan(s.pos,'e4')!);expect(s.index).toBe(2);expect(s.results).toHaveLength(1);s.submit(parseSan(s.pos,'Nf3')!);expect(s.done).toBe(true);expect(s.score.percent).toBe(100);});
 it('automatically plays the first move when playing black',()=>expect(new Session(game(),{check:'each',side:'black'}).index).toBe(1));
 it('restores a captured opponent piece on its recorded move',()=>{const c=importText('[FEN "4k3/8/8/8/8/8/r7/R3K3 w Q - 0 1"]\n\n1. Kf1 Ra3 *')[0];const s=new Session(c,{check:'end',side:'white'});s.submit(parseSan(s.pos,'Rxa2')!);expect(s.pos.board.get(parseSquare('a3')!)?.color).toBe('black');expect(s.pos.board.get(parseSquare('a2')!)?.color).toBe('white');});
});

describe('diverged movement',()=>{
 it('allows piece movement without king-safety and rejects invalid geometry',()=>{const s=new Session(game(),{check:'end',side:'both'});s.diverged=true;expect(s.validate('Nf3').ok).toBe(true);expect(s.pseudoLegal({from:6,to:21})).toBe(true);expect(s.pseudoLegal({from:6,to:22})).toBe(false);s.submit({from:6,to:22});expect(s.failed).toBe(true);});
});
