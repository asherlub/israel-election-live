
const $=id=>document.getElementById(id);
const num=n=>n==null?'—':new Intl.NumberFormat('he-IL').format(n);
const pct=n=>n.toFixed(2)+'%';
const date=s=>s?new Intl.DateTimeFormat('he-IL',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Jerusalem'}).format(new Date(s)):'טרם אומת';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let current,expanded=false,busy=false;
function statusText(s){
  if(s.origin==='seed')return 'עותק התחלתי שסופק · '+s.seedDate+' · טרם התקבל עדכון מהמקור';
  if(s.origin==='drive')return 'קובץ Google Drive בהעלאה ידנית · בדיקת הקובץ: '+date(s.lastSuccess);
  return (s.lastError||s.stale||s.clientDisconnected?'מוצג העותק האחרון · ':'מחובר למקור · ')+'בדיקה מוצלחת: '+date(s.lastSuccess);
}
function render(d){
  current=d;
  $('loading').hidden=true;$('dashboard').hidden=false;$('download').disabled=false;
  $('status').innerHTML='<i class="dot '+(d.status.lastError||d.status.stale||d.status.clientDisconnected?'warn':'')+'"></i>'+esc(statusText(d.status));
  const notices=[];
  if(d.status.origin==='drive')notices.push('הנתונים מבוססים על קובץ שהועלה ידנית ל־Google Drive. האתר בודק את הקובץ כל 15 דקות; זמן הבדיקה אינו זמן עדכון ועדת הבחירות. קובץ חדש ייקלט לאחר החלפת הגרסה של אותו קובץ ב־Drive.');
  if(d.status.origin==='seed')notices.push('המספרים מבוססים על הקובץ שסופק מ־'+d.status.seedDate+'. טרם אומתה הורדה מהמקור הרשמי.');
  if(d.status.lastError)notices.push(d.status.lastError);
  else if(d.status.stale&&d.status.origin!=='seed')notices.push('חלף זמן מאז הבדיקה המוצלחת האחרונה. העדכניות אינה מאומתת כעת.');
  if(d.status.persistenceError)notices.push(d.status.persistenceError);
  $('data-note').textContent=notices.join(' ');$('data-note').classList.toggle('hidden',!notices.length);
  const stats=[
    ['קולות כשרים',num(d.valid),'מתוך '+num(d.voters)+' מצביעים','#0664ec'],
    ['סף כניסה · 3.25%',num(d.threshold),'קולות לרשימה, לפי הספירה הנוכחית','#009783'],
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
  $('agreement-note').textContent=d.agreementsVerified?'ההסכמים שהוגדרו לחישוב אומתו על ידי מפעיל האתר.':'החישוב מותנה בחמשת הסכמי העודפים שלהלן, על סמך דיווח תקשורתי. טרם אומתו מול הודעה רשמית של ועדת הבחירות.';
  $('agreements').innerHTML=d.agreements.map(pair=>'<span>'+pair.map(p=>esc(p.name)).join(' + ')+(pair.every(p=>p.active)?'':' · לא פעיל בספירה זו')+'</span>').join('');
  $('agreement-source').href=d.agreementsSource;
  $('audit').innerHTML='<div class="audit"><div>יישובים בקובץ<b>'+num(d.localities)+'</b></div><div>קולות פסולים<b>'+num(d.invalid)+'</b></div><div>מצביעים<b>'+num(d.voters)+'</b></div></div><p>בדיקת מקור כל '+d.status.pollSeconds/60+' דקות; רענון מסך בכל דקה. לחצן הרענון קורא את הנתונים שנשמרו בשרת.<br>ניסיון בדיקה אחרון: '+date(d.status.lastAttempt)+' · בדיקה מוצלחת: '+date(d.status.lastSuccess)+'<br>שינוי בקובץ זוהה לראשונה: '+date(d.status.dataChangedAt)+' · זמן שינוי לפי שרת המקור: '+(d.status.sourceModified?date(d.status.sourceModified):'לא נמסר')+'</p>';
  $('timestamp').textContent='נתונים נבדקו: '+date(d.status.lastSuccess);
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
  if(!current)return;const d=structuredClone(current);d.status.stale=d.status.stale||!d.status.lastSuccess||Date.now()-Date.parse(d.status.lastSuccess)>d.status.pollSeconds*2500;
  $('download').disabled=true;
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
    text('תמונת המנדטים והקולות המבוזבזים',1160,103,44,'white',true);
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
  finally{$('download').disabled=false;}
}
$('toggle').addEventListener('click',()=>{expanded=!expanded;renderTable();});
$('refresh').addEventListener('click',load);
$('download').addEventListener('click',download);
load();setInterval(()=>{if(!document.hidden)load();},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});


