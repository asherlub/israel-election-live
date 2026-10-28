
export function parseCsv(text) {
  text=text.replace(/^\uFEFF/,'');
  const rows=[]; let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){
      if(quoted&&text[i+1]==='"'){field+='"';i++;}
      else if(!field||quoted) quoted=!quoted; else field+=c;
    }else if(c===','&&!quoted){row.push(field.trim());field='';}
    else if((c==='\n'||c==='\r')&&!quoted){
      if(c==='\r'&&text[i+1]==='\n')i++;
      row.push(field.trim());if(row.some(Boolean))rows.push(row);row=[];field='';
    }else field+=c;
  }
  if(quoted)throw new Error('Unclosed CSV quote');
  row.push(field.trim());if(row.some(Boolean))rows.push(row);return rows;
}
export function decodeCsv(bytes){
  try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
  catch{return new TextDecoder('windows-1255',{fatal:true}).decode(bytes);}
}
export function aggregate(text){
  const rows=parseCsv(text),headers=rows.shift()||[];
  while(headers.at(-1)==='')headers.pop();
  const meta=['סמל ועדה','שם ישוב','סמל ישוב','בזב','מצביעים','פסולים','כשרים'];
  if(!meta.every((x,i)=>headers[i]===x)||headers.length<=7||new Set(headers).size!==headers.length)throw new Error('Unexpected CSV schema');
  const totals=Object.fromEntries(headers.slice(3).map(h=>[h,0])),seen=new Set();
  for(const [i,r]of rows.entries()){
    if(r.length<headers.length||r.slice(headers.length).some(Boolean))throw new Error('Invalid row width '+(i+2));
    if(!r[1]||!/^\d+$/.test(r[0])||!/^\d+$/.test(r[2]))throw new Error('Invalid locality row '+(i+2));
    if(seen.has(r[2]))throw new Error('Duplicate locality '+r[2]);seen.add(r[2]);
    const values=headers.slice(3).map((h,j)=>{
      const s=r[j+3];if(!/^\d+$/.test(s))throw new Error('Invalid number in row '+(i+2));
      const n=Number(s);if(!Number.isSafeInteger(n))throw new Error('Number too large');
      totals[h]+=n;if(!Number.isSafeInteger(totals[h]))throw new Error('Total too large');return n;
    });
    if(values[1]!==values[2]+values[3]||values.slice(4).reduce((a,b)=>a+b,0)!==values[3])throw new Error('Vote reconciliation failed in row '+(i+2));
  }
  if(!rows.length||!totals['כשרים'])throw new Error('Empty vote data');
  return{valid:totals['כשרים'],invalid:totals['פסולים'],voters:totals['מצביעים'],eligible:totals['בזב'],localities:rows.length,votes:Object.fromEntries(headers.slice(7).map(h=>[h,totals[h]]))};
}
const floorRatio=(a,b,c)=>Number(BigInt(a)*BigInt(b)/BigInt(c));
function winner(items){
  let top=[];
  for(const item of items){
    if(!top.length){top=[item];continue;}
    const d=BigInt(item.votes)*BigInt(top[0].seats+1)-BigInt(top[0].votes)*BigInt(item.seats+1);
    if(d>0n)top=[item];else if(d===0n)top.push(item);
  }
  if(top.length!==1)throw new Error('שוויון במודד: נדרשת הכרעה רשמית בהגרלה. לא מוצגת חלוקה שרירותית.');
  return top[0];
}
export function allocate(votes,valid,agreements=[]){
  const eligible=Object.entries(votes).filter(([,v])=>BigInt(v)*400n>=BigInt(valid)*13n).map(([code,votes])=>({code,votes,seats:0}));
  if(!eligible.length)throw new Error('אין רשימות שעברו את אחוז החסימה');
  const sum=eligible.reduce((s,p)=>s+p.votes,0),map=new Map(eligible.map(p=>[p.code,p]));
  eligible.forEach(p=>p.seats=floorRatio(p.votes,120,sum));
  const used=new Set(),groups=[],configured=new Set();
  for(const pair of agreements){
    if(pair.length!==2||pair[0]===pair[1]||pair.some(c=>configured.has(c)))throw new Error('Invalid surplus agreements');
    pair.forEach(c=>configured.add(c));
    if(pair.every(c=>map.has(c))){groups.push({members:pair.map(c=>map.get(c))});pair.forEach(c=>used.add(c));}
  }
  eligible.filter(p=>!used.has(p.code)).forEach(p=>groups.push({members:[p]}));
  groups.forEach(g=>{g.votes=g.members.reduce((s,p)=>s+p.votes,0);g.seats=g.members.reduce((s,p)=>s+p.seats,0);});
  const rounds=[];
  for(let s=groups.reduce((s,g)=>s+g.seats,0);s<120;s++){
    const g=winner(groups);rounds.push({seat:s+1,codes:g.members.map(p=>p.code),quotient:g.votes/(g.seats+1)});g.seats++;
  }
  for(const g of groups){
    // Internal allocation uses the final pair quota, not the national quota.
    g.members.forEach(p=>p.seats=floorRatio(p.votes,g.seats,g.votes));
    while(g.members.reduce((s,p)=>s+p.seats,0)<g.seats)winner(g.members).seats++;
  }
  return{seats:Object.fromEntries(eligible.map(p=>[p.code,p.seats])),rounds,qualifyingVotes:sum};
}
export function summarize(data,config){
  let calculation,calculationError=null;
  try{calculation=allocate(data.votes,data.valid,config.agreements);}catch(e){calculationError=e.message;}
  const threshold=Number((BigInt(data.valid)*13n+399n)/400n);
  const parties=Object.entries(data.votes).map(([code,votes])=>({code,name:config.parties[code]?.name||'רשימה '+code,leader:config.parties[code]?.leader||'',bloc:config.parties[code]?.bloc||'other',votes,percent:votes/data.valid*100,qualified:votes>=threshold,seats:calculation?calculation.seats[code]||0:null,missing:Math.max(0,threshold-votes)})).sort((a,b)=>b.votes-a.votes);
  const wasted=parties.filter(p=>!p.qualified).reduce((s,p)=>s+p.votes,0);
  return{...data,votes:undefined,title:config.title,threshold,wasted,wastedPercent:wasted/data.valid*100,parties,calculationError,rounds:calculation?.rounds||[],blocs:config.blocs.map(b=>({...b,parties:parties.filter(p=>p.qualified&&p.bloc===b.id),seats:calculation?parties.filter(p=>p.qualified&&p.bloc===b.id).reduce((s,p)=>s+p.seats,0):null,votes:parties.filter(p=>p.qualified&&p.bloc===b.id).reduce((s,p)=>s+p.votes,0)})).filter(b=>b.parties.length),agreements:config.agreements.map(pair=>pair.map(c=>({code:c,name:config.parties[c]?.name||c,active:parties.find(p=>p.code===c)?.qualified||false}))),agreementsVerified:config.agreementsVerified,agreementsSource:config.agreementsSource};
}


