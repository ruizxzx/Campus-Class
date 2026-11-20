import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("public certificate verification does not reveal student identities or grade data",()=>{
 const handler=read("app/api/certificates/verify/route.ts");
 const db=read("lib/certificates/verification.ts");
 assert.match(handler,/lookupCertificate/);
 assert.match(db,/revoked_at/);
 assert.ok(!db.includes("student_id")&&!db.includes("student_name")&&!db.includes("marks"));
 assert.match(read("app/verify/\[number\]/page.tsx"),/Certificate verification/);
});
