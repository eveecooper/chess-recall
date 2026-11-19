import type { Position } from 'chessops/chess';
import { makeSan, parseSan } from 'chessops/san';
import type { Move, Role } from 'chessops/types';
import { makeSquare, parseSquare } from 'chessops/util';
export type Validation={ok:true;move:Move;san:string}|{ok:false;layer:'syntax'|'legality';message:string};
export const normalizeSan=(s:string)=>s.trim().replace(/0/g,'O').replace(/([18])([QRBN])(?=[+#]?$)/,'$1=$2');
export function validateSan(pos:Position,input:string):Validation {
 const s=normalizeSan(input);
 if(/^[nbrqk]/.test(s)) return {ok:false,layer:'syntax',message:`Piece letters are uppercase. Did you mean ${s[0].toUpperCase()+s.slice(1)}?`};
 const bad=s.match(/[a-z][09]/i); if(bad)return {ok:false,layer:'syntax',message:`${bad[0]} is not a square.`};
 if(!/^(O-O(?:-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?)[+#]?$/.test(s))return {ok:false,layer:'syntax',message:'Enter standard notation, such as Nf3 or exd5.'};
 const move=parseSan(pos,s);
 if(move){const san=makeSan(pos,move); if(s===san)return {ok:true,move,san}; return {ok:false,layer:'syntax',message:`Check the capture, disambiguation, and check symbols. Did you mean ${san}?`};}
 // Suggestions derive only from the attempted destination and piece, never from the answer.
 const m=s.match(/^([KQRBN])?([a-h])?([1-8])?x?([a-h][1-8])(?:=([QRBN]))?[+#]?$/);
 if(m){const roles:Record<string,Role>={K:'king',Q:'queen',R:'rook',B:'bishop',N:'knight'};const role=roles[m[1]]||'pawn';const to=parseSquare(m[4])!;const candidates:Move[]=[];
  for(const [from,dests] of pos.allDests()){const p=pos.board.get(from);if(p?.role!==role || !dests.has(to))continue;
   const sq=makeSquare(from);if(m[2]&&m[2]!==sq[0]||m[3]&&m[3]!==sq[1])continue;
   candidates.push({from,to,...(m[5]?{promotion:roles[m[5]]}: {})});}
  if(candidates.length>1)return {ok:false,layer:'syntax',message:`Ambiguous: more than one ${role} can reach ${m[4]}. Add the file or rank.`};
  if(candidates.length===1 && pos.isLegal(candidates[0]))return {ok:false,layer:'syntax',message:`Check the notation. Did you mean ${makeSan(pos,candidates[0])}?`};
  return {ok:false,layer:'legality',message:`No ${role} can legally reach ${m[4]}.`};
 }
 return {ok:false,layer:'legality',message:'That move is not legal here.'};
}