export function localityBreakdown(csv,config,limit=30){
 const [headers,...rows]=parseCsv(csv);
 const groups=config.blocs.filter(b=>b.id!=='other').map(b=>({id:b.id,name:b.name,color:b.color}));
 groups.push({id:'other',name:'אחרים',color:'#8291a7'});
 const ids=new Set(groups.map(b=>b.id));
 const cities=rows.filter(r=>Number(r[2])>0&&!/מעטפות|חוץ לארץ/.test(r[1])).map(r=>{
  const votes=Object.fromEntries(groups.map(b=>[b.id,0]));
  for(let i=7;i<headers.length;i++)if(headers[i]){const id=config.parties[headers[i]]?.bloc;votes[ids.has(id)?id:'other']+=Number(r[i]);}
  return{code:r[2],name:r[1],voters:Number(r[4]),invalid:Number(r[5]),valid:Number(r[6]),votes};
 }).sort((a,b)=>b.voters-a.voters||Number(a.code)-Number(b.code)).slice(0,limit);
 const totals={voters:0,valid:0,invalid:0,votes:Object.fromEntries(groups.map(b=>[b.id,0]))};
 for(const c of cities){totals.voters+=c.voters;totals.valid+=c.valid;totals.invalid+=c.invalid;for(const b of groups)totals.votes[b.id]+=c.votes[b.id];}
 return{groups,cities,totals};
}

export function alternativeConfig(config){
 const blocs=[{id:'hard-right',name:'ימין קיצוני וחרדים',color:'#7452b8'},{id:'right-center',name:'מפלגות ימין ומרכז',color:'#1675b9'},{id:'left-arab',name:'שמאל קיצוני וערבים',color:'#d74d70'}];
 const assignments={'ב':'hard-right','שס':'hard-right','ג':'hard-right','מחל':'right-center','ל':'right-center','ט':'right-center','דרך':'right-center','רק':'right-center','אמת':'left-arab','ודם':'left-arab','עם':'left-arab'};
 return{...config,blocs,parties:Object.fromEntries(Object.entries(config.parties).map(([code,p])=>[code,{...p,bloc:assignments[code]||'other'}]))};
}
