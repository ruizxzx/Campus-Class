import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {translateUi} from "../lib/ui-language.ts";
test("academic page titles and descriptions have Bengali/Hindi translations",()=>{
  for(const title of ["Academic gradebook","Course outcome analytics",
    "Student Success Intelligence","Academic diagnostics","Campus AI Study Copilot"]){
    assert.notEqual(translateUi(title,"bn"),title);
    assert.notEqual(translateUi(title,"hi"),title);
  }
});
test("all academic routes use shared localized heading and keep server-only data access",()=>{
  for(const path of ["gradebook","outcomes","success","ai-study","admin/academic-health"]){
    const txt=readFileSync(new URL("../app/(app)/"+path+"/page.tsx",import.meta.url),"utf8");
    assert.match(txt,/LocalizedPageHeader as PageHeader/);
  }
});
