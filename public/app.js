let viewMode=location.hash==='#alternative-heading'?'unity':'traditional';

let activePrefix='';
const $=id=>document.getElementById(activePrefix+id);
let alternateData=null,alternateExpanded=false;
const alternateSelection=new Set();
const num=n=>n==null?'—':new Intl.NumberFormat('he-IL').format(n);
const pct=n=>n.toFixed(2)+'%';
const date=s=>s?new Intl.DateTimeFormat('he-IL',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Jerusalem'}).format(new Date(s)):'טרם אומת';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let current,expanded=false,busy=false;
function statusText(s){
  if(s.origin==='seed')return 'עותק התחלתי שסופק · '+s.seedDate+' · טרם התקבל עדכון מהמקור';
  return (s.lastError||s.stale||s.clientDisconnected?'מוצג העותק האחרון · ':'מחובר למקור · ')+'עודכן לאחרונה: '+date(s.lastSuccess)+' (שעון ישראל)';
}
function render(d){
  current=d;
  if(!activePrefix)document.dispatchEvent(new CustomEvent("election-data",{detail:d}));
  $('loading').hidden=true;$('dashboard').hidden=false;$('download').disabled=false;
  $('status').innerHTML='<i class="dot '+(d.status.lastError||d.status.stale||d.status.clientDisconnected?'warn':'')+'"></i>'+esc(statusText(d.status));
  const notices=[];
  if(d.status.origin==='seed')notices.push('המספרים מבוססים על הקובץ שסופק מ־'+d.status.seedDate+'. טרם אומתה הורדה מהמקור הרשמי.');
  if(d.status.lastError)notices.push(d.status.lastError);
  else if(d.status.stale&&d.status.origin!=='seed')notices.push('חלף זמן מאז הבדיקה המוצלחת האחרונה. העדכניות אינה מאומתת כעת.');
  if(d.status.persistenceError)notices.push(d.status.persistenceError);
  $('data-note').textContent=notices.join(' ');$('data-note').classList.toggle('hidden',!notices.length);
  const stats=[
    ['קולות כשרים',num(d.valid),'מתוך '+num(d.voters)+' מצביעים','#0664ec'],
    ['סף כניסה · 3.25%',num(d.threshold),'קולות לרשימה · המספר יתעדכן בהתאם להמשך ספירת הקולות','#009783'],
    ['לא עברו את אחוז החסימה',num(d.wasted),'קולות כשרים שלא יוקצו להם מושבים','#ed2854'],
    ['חלקם מהקולות הכשרים',pct(d.wastedPercent),num(d.invalid)+' קולות פסולים בנפרד','#8252bd']
  ];
  $('stats').innerHTML=stats.map(([label,value,sub,color])=>'<article class="stat" style="--tone:'+color+'"><div class="stat-label">'+label+'</div><strong dir="ltr">'+value+'</strong><small>'+sub+'</small></article>').join('');
  $('seats').innerHTML=d.calculationError?'<p class="error">'+esc(d.calculationError)+'</p>':d.blocs.flatMap(b=>Array.from({length:b.seats},()=>'<span class="seat" style="--tone:'+b.color+'" title="'+esc(b.name)+'"></span>')).join('');
  $('seats').setAttribute('aria-label',d.blocs.map(b=>b.name+': '+num(b.seats)+' מנדטים').join(', '));
  $('legend').innerHTML=d.blocs.map(b=>'<span><i style="--tone:'+b.color+'"></i>'+esc(b.name)+'<b>'+num(b.seats)+'</b></span>').join('');
  $('blocs').innerHTML=d.blocs.map(b=>'<article class="bloc" style="--tone:'+b.color+'"><div class="bloc-head"><div><h3>'+esc(b.name)+'</h3><p>'+num(b.votes)+' קולות לרשימות שעברו</p></div><div class="bloc-number">'+num(b.seats)+'<small>מנדטים</small></div></div><div class="party-labels"><span>הרשימה / ראש הרשימה</span><span>קולות &nbsp; &nbsp; מנדטים</span></div>'+b.parties.map(p=>'<div class="party-row"><div><h4>'+esc(p.name)+'</h4><small>'+esc(p.leader)+'</small></div><div class="votes" dir="ltr">'+num(p.votes)+'</div><div class="mandates">'+num(p.seats)+'</div></div>').join('')+'<div class="bloc-foot"><span>חלק ממושבי הכנסת</span><b dir="ltr">'+(b.seats==null?'—':(b.seats/120*100).toFixed(1)+'%')+'</b></div></article>').join('');
  $('wasted-total').innerHTML=num(d.wasted)+'<small>'+pct(d.wastedPercent)+' מהקולות הכשרים</small>';
  renderTable();
  renderCities(d.localityBreakdown);
  renderCoalition(d);
  $('agreement-note').textContent=d.agreementsVerified?'ההסכמים שהוגדרו לחישוב אומתו על ידי מפעיל האתר.':'החישוב מותנה בחמשת הסכמי העודפים שלהלן, על סמך דיווח תקשורתי. טרם אומתו מול הודעה רשמית של ועדת הבחירות.';
  $('agreements').innerHTML=d.agreements.map(pair=>'<span>'+pair.map(p=>esc(p.name)).join(' + ')+(pair.every(p=>p.active)?'':' · לא פעיל בספירה זו')+'</span>').join('');
  $('agreement-source').href=d.agreementsSource;
  $('audit').innerHTML='<div class="audit"><div>יישובים בקובץ<b>'+num(d.localities)+'</b></div><div>קולות פסולים<b>'+num(d.invalid)+'</b></div><div>מצביעים<b>'+num(d.voters)+'</b></div></div><p>בדיקת מקור כל '+d.status.pollSeconds/60+' דקות; רענון מסך בכל דקה. לחצן הרענון קורא את הנתונים שנשמרו בשרת.<br>ניסיון בדיקה אחרון: '+date(d.status.lastAttempt)+' · בדיקה מוצלחת: '+date(d.status.lastSuccess)+'<br>שינוי בקובץ זוהה לראשונה: '+date(d.status.dataChangedAt)+' · זמן שינוי לפי שרת המקור: '+(d.status.sourceModified?date(d.status.sourceModified):'לא נמסר')+'</p>';
  $('timestamp').textContent='עודכן לאחרונה: '+date(d.status.lastSuccess)+' (שעון ישראל)';
  if(!activePrefix&&d.alternative)renderAlternative({...d.alternative,status:d.status});
}
function renderTable(){
  const all=current.parties.filter(p=>!p.qualified),shown=expanded?all:all.slice(0,5),rest=all.slice(5);
  $('wasted').innerHTML=shown.map(p=>'<tr><td><b>'+esc(p.name)+'</b><small>'+esc(p.leader)+(p.leader?' · ':'')+'פתק '+esc(p.code)+'</small></td><td><b>'+num(p.votes)+'</b></td><td dir="ltr">'+pct(p.percent)+'</td><td>'+num(p.missing)+' קולות<small>'+pct(3.25-p.percent)+' נק׳ אחוז</small></td></tr>').join('')+(!expanded&&rest.length?'<tr><td><b>יתר הרשימות</b><small>'+rest.length+' רשימות נוספות</small></td><td><b>'+num(rest.reduce((s,p)=>s+p.votes,0))+'</b></td><td dir="ltr">'+pct(rest.reduce((s,p)=>s+p.percent,0))+'</td><td>—<small>הסף נבחן לכל רשימה בנפרד</small></td></tr>':'');
  $('toggle').hidden=!rest.length;$('toggle').textContent=expanded?'צמצום הרשימות ↑':'הצגת כל '+all.length+' הרשימות ↓';$('toggle').setAttribute('aria-expanded',String(expanded));
}
async function load(){
  if(busy)return;busy=true;$('refresh').disabled=true;
  try{
    const response=await fetch('/api/results',{cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error();
    const d=await response.json();render(d);$('connection').classList.add('hidden');
  }catch{
    $('connection').textContent='לא ניתן להתחבר לשרת כרגע. '+(current?'התצוגה נשמרה מהטעינה האחרונה; עדכניות הנתונים אינה מאומתת.':'אפשר לנסות שוב באמצעות רענון התצוגה.');
    $('connection').classList.remove('hidden');$('loading').hidden=true;
    if(current)current.status.clientDisconnected=true; if(current)$('status').textContent='אין חיבור לשרת · בדיקה מוצלחת אחרונה: '+date(current.status.lastSuccess);
  }finally{busy=false;$('refresh').disabled=false;}
}
// Draw text and figures directly to a local canvas; no third-party screenshot service.
async function download(){
  const downloadButton=$('download');
  if(!current)return;const d=structuredClone(current);d.status.stale=d.status.stale||!d.status.lastSuccess||Date.now()-Date.parse(d.status.lastSuccess)>d.status.pollSeconds*2500;
  downloadButton.disabled=true;
  try{
    const groups=d.blocs,rows=d.parties.filter(p=>!p.qualified),summary=rows.slice(0,5),rest=rows.slice(5);
    const width=1200,colCount=Math.min(groups.length,3),colWidth=(width-80-(colCount-1)*16)/colCount;
    const groupRows=Math.ceil(groups.length/3),cardHeight=Math.max(490,165+Math.max(...groups.map(g=>g.parties.length))*62),wasteTop=465+groupRows*(cardHeight+18),height=wasteTop+530;
    const canvas=document.createElement('canvas');canvas.width=width*2;canvas.height=height*2;
    const ctx=canvas.getContext('2d');ctx.scale(2,2);ctx.fillStyle='#edf5fb';ctx.fillRect(0,0,width,height);
    function rect(x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(x,y,w,h);}
    function text(value,x,y,size=20,color='#142f53',bold=false,align='right'){
      ctx.fillStyle=color;ctx.font=(bold?'bold ':'')+size+'px Arial';ctx.textAlign=align;ctx.direction='rtl';ctx.fillText(value,x,y);
    }
    rect(0,0,width,190,'#092c58');
    text('בחירות 2026  /  תמונת מצב עצמאית',1160,44,16,'#97d8ff');
    text('תמונת המנדטים',1160,103,44,'white',true);
    text(statusText(d.status),1160,148,16,'#d1e6f6');
    if(d.status.lastError||d.status.stale||d.status.clientDisconnected)text('עדכניות הנתונים אינה מאומתת כעת',1160,177,14,'#ffcf75');
    const cards=[['קולות כשרים',num(d.valid),'#0664ec'],['סף כניסה · 3.25%',num(d.threshold),'#009783'],['מתחת לחסימה',num(d.wasted),'#ed2854'],['מהקולות הכשרים',pct(d.wastedPercent),'#8252bd']];
    cards.forEach(([label,v,color],i)=>{const x=width-40-(i+1)*268-i*16;rect(x,212,268,104,'white');text(label,x+248,244,16);text(v,x+248,292,34,color,true);});
    text('חלוקת 120 המנדטים לפי גושים',1160,356,24,'#142f53',true);
    if(d.calculationError)text('חלוקת המנדטים אינה זמינה: '+d.calculationError,1160,395,18,'#c32048');
    else{
      let index=0;groups.forEach(g=>{for(let n=0;n<g.seats;n++){const i=index++;rect(1160-(i%30+1)*37,379+Math.floor(i/30)*15,32,10,g.color);}});
    }
    groups.forEach((g,i)=>{
      const x=width-40-(i%3+1)*colWidth-(i%3)*16,y=465+Math.floor(i/3)*(cardHeight+18);
      rect(x,y,colWidth,cardHeight,'white');rect(x,y,colWidth,105,g.color);
      text(g.name,x+colWidth-20,y+39,26,'white',true);
      text(num(g.votes)+' קולות',x+colWidth-20,y+76,16,'white');
      text(num(g.seats),x+22,y+68,55,'white',true,'left');
      g.parties.forEach((p,j)=>{const py=y+139+j*62;text(p.name,x+colWidth-18,py,19,'#142f53',true);text(p.leader,x+colWidth-18,py+21,12,'#6e879f');text(num(p.votes),x+125,py+16,15,'#142f53');text(num(p.seats),x+25,py+16,29,g.color,true,'center');});
      text('חלק ממושבי הכנסת',x+colWidth-20,y+cardHeight-22,13,'#6e879f');
      text(g.seats==null?'—':(g.seats/120*100).toFixed(1)+'%',x+20,y+cardHeight-22,22,g.color,true,'left');
    });
    rect(40,wasteTop,1120,370,'white');rect(40,wasteTop,1120,70,'#092c58');
    text('מתחת לאחוז החסימה',1138,wasteTop+44,27,'white',true);
    text(num(d.wasted)+' קולות  |  '+pct(d.wastedPercent),60,wasteTop+44,24,'#ff96ad',true,'left');
    const display=[...summary,...(rest.length?[{name:'יתר הרשימות ('+rest.length+')',votes:rest.reduce((s,p)=>s+p.votes,0),percent:rest.reduce((s,p)=>s+p.percent,0),missing:null}]:[])];
    display.forEach((p,i)=>{const y=wasteTop+103+i*43;if(i%2===0)rect(40,y-25,1120,43,'#f3f8fc');text(p.name,1138,y,19,'#142f53',true);text(num(p.votes)+' קולות',650,y,18);text(pct(p.percent),400,y,18);text(p.missing===null?'פער נבחן לכל רשימה':num(p.missing)+' קולות מהסף',230,y,16,'#d82b50');});
    text('פסולים: '+num(d.invalid)+'  ·  יישובים בקובץ: '+num(d.localities)+'  ·  חישוב בדר–עופר; אינו פרסום מנדטים רשמי',1160,wasteTop+405,16);
    text('הפער מהסף מבוסס על סך קולות קבוע. החלוקה לגושים ושמות הרשימות לפי תמונת הייחוס.',1160,wasteTop+435,15,'#637f9a');
    text(d.agreementsVerified?'הסכמי העודפים אומתו על ידי מפעיל האתר.':'הסכמי העודפים לפי דיווח תקשורתי; טרם אומתו מול הודעה רשמית.',1160,wasteTop+465,15,'#906624');
    text('מקור: media26.bechirot.gov.il/files/expc.csv · בדיקה מוצלחת: '+date(d.status.lastSuccess),1160,wasteTop+498,14,'#637f9a');
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if(!blob)throw new Error('Image generation failed');
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='election-snapshot.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch{$('connection').textContent='הורדת התמונה נכשלה. אפשר לנסות שוב.';$('connection').classList.remove('hidden');}
  finally{downloadButton.disabled=false;}
}
$('toggle').addEventListener('click',()=>{expanded=!expanded;renderTable();});
$('refresh').addEventListener('click',load);
$('download').addEventListener('click',()=>{if(viewMode==='unity'&&alternateData)withAlternative(()=>download());else download();});
load();setInterval(()=>{if(!document.hidden)load();},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});



function renderCities(data){
 if(!data){$('city-rows').innerHTML='<tr><td colspan="3">נתוני יישובים אינם זמינים כעת</td></tr>';return;}
 const {groups,cities,totals}=data;
 const percent=(votes,valid)=>valid?votes/valid*100:0;
 $('city-summary').innerHTML=groups.map(g=>'<div class="city-card" style="--tone:'+g.color+'"><b>'+esc(g.name)+'</b><strong>'+percent(totals.votes[g.id],totals.valid).toFixed(1)+'%</strong><span>'+num(totals.votes[g.id])+' קולות</span></div>').join('');
 $('city-total').textContent='סך הכול ב־'+cities.length+' היישובים: '+num(totals.voters)+' מצביעים · '+num(totals.valid)+' קולות כשרים';
 $('city-rows').innerHTML=cities.map(c=>{
 const label=groups.map(g=>g.name+': '+percent(c.votes[g.id],c.valid).toFixed(1)+'% ('+num(c.votes[g.id])+' קולות)').join(' · ');
 const bar=c.valid?groups.map(g=>{const p=percent(c.votes[g.id],c.valid);return '<span style="width:'+p+'%;background:'+g.color+'" title="'+esc(g.name+': '+p.toFixed(1)+'% · '+num(c.votes[g.id])+' קולות')+'">'+(p>=8?Math.round(p)+'%':'')+'</span>';}).join(''):'ללא קולות כשרים';
 return '<tr><th scope="row">'+esc(c.name)+'</th><td><div class="city-bar" role="img" aria-label="'+esc(label)+'">'+bar+'</div><details class="city-detail"><summary>פירוט קולות</summary>'+groups.map(g=>'<div>'+esc(g.name)+': '+num(c.votes[g.id])+' · '+percent(c.votes[g.id],c.valid).toFixed(1)+'%</div>').join('')+'</details></td><td class="city-count">'+num(c.voters)+'</td></tr>';
 }).join('');
 $('city-legend').innerHTML=groups.map(g=>'<span><i style="--tone:'+g.color+'"></i>'+esc(g.name)+'</span>').join('');
}

let coalitionSelection=new Set();
const coalitionColors=['#0765e9','#008b7b','#db3059','#6d4ac7','#b87508','#007da5','#92469f','#526e27','#a34925','#4c659a','#a82973','#36786a'];
function renderCoalition(d){
 const parties=d.parties.filter(p=>p.seats>0);
 const allowed=new Set(parties.map(p=>p.code));
 for(const code of coalitionSelection)if(!allowed.has(code))coalitionSelection.delete(code);
 const available=!d.calculationError&&parties.reduce((s,p)=>s+p.seats,0)===120;
 if(!available){$('coalition-parties').innerHTML='חישוב המנדטים אינו זמין כרגע';$('coalition-count').textContent='—';$('coalition-message').textContent='המשחק יחזור עם חישוב תקין';$('coalition-seats').innerHTML='';$('coalition-presets').innerHTML='';$('coalition-fill').style.width='0%';$('coalition-meter').setAttribute('aria-valuenow','0');$('coalition-selected').textContent='';return;}
 const selected=parties.filter(p=>coalitionSelection.has(p.code));
 const total=selected.reduce((s,p)=>s+p.seats,0);
 $('coalition-count').textContent=total;
 $('coalition-message').textContent=total===0?'בחרו מפלגות כדי להתחיל':total<61?'חסרים עוד '+(61-total)+' מנדטים לרוב':total===61?'יש רוב — 61 מנדטים!':'יש רוב — '+(total-61)+' מנדטים מעל הרף';
 $('coalition-message').classList.toggle('has-majority',total>=61);
 $('coalition-fill').style.width=(total/120*100)+'%';$('coalition-meter').setAttribute('aria-valuenow',String(total));
 $('coalition-parties').innerHTML=parties.map((p,i)=>'<button type="button" class="coalition-party" data-party="'+esc(p.code)+'" aria-pressed="'+coalitionSelection.has(p.code)+'" style="--party-color:'+coalitionColors[i%coalitionColors.length]+'"><span class="coalition-check" aria-hidden="true">'+(coalitionSelection.has(p.code)?'✓':'+')+'</span><span>'+esc(p.name)+'</span><b>'+p.seats+'</b></button>').join('');
 $('coalition-presets').innerHTML='<span>בחירה מהירה:</span>'+d.blocs.map(b=>'<button type="button" data-bloc="'+esc(b.id)+'">'+esc(b.name)+'</button>').join('');
 $('coalition-selected').textContent=selected.length?'הקואליציה שלכם: '+selected.map(p=>p.name).join(' · '):'עדיין לא נבחרו מפלגות';
 const seats=parties.flatMap((p,i)=>Array.from({length:p.seats},()=>({name:p.name,color:coalitionSelection.has(p.code)?coalitionColors[i%coalitionColors.length]:'#e0e7f0',selected:coalitionSelection.has(p.code)})));
 let index=0;const circles=[];
 [24,28,32,36].forEach((n,row)=>{const radius=116+row*33;for(let j=0;j<n;j++){const angle=Math.PI-j*Math.PI/(n-1),x=250+radius*Math.cos(angle),y=240-radius*Math.sin(angle),seat=seats[index++];circles.push('<circle cx="'+x.toFixed(2)+'" cy="'+y.toFixed(2)+'" r="6.7" fill="'+seat.color+'"><title>'+esc(seat.name)+(seat.selected?' · בקואליציה':' · לא נבחרה')+'</title></circle>');}});
 $('coalition-seats').innerHTML='<svg viewBox="0 0 500 255" role="img" aria-label="'+total+' מושבים נבחרו מתוך 120">'+circles.join('')+'</svg>';
}
$('coalition-parties').addEventListener('click',e=>{const b=e.target.closest('[data-party]');if(!b||!current)return;const code=b.dataset.party;coalitionSelection.has(code)?coalitionSelection.delete(code):coalitionSelection.add(code);renderCoalition(current);});
$('coalition-presets').addEventListener('click',e=>{const b=e.target.closest('[data-bloc]');if(!b||!current)return;coalitionSelection.clear();current.parties.filter(p=>p.bloc===b.dataset.bloc&&p.seats>0).forEach(p=>coalitionSelection.add(p.code));renderCoalition(current);});
$('coalition-reset').addEventListener('click',()=>{coalitionSelection.clear();if(current)renderCoalition(current);});

function withAlternative(action){
 const original={prefix:activePrefix,current,expanded,selection:coalitionSelection};
 activePrefix='alt-';current=alternateData;expanded=alternateExpanded;coalitionSelection=alternateSelection;
 try{return action();}finally{alternateExpanded=expanded;activePrefix=original.prefix;current=original.current;expanded=original.expanded;coalitionSelection=original.selection;}
}
function renderAlternative(data){
 alternateData=data;
 let root=document.getElementById('alternative-view');
 if(!root){
  root=document.createElement('section');root.id='alternative-view';root.className='alternative-view';root.setAttribute('aria-labelledby','alternative-heading');
  root.innerHTML='<div class="alternative-heading"><span class="eyebrow">אותם נתונים · נקודת מבט נוספת</span><h2 id="alternative-heading">ממשלת אחדות - שבירת הקונספציה</h2><div id="alt-status" role="status"></div><div class="actions"><button id="alt-refresh" type="button">רענון תצוגה</button><button id="alt-download" type="button">הורדת תמונה — ממשלת אחדות</button></div></div><div id="alt-loading" hidden></div><div id="alt-data-note" class="notice hidden"></div><div id="alt-connection" class="notice hidden"></div>';
  const dashboard=document.getElementById('dashboard').cloneNode(true);
  [dashboard,...dashboard.querySelectorAll('[id]')].forEach(el=>{if(el.id)el.id='alt-'+el.id;});
  dashboard.querySelectorAll('[aria-labelledby]').forEach(el=>el.setAttribute('aria-labelledby',el.getAttribute('aria-labelledby').split(' ').map(id=>'alt-'+id).join(' ')));
  const groupingNote=dashboard.querySelector('.block-heading span');if(groupingNote)groupingNote.textContent='ממשלת אחדות - שבירת הקונספציה';
  dashboard.querySelectorAll('.method-content p').forEach(el=>{if(el.textContent.includes('שמות הרשימות והשיוך לגושים'))el.textContent='חישוב המנדטים והסכמי העודפים זהים לתצוגה המקורית; יתר הרשימות נכללות באחרים בפילוח היישובים.';});
  root.appendChild(dashboard);const stamp=document.createElement('p');stamp.id='alt-timestamp';stamp.className='footnote';root.appendChild(stamp);
  document.querySelector('main').insertBefore(root,document.getElementById('election-map'));
  root.addEventListener('click',e=>withAlternative(()=>{
   const button=e.target.closest('button');if(!button)return;
   if(button.id==='alt-toggle'){expanded=!expanded;renderTable();}
   else if(button.id==='alt-refresh'){render(alternateData);}
   else if(button.id==='alt-download'){download();}
   else if(button.id==='alt-coalition-reset'){coalitionSelection.clear();renderCoalition(current);}
   else if(button.dataset.party){const code=button.dataset.party;coalitionSelection.has(code)?coalitionSelection.delete(code):coalitionSelection.add(code);renderCoalition(current);}
   else if(button.dataset.bloc){coalitionSelection.clear();current.parties.filter(p=>p.bloc===button.dataset.bloc&&p.seats>0).forEach(p=>coalitionSelection.add(p.code));renderCoalition(current);}
  }));
 }
 withAlternative(()=>render(data));
}

function applyViewMode(){
 document.dispatchEvent(new CustomEvent('election-mode',{detail:viewMode}));
 const unity=viewMode==='unity';
 const original=document.getElementById('dashboard'),alternative=document.getElementById('alternative-view');
 if(original)original.hidden=unity||!current;
 if(alternative)alternative.hidden=!unity;
 document.getElementById('view-traditional').setAttribute('aria-pressed',String(!unity));
 document.getElementById('view-unity').setAttribute('aria-pressed',String(unity));
}
document.getElementById('view-traditional').addEventListener('click',()=>{viewMode='traditional';history.replaceState(null,'',location.pathname+location.search);applyViewMode();});
document.getElementById('view-unity').addEventListener('click',()=>{viewMode='unity';history.replaceState(null,'','#alternative-heading');applyViewMode();});
applyViewMode();
