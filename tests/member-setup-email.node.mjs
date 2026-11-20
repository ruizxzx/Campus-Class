import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("manual member creation allows opt-in secure account setup email",()=>{
 assert.match(read("lib/validators.ts"),/send_setup_email: z.boolean\(\).default\(false\)/);
 assert.match(read("components/admin-managers.tsx"),/send_setup_email: sendSetupEmail/);
 const api=read("app/api/invitations/route.ts");
 assert.match(api,/resetPasswordForEmail/);
 assert.match(api,/setupEmailWarning/);
});
