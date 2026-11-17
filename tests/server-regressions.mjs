import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac,randomUUID } from 'node:crypto';
import WebSocket from 'ws';
const port=8994,key='local-regression-key';
const server=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),PLATFORM_SHARED_SECRET:key,PLATFORM_SUPABASE_SERVICE_ROLE_KEY:'',SUPABASE_SERVICE_ROLE_KEY:''},stdio:'pipe'});
let ws;
try{
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('startup timeout')),7000);server.stdout.once('data',()=>{clearTimeout(timer);resolve()});server.once('exit',code=>{clearTimeout(timer);reject(Error('server exited '+code))})});
 const base=`http://127.0.0.1:${port}`;
 assert.equal((await (await fetch(base+'/health')).json()).status,'ok');
 for(const path of ['/server.js','/.env.local','/package.json','/net/rooms.js'])assert.equal((await fetch(base+path)).status,404,path);
 for(const path of ['/','/js/main.js','/css/style.css'])assert.equal((await fetch(base+path)).status,200,path);
 ws=new WebSocket(`ws://127.0.0.1:${port}/ws`);const received=[];ws.on('message',raw=>received.push(JSON.parse(raw)));
 await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject)});
 ws.send('null');ws.send('[]');ws.send('{invalid-json');ws.send(JSON.stringify({type:'create',name:42}));
 await new Promise(resolve=>setTimeout(resolve,100));assert.ok(received.some(msg=>msg.type==='created'));
 assert.equal((await fetch(base+'/health')).status,200,'malformed messages cannot crash all games');
 ws.send(JSON.stringify({type:'leave'}));
 const user=randomUUID(),payload=Buffer.from(JSON.stringify({uid:user,username:'PseudoCompletDeLaPlateforme',exp:Math.floor(Date.now()/1000)+60})).toString('base64url');
 const token=payload+'.'+createHmac('sha256',key).update(payload).digest('base64url');
 ws.send(JSON.stringify({type:'create',name:'Un autre nom',rgToken:token}));await new Promise(resolve=>setTimeout(resolve,100));
 const lobby=received.filter(msg=>msg.type==='lobby').at(-1);assert.equal(lobby.players[0].name,'PseudoCompletDeLaPlateforme');
 assert.equal((await (await fetch(base+'/health')).json()).connectedPlayers,1);
 console.log('PASS real HTTP/WebSocket: malformed messages isolated, assets served, private files blocked, profile name authenticated, JSON health and connected player count');
}finally{ws?.terminate();server.kill()}
