import { parseFen } from 'chessops/fen';
import { makeSquare } from 'chessops/util';
export function gradeFen(answer: string, actual: string) {
 const a=parseFen(answer).unwrap().board, b=parseFen(actual).unwrap().board;
 let total=0,correct=0; const missed:string[]=[];
 for(let s=0;s<64;s++){const x=a.get(s),y=b.get(s); const same=x?.role===y?.role && x?.color===y?.color;
  if(x){total++; if(same)correct++;} if(!same)missed.push(makeSquare(s)); }
 return {correct,total,percent:total?100*correct/total:missed.length?0:100,missed};
}
export function gradeMoves(results: {correct:boolean}[]){return {correct:results.filter(r=>r.correct).length,total:results.length,percent:results.length?100*results.filter(r=>r.correct).length/results.length:100};}
