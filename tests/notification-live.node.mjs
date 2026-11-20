import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("notifications are owner-scoped and automatically refreshed",()=>{
 const list=read("components/notification-list.tsx");
 const bell=read("components/notification-bell.tsx");
 assert.match(list,/user_id=eq/);
 assert.match(list,/setInterval/);
 assert.match(bell,/user_id=eq/);
 assert.match(bell,/unread>99/);
 assert.match(read("components/app-shell.tsx"),/NotificationBell userId=\{profile.id\}/);
});
