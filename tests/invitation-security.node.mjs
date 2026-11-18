import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = readFileSync(new URL('../app/api/invitations/accept/route.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function harness({ signedIn = null, token = null, passwordValid = false } = {}) {
  const calls = [];
  const invitation = { id: 'inv', college_id: 'college', email: 'student@example.edu', role: 'student',
    full_name: 'Student', accepted_at: null, expires_at: '2099-01-01T00:00:00Z' };
  let user = signedIn;
  const admin = {
    auth: { admin: { createUser: async () => { calls.push('createUser'); return { error: { message: 'exists' } }; } } },
    from(table) {
      let action = 'select';
      const filters = [];
      const builder = {
        select() { return this; }, eq(k,v) { filters.push([k,v]); return this; },
        ilike(k,v) { filters.push([k,v]); return this; }, is() { return this; },
        gt() { return this; }, order() { return this; }, limit() { return this; },
        update() { action='update'; return this; },
        maybeSingle() {
          calls.push({table,action});
          if(table==='college_invitations') {
            if(action==='update') return Promise.resolve({data:{id:'inv'},error:null});
            const validToken = filters.some(([k,v])=>k==='token_hash' && v===token);
            const validEmail = filters.some(([k,v])=>k==='email' && v===invitation.email);
            return Promise.resolve({data: validToken ? invitation : validEmail && !filters.some(([k])=>k==='token_hash') ? [invitation] : null,error:null});
          }
          return Promise.resolve({data:null,error:null});
        },
        then(ok,bad) { return this.maybeSingle().then(ok,bad); },
        upsert: async () => { calls.push('upsert'); return {error:null}; },
        insert: async () => ({error:null}),
      };
      return builder;
    },
  };
  const client = { auth: {
    getUser: async () => ({data:{user},error:null}),
    signInWithPassword: async ({email,password}) => {
      if(passwordValid && email===invitation.email && password==='correct-password') {
        user={id:'student-id',email}; return {data:{user},error:null};
      }
      return {data:{user:null},error:{message:'Invalid credentials'}};
    },
  } };
  const exports = {};
  runInNewContext(compiled, { exports, Buffer, Date, console, require(name) {
    if(name==='node:crypto') return require('node:crypto');
    if(name==='next/server') return {NextResponse:{json:(body,options)=>({status:options?.status??200,body})}};
    if(name==='@/lib/supabase/server') return {createClient:async()=>client};
    if(name==='@/lib/supabase/admin') return {createAdminClient:()=>admin};
    if(name==='@/lib/validators') return {acceptInviteSchema:{safeParse:data=>({success:true,data})}};
    throw new Error(name);
  }});
  return { calls, post:data=>exports.POST({json:async()=>data}) };
}

test('anonymous tokenless request cannot claim an invitation',async()=>{
  const h=harness(); const result=await h.post({email:'student@example.edu',password:'wrong'});
  assert.equal(result.status,401); assert.equal(h.calls.some(x=>x==='upsert'),false);
});
test('invalid token never falls back to email',async()=>{
  const h=harness({signedIn:{id:'student-id',email:'student@example.edu'}});
  const result=await h.post({token:'invalid',email:'student@example.edu'});
  assert.equal(result.status,404); assert.equal(h.calls.some(x=>x==='upsert'),false);
});
test('authenticated invited user can claim invitation',async()=>{
  const h=harness({signedIn:{id:'student-id',email:'student@example.edu'}});
  const result=await h.post({email:'student@example.edu'});
  assert.equal(result.status,200); assert.equal(h.calls.includes('upsert'),true);
});
test('a different authenticated email cannot claim a token',async()=>{
  const secret='correct-token'; const hash=createHash('sha256').update(secret).digest('hex');
  const h=harness({signedIn:{id:'other',email:'other@example.edu'},token:hash});
  const result=await h.post({token:secret,email:'student@example.edu'});
  assert.equal(result.status,403); assert.equal(h.calls.includes('upsert'),false);
});
