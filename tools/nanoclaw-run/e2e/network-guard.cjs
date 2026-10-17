// Audit-only preload. Used ONLY by the isolated application process, never the agent.
// This is a side-effect guard, not an OS-level network sandbox.
const fs = require('node:fs');
const net = require('node:net');
const http = require('node:http');
const https = require('node:https');
const local = h => ['127.0.0.1','localhost','::1','[::1]'].includes(String(h || '').toLowerCase());
const event = data => { if (process.env.AUDIT_NETWORK_LOG) fs.appendFileSync(process.env.AUDIT_NETWORK_LOG, JSON.stringify({time:new Date().toISOString(),...data})+'\n'); };
const realFetch = globalThis.fetch;
globalThis.fetch = async function(input,init={}) {
 const url = new URL(typeof input==='string' || input instanceof URL ? input : input.url);
 if (local(url.hostname)) return realFetch(input,init);
 if (url.hostname==='challenges.cloudflare.com' && url.pathname.endsWith('/siteverify')) {
  const values=new URLSearchParams(String(init.body || ''));
  const ok=values.get('response')==='audit-pass';event({kind:'turnstile_mock',success:ok});
  return Response.json({success:ok,hostname:'cloudjourneyblog.rohi-lab.org',action:'contact','error-codes':ok?[]:['invalid-input-response']});
 }
 if (url.hostname==='api.resend.com' && url.pathname==='/emails') {
  event({kind:'email_mock',realMailSent:false});return Response.json({id:'audit-mock-no-real-mail'});
 }
 if (process.env.AUDIT_MOCK_FEEDS==='1') {
  event({kind:'feed_mock',host:url.hostname});
  return new Response('<?xml version="1.0"?><rss version="2.0"><channel><title>Audit synthetic feed</title><link>https://fixture.invalid/</link><description>Isolated test data</description><item><title>Safe audit item</title><link>https://fixture.invalid/item</link><description>&lt;b&gt;synthetic&lt;/b&gt; text</description><pubDate>Fri, 16 Oct 2026 12:00:00 GMT</pubDate></item></channel></rss>',{headers:{'content-type':'application/rss+xml'}});
 }
 event({kind:'blocked_fetch',host:url.hostname});throw new Error('AUDIT_EXTERNAL_FETCH_BLOCKED');
};
for (const api of [http,https]) {
 const original=api.request;
 api.request=function(...args){
  const first=args[0];let host;
  if(typeof first==='string'||first instanceof URL) host=new URL(first).hostname;
  else host=first?.hostname||first?.host;
  if(!local(host)){event({kind:'blocked_http',host:String(host)});throw new Error('AUDIT_EXTERNAL_HTTP_BLOCKED');}
  return original.apply(this,args);
 };
 api.get=function(...args){const req=api.request(...args);req.end();return req;};
}
const connect=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args){
 let first=args[0];if(Array.isArray(first)) first=first[0];
 let host=typeof first==='object'?(first.host||first.hostname):typeof args[1]==='string'?args[1]:'localhost';
 if(typeof first==='object' && first.path) return connect.apply(this,args);
 if(!local(host)){event({kind:'blocked_socket',host:String(host)});throw new Error('AUDIT_EXTERNAL_SOCKET_BLOCKED');}
 return connect.apply(this,args);
};
