import { spawn } from 'node:child_process';
import http from 'node:http'; import path from 'node:path';
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe'; const PORT=9350;
const STATIC='http://localhost:5599';
const chrome=spawn(CHROME,['--headless=new',`--remote-debugging-port=${PORT}`,'--disable-gpu','--no-first-run','--user-data-dir='+path.resolve('_ctmp_auth'),'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function gj(p){return new Promise((res,rej)=>{http.get(`http://127.0.0.1:${PORT}${p}`,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)));}).on('error',rej);});}
let wsUrl;for(let i=0;i<40;i++){try{const t=await gj('/json');const pg=t.find(x=>x.type==='page');if(pg){wsUrl=pg.webSocketDebuggerUrl;break;}}catch(e){}await sleep(250);}
const ws=new WebSocket(wsUrl);let id=0;const pend=new Map();const logs=[];
function cmd(m,p={}){return new Promise(res=>{const mid=++id;pend.set(mid,res);ws.send(JSON.stringify({id:mid,method:m,params:p}));});}
await new Promise(r=>ws.addEventListener('open',r));
ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m.result);pend.delete(m.id);} else if(m.method==='Runtime.consoleAPICalled'){const a=(m.params.args||[]).map(x=>x.value).join(' '); logs.push('['+m.params.type+'] '+a);} else if(m.method==='Runtime.exceptionThrown'){logs.push('[EXCEPTION] '+(m.params.exceptionDetails?.exception?.description||JSON.stringify(m.params.exceptionDetails)));}});
await cmd('Page.enable'); await cmd('Runtime.enable');

const scenario = process.argv[2] || 'loggedin';

// Go to signin first (origin localhost:5599) so we can set localStorage + do a real login fetch
await cmd('Page.navigate',{url:`${STATIC}/landingpage/signin.html`}); await sleep(1200);

if (scenario === 'loggedin') {
  // Perform a real login via the API from the page context (sets cookie + returns token)
  const login = await cmd('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{
    const r = await fetch('http://localhost:5000/api/auth/login',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'hsplayer@test.com',password:'Test123!@#',rememberMe:true})});
    const d = await r.json();
    localStorage.setItem('dr_remember_me','true');
    localStorage.setItem('user_data', JSON.stringify(d.user||{}));
    // emulate iOS bearer storage so the path is exercised even though this is 'web'
    if(d.token) localStorage.setItem('dr_auth_token', d.token);
    return {status:r.status, role:(d.user||{}).role, hasToken: !!d.token};
  })()`});
  console.log('LOGIN_RESULT:'+JSON.stringify(login.result.value));
} else if (scenario === 'loggedout') {
  await cmd('Runtime.evaluate',{expression:`localStorage.clear();`});
  // also clear cookie by calling logout
  await cmd('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{try{await fetch('http://localhost:5000/api/auth/logout',{method:'POST',credentials:'include'});}catch(e){} return 'cleared';})()`});
}

// Now navigate to the LANDING page and see what happens (redirect or stay)
logs.length=0;
await cmd('Page.navigate',{url:`${STATIC}/landingpage/index.html`});
await sleep(2500); // allow auto-login IIFE + redirect
const final = await cmd('Runtime.evaluate',{returnByValue:true,expression:`({url: location.href, title: document.title, hasSigninBtn: !!document.querySelector('a[href*="signin"]'), bodyClass: document.body.className})`});
console.log('FINAL:'+JSON.stringify(final.result.value));
console.log('CONSOLE:'+JSON.stringify(logs.slice(0,15)));
ws.close(); chrome.kill(); process.exit(0);
