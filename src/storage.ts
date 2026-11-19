import type {Chapter} from './core/library';
export interface Library {id:string;name:string;chapters:Chapter[]}
export interface Saved {libraries:Library[];selected:string}
const db=()=>new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('chess-recall',1);r.onupgradeneeded=()=>r.result.createObjectStore('cache');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
export async function load():Promise<Saved|undefined>{const d=await db();return new Promise((resolve,reject)=>{const t=d.transaction('cache');const r=t.objectStore('cache').get('library');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);t.oncomplete=()=>d.close();});}
export async function save(value:Saved){const d=await db();return new Promise<void>((resolve,reject)=>{const t=d.transaction('cache','readwrite');t.objectStore('cache').put(value,'library');t.oncomplete=()=>{d.close();resolve();};t.onerror=()=>{d.close();reject(t.error);};});}
