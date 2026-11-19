import { Chess, type Position } from 'chessops/chess';
import { parseFen, makeFen } from 'chessops/fen';
import { parsePgn, startingPosition, makePgn } from 'chessops/pgn';
import { makeSan, parseSan } from 'chessops/san';
import type { Move, Piece, Color } from 'chessops/types';
import { normalizeMove } from 'chessops/chess';
export interface RecordedMove { san: string; move: Move; color: Color; piece: Piece; before: string; after: string }
export interface Chapter { id: string; title: string; kind: 'pgn'|'fen'; start: string; answer: string; moves: RecordedMove[]; pgn: string }
export function position(fen: string): Position { return Chess.fromSetup(parseFen(fen).unwrap()).unwrap(); }
export function importText(raw: string): Chapter[] {
 const text=raw.trim(); if(!text) throw Error('Paste a PGN or FEN first.');
 if(text.length>2_000_000) throw Error('Please import less than 2 MB at a time.');
 if (/^[prnbqkPRNBQK1-8]+\//.test(text)) {
  const setup=parseFen(text).unwrap(); const fen=makeFen(setup);
  return [{id:crypto.randomUUID(),title:'Position study',kind:'fen',start:fen,answer:fen,moves:[],pgn:`[SetUp "1"]\n[FEN "${fen}"]\n\n*`}];
 }
 // chessops intentionally skips unrecognized tokens; reject malformed mainline input first.
 const body=text.replace(/\[[^\]\n]*\]/g,'').replace(/;[^\n]*/g,'');let main='',variation=0,comment=false;
 for(const ch of body){if(ch==='{'){comment=true;continue;}if(ch==='}'){comment=false;continue;}if(comment)continue;if(ch==='('){variation++;continue;}if(ch===')'){if(--variation<0)throw Error('Unbalanced PGN variation.');continue;}if(!variation)main+=ch;}
 if(comment||variation)throw Error('Unclosed PGN comment or variation.');
 for(const token of main.replace(/\d+\.(?:\.\.)?/g,' ').replace(/\$\d+/g,' ').replace(/[!?]+/g,'').trim().split(/\s+/)){
  if(token&&!/^(?:1-0|0-1|1\/2-1\/2|\*|(?:O-O(?:-O)?|0-0(?:-0)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=?[QRBN])?)[+#]?)$/.test(token))throw Error(`Invalid PGN token: ${token}`);
 }
 const games=parsePgn(text); if(!games.length) throw Error('No games found.');
 return games.map((g,i)=>{
  if(g.headers.get('Variant') && !['Standard','From Position'].includes(g.headers.get('Variant')!)) throw Error('Only standard chess is supported.');
  const nodes=[...g.moves.mainline()];
  if(!nodes.length && !g.headers.has('FEN')) throw Error('No moves or FEN found.');
  if(!nodes.length) {const c=importText(g.headers.get('FEN')!)[0]; c.title=g.headers.get('ChapterName')||g.headers.get('Event')||c.title; return c;}
  const pos=startingPosition(g.headers).unwrap(); const start=makeFen(pos.toSetup()); const moves:RecordedMove[]=[];
  for(const node of nodes){ const parsed=parseSan(pos,node.san); if(!parsed || !('from' in parsed)) throw Error(`Illegal PGN move: ${node.san}`);
   const move=normalizeMove(pos,parsed); const piece=pos.board.get(parsed.from)!; const before=makeFen(pos.toSetup()); const san=makeSan(pos,parsed); const color=pos.turn; pos.play(move);
   moves.push({san,move,piece,color,before,after:makeFen(pos.toSetup())});
  }
  return {id:crypto.randomUUID(),title:g.headers.get('ChapterName')|| (g.headers.get('White') && g.headers.get('White')!=='?' ? `${g.headers.get('White')} – ${g.headers.get('Black')}` : g.headers.get('Event')!=='?' ? g.headers.get('Event')||`Game ${i+1}` : `Game ${i+1}`),kind:'pgn',start,answer:makeFen(pos.toSetup()),moves,pgn:makePgn(g)};
 });
}
