
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {aggregate,allocate,decodeCsv,parseCsv,summarize} from '../election.mjs';
import {ResultsStore} from '../store.mjs';
const csv=await readFile(new URL('../data/seed.csv',import.meta.url),'utf8');
const config=JSON.parse(await readFile(new URL('../config.json',import.meta.url),'utf8'));
test('reference CSV reconciles, reproduces every party and bloc in supplied image',()=>{
 const d=summarize(aggregate(csv),config);
 assert.equal(d.valid,3758580);assert.equal(d.invalid,16881);assert.equal(d.voters,3775461);
 assert.equal(d.wasted,200996);assert.equal(d.threshold,122154);
 assert.deepEqual(d.blocs.map(b=>b.seats),[54,48,18]);
 const expected={'מחל':27,'דרך':21,'ודם':12,'רק':11,'אמת':8,'ג':7,'ל':8,'ב':7,'שס':7,'ט':6,'עם':6};
 assert.deepEqual(Object.fromEntries(d.parties.filter(p=>p.qualified).map(p=>[p.code,p.seats])),expected);
 assert.equal(d.parties.reduce((s,p)=>s+p.seats,0),120);
 assert.equal(d.parties.find(p=>p.code==='די').missing,22073);
 assert.equal(d.localities,1007);
});
test('parser handles BOM, CRLF, quoted comma and escaped quotes',()=>{
 assert.deepEqual(parseCsv('\uFEFFא,ב\r\n"x,y","z""q"\r\n'),[['א','ב'],['x,y','z"q']]);
 assert.equal(decodeCsv(Buffer.from([0xe0])), 'א');
 assert.throws(()=>parseCsv('"broken'));
});
test('rejects HTML, broken totals, missing fields, duplicate municipalities',()=>{
 assert.throws(()=>aggregate('<html>challenge</html>'));
 assert.throws(()=>aggregate(csv.replace('202,0,202','202,1,202')),/reconciliation/);
 const first=csv.split(/\r?\n/)[1];assert.throws(()=>aggregate(csv+'\n'+first),/Duplicate/);
 assert.throws(()=>aggregate(csv.replace('202,0,202','202,,202')),/Invalid number/);
});
test('threshold is inclusive and agreement with excluded partner has no effect',()=>{
 assert.ok('B' in allocate({A:9675,B:325},10000).seats);
 assert.ok(!('B' in allocate({A:9676,B:324},10000).seats));
 assert.deepEqual(allocate({A:9676,B:324},10000,[['A','B']]).seats,{A:120});
 assert.throws(()=>allocate({A:5001,B:4999},10000,[['A','B'],['A','C']]),/Invalid/);
});
test('exact quotient ties are reported, never resolved by iteration order',()=>{
 assert.throws(()=>allocate({A:1,B:1,C:1,D:1,E:1,F:1,G:1},7),/שוויון/);
});
test('unpaired allocation matches independent sequential highest averages over 200 elections',()=>{
 let seed=2026;
 const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed;};
 for(let k=0;k<200;k++){
   const votes=Object.fromEntries(Array.from({length:7},(_,i)=>[String(i),1000+rnd()%200000]));
   const total=Object.values(votes).reduce((a,b)=>a+b,0),eligible=Object.entries(votes).filter(([,v])=>v*400>=total*13);
   const result=Object.fromEntries(eligible.map(([c])=>[c,0]));
   for(let i=0;i<120;i++){
     const sorted=eligible.slice().sort((a,b)=>b[1]/(result[b[0]]+1)-a[1]/(result[a[0]]+1));
     result[sorted[0][0]]++;
   }
   assert.deepEqual(allocate(votes,total).seats,result);
 }
});
test('live refresh persists, 304 revalidates, failures keep good data, restart restores',async()=>{
 const dir=await mkdtemp(join(process.env.TEST_TMPDIR || tmpdir(),'election-test-'));
 let response=()=>new Response(csv,{headers:{etag:'test-1'}});
 const store=new ResultsStore(config,{dataDir:dir,fetcher:async()=>response(),interval:900000});
 try{
   await store.init(new URL('../data/seed.csv',import.meta.url));
   assert.equal(store.view().status.origin,'seed');assert.equal(store.view().status.lastSuccess,null);
   await store.refresh();assert.equal(store.view().status.origin,'official');const hash=store.snapshot.hash;
   response=()=>new Response(null,{status:304});await store.refresh();assert.equal(store.snapshot.hash,hash);
   response=()=>new Response('<html>blocked</html>');await store.refresh();
   assert.ok(store.view().status.lastError);assert.equal(store.data.valid,3758580);
   const next=new ResultsStore(config,{dataDir:dir,fetcher:async()=>response(),interval:900000});
   await next.init(new URL('../data/seed.csv',import.meta.url));assert.equal(next.view().status.origin,'official');assert.equal(next.snapshot.hash,hash);
   response=()=>new Response(csv.replace('3,אורטל','4,אורטל'));await store.refresh();
   assert.notEqual(store.snapshot.hash,hash);assert.equal(store.view().status.lastError,null);
 }finally{await rm(dir,{recursive:true,force:true});}
});



test('paired allocation matches independent group and internal highest averages',()=>{
 function dh(votes,n){
  const seats=votes.map(()=>0);
  for(let i=0;i<n;i++){let best=0;for(let j=1;j<votes.length;j++)if(votes[j]/(seats[j]+1)>votes[best]/(seats[best]+1))best=j;seats[best]++;}
  return seats;
 }
 for(let k=1;k<=80;k++){
  const v=[500000+k*191,210000+k*233,440000+k*179,90000+k*311,320000+k*101];
  const votes=Object.fromEntries(v.map((x,i)=>[String(i),x])),total=v.reduce((a,b)=>a+b,0);
  const group=dh([v[0]+v[1],v[2]+v[3],v[4]],120);
  const expected=[...dh(v.slice(0,2),group[0]),...dh(v.slice(2,4),group[1]),group[2]];
  assert.deepEqual(allocate(votes,total,[['0','1'],['2','3']]).seats,Object.fromEntries(expected.map((n,i)=>[String(i),n])));
 }
});

