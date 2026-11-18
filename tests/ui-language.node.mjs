import test from "node:test";
import assert from "node:assert/strict";
import { isUiLanguage, translateUi } from "../lib/ui-language.ts";

test("English is the fallback for all shared labels", () => {
  assert.equal(translateUi("Timetable", "en"), "Timetable");
  assert.equal(translateUi("Unknown module", "bn"), "Unknown module");
});
test("Hindi and Bengali navigation labels are available", () => {
  assert.equal(translateUi("Attendance", "bn"), "উপস্থিতি");
  assert.equal(translateUi("Attendance", "hi"), "उपस्थिति");
});
test("only supported language codes can be restored from preferences", () => {
  assert.equal(isUiLanguage("bn"), true);
  assert.equal(isUiLanguage("hi"), true);
  assert.equal(isUiLanguage("<script>"), false);
});
