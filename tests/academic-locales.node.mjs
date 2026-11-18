import test from "node:test";
import assert from "node:assert/strict";
import {translateUi,isUiLanguage} from "../lib/ui-language.ts";
test("extended academic and student-copilot labels render in Bengali and Hindi",()=>{
  for(const source of ["Outcome attainment","Academic support signals",
    "Class grading policy","Campus AI Study Copilot","No data"]){
    assert.notEqual(translateUi(source,"bn"),source);
    assert.notEqual(translateUi(source,"hi"),source);
    assert.equal(translateUi(source,"en"),source);
  }
});
test("unsupported language and faculty content are not automatically machine-translated",()=>{
  assert.equal(isUiLanguage("fr"),false);
  assert.equal(translateUi("Original faculty-provided question","bn"),
    "Original faculty-provided question");
});
test("shared browser locale subscriptions notify nested components",()=>{
  const hook=requireSource();
  assert.match(hook,/useSyncExternalStore\(subscribe,readLanguage/);
  assert.match(hook,/window.dispatchEvent\(new Event\(eventName\)\)/);
});
function requireSource(){
  return require("node:fs").readFileSync(new URL("../lib/use-ui-language.ts",import.meta.url),"utf8");
}
