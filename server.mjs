
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
import {ResultsStore} from './store.mjs';
const root=dirname(fileURLToPath(import.meta.url));
const config=JSON.parse(await readFile(join(root,'config.json'),'utf8'));
const seconds=Number(process.env.POLL_SECONDS||900);
if(!Number.isFinite(seconds)||seconds<60)throw new Error('POLL_SECONDS must be at least 60');
const sourceUrl=process.env.SOURCE_URL||config.sourceUrl;
if(!/^https:\/\//.test(sourceUrl))throw new Error('SOURCE_URL must use HTTPS');
const store=new ResultsStore(config,{dataDir:process.env.DATA_DIR||join(root,'cache'),sourceUrl,interval:seconds*1000});
await store.init(join(root,'data/seed.csv'));
const routes={'/map.js':['map.js','text/javascript; charset=utf-8'],'/map.css':['map.css','text/css; charset=utf-8'],'/map-geo.json':['map-geo.json','application/json; charset=utf-8'],'/':['index.html','text/html; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8']};
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
  const pathname=new URL(req.url,'http://localhost').pathname;
  try{
    let body,type;
    if(pathname==='/healthz'){body=JSON.stringify({ok:true,dataLoaded:!!store.data});type='application/json';}
    else if(pathname==='/api/results'){body=JSON.stringify(store.view());type='application/json; charset=utf-8';}
    else if(pathname==='/api/source.csv'){body=store.snapshot.csv;type='text/csv; charset=utf-8';res.setHeader('Content-Disposition','attachment; filename="election-source.csv"');}
    else if(routes[pathname]){const [file,mime]=routes[pathname];body=await readFile(join(root,'public',file));type=mime;}
    else{res.writeHead(404);res.end('Not found');return;}
    res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',type);res.writeHead(200);res.end(req.method==='HEAD'?undefined:body);
  }catch(e){console.error(e.message);res.writeHead(500);res.end('Server error');}
});
server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('Local: http://localhost:'+(process.env.PORT||3000)));
let timer;
if(process.env.OFFLINE!=='1'){void store.refresh();timer=setInterval(()=>void store.refresh(),seconds*1000);}
function stop(){clearInterval(timer);server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),5000).unref();}
process.on('SIGTERM',stop);process.on('SIGINT',stop);

