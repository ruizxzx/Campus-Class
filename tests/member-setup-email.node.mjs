import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("manual member creation allows opt-in secure account setup email through shared provisioning",()=>{
 assert.match(read("lib/validators.ts"),/send_setup_email: z.boolean\(\).default\(false\)/);
 assert.match(read("components/admin-managers.tsx"),/send_setup_email: sendSetupEmail/);
 const api=read("app/api/invitations/route.ts");
 const shared=read("lib/member-provisioning.ts");
 assert.match(api,/provisionMember/);
 assert.match(shared,/input\.send_setup_email && !synthetic/);
 assert.match(shared,/resetPasswordForEmail/);
 assert.match(shared,/Account created; setup email could not be sent/);
});
