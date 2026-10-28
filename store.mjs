
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {aggregate,decodeCsv,summarize,localityBreakdown} from './election.mjs';
export class ResultsStore{
  constructor(config,{dataDir,fetcher=fetch,interval=900000,sourceUrl=config.sourceUrl}){
    Object.assign(this,{config,dataDir,fetcher,interval,sourceUrl});this.lastError=null;this.lastAttempt=null;this.busy=null;this.persistenceError=null;
  }
  async init(seed){
    try{
      const saved=JSON.parse(await readFile(join(this.dataDir,'latest.json'),'utf8'));
      if(typeof saved.csv!=='string'||!Number.isFinite(Date.parse(saved.fetchedAt)))throw new Error('Invalid saved snapshot');
      this.data=aggregate(saved.csv);this.snapshot=saved;
    }catch{
      const csv=decodeCsv(await readFile(seed));this.data=aggregate(csv);
      this.snapshot={csv,hash:this.hash(csv),fetchedAt:null,changedAt:null,sourceModified:null,origin:'seed',etag:null};
    }
  }
  hash(csv){return createHash('sha256').update(csv).digest('hex');}
  view(){
    return{...summarize(this.data,this.config),localityBreakdown:localityBreakdown(this.snapshot.csv,this.config),status:{origin:this.snapshot.origin,seedDate:this.config.seedDate,lastAttempt:this.lastAttempt,lastSuccess:this.snapshot.fetchedAt,dataChangedAt:this.snapshot.changedAt,sourceModified:this.snapshot.sourceModified,lastError:this.lastError,persistenceError:this.persistenceError,stale:!this.snapshot.fetchedAt||Date.now()-Date.parse(this.snapshot.fetchedAt)>this.interval*2.5,pollSeconds:this.interval/1000,hash:this.snapshot.hash,sourceUrl:this.sourceUrl}};
  }
  async persist(){
    try{
      await mkdir(this.dataDir,{recursive:true});
      await writeFile(join(this.dataDir,'latest.tmp'),JSON.stringify(this.snapshot),'utf8');
      await rename(join(this.dataDir,'latest.tmp'),join(this.dataDir,'latest.json'));this.persistenceError=null;
    }catch(e){this.persistenceError='לא ניתן לשמור עותק מתמשך של הנתונים';console.error('Cache persistence:',e.message);}
  }
  refresh(){
    if(this.busy)return this.busy;
    this.busy=this.runRefresh().finally(()=>{this.busy=null;});return this.busy;
  }
  async runRefresh(){
    this.lastAttempt=new Date().toISOString();
    try{
      const headers={'Accept':'text/csv,application/octet-stream;q=0.9,*/*;q=0.5','User-Agent':'ElectionSnapshot/1.0'};
      if(this.snapshot.etag&&['official','drive'].includes(this.snapshot.origin))headers['If-None-Match']=this.snapshot.etag;
      const response=await this.fetcher(this.sourceUrl,{headers,signal:AbortSignal.timeout(30000)});
      if(response.status===304){
        if(!['official','drive'].includes(this.snapshot.origin))throw new Error('Unexpected 304');
        this.snapshot.fetchedAt=new Date().toISOString();this.lastError=null;await this.persist();return;
      }
      console.info('SOURCE_HTTP',JSON.stringify({status:response.status,contentType:response.headers.get('content-type'),redirected:response.redirected,wafAction:response.headers.get('x-amzn-waf-action'),server:response.headers.get('server'),retryAfter:response.headers.get('retry-after')}));
      if(!response.ok)throw new Error('HTTP '+response.status);
      if(Number(response.headers.get('content-length'))>20_000_000)throw new Error('CSV exceeds limit');
      const chunks=[];let size=0;
      for await(const chunk of response.body){size+=chunk.length;if(size>20_000_000)throw new Error('CSV exceeds limit');chunks.push(chunk);}
      const bytes=Buffer.concat(chunks),csv=decodeCsv(bytes);
      const head=csv.slice(0,8000);
      const html=/<(?:!doctype\s+html|html|head|body)\b/i.test(head);
      console.info('SOURCE_FORMAT',JSON.stringify({
        bytes:bytes.length,firstBytesHex:bytes.subarray(0,12).toString('hex'),
        html,challenge:/captcha|incapsula|imperva|cloudflare|verify.{0,50}(human|robot)|javascript is disabled|access denied/i.test(head),
        title:html?(head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'').replace(/<[^>]*>/g,'').slice(0,120):undefined,
        firstLine:html?undefined:csv.split(/\r?\n/)[0].slice(0,250)
      }));
      if(html)throw new Error('Source returned HTML instead of CSV');
      const data=aggregate(csv),hash=this.hash(csv),now=new Date().toISOString();
      this.snapshot={csv,hash,fetchedAt:now,changedAt:hash===this.snapshot.hash?this.snapshot.changedAt||now:now,sourceModified:response.headers.get('last-modified'),etag:response.headers.get('etag'),origin:new URL(this.sourceUrl).hostname==='drive.google.com'?'drive':'official'};
      this.data=data;this.lastError=null;await this.persist();
    }catch(e){
      this.lastError='ההורדה או בדיקת הנתונים נכשלה; מוצג העותק האחרון שעבר בדיקה.';
      console.error('Refresh failed:',e.message,e.cause?.code||'');
    }
  }
}