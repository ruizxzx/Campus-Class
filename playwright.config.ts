import { defineConfig, devices } from "@playwright/test";

const baseURL=process.env.E2E_BASE_URL??"http://127.0.0.1:3000";
const remote=Boolean(process.env.E2E_BASE_URL);
export default defineConfig({
  testDir:"./e2e",fullyParallel:false,timeout:60_000,
  expect:{timeout:12_000},retries:process.env.CI?1:0,
  reporter:process.env.CI?"github":"list",
  use:{baseURL,trace:"retain-on-failure",screenshot:"only-on-failure"},
  projects:[
    {name:"desktop-chromium",use:{...devices["Desktop Chrome"]}},
    {name:"mobile-375-chromium",use:{...devices["iPhone 12"],browserName:"chromium"}},
  ],
  webServer:remote?undefined:{
    command:"pnpm dev",url:baseURL+"/login",
    reuseExistingServer:!process.env.CI,timeout:120_000,
    env:{
      NEXT_PUBLIC_SUPABASE_URL:process.env.NEXT_PUBLIC_SUPABASE_URL??"https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY??"sb_publishable_e2e_placeholder",
      SUPABASE_SERVICE_ROLE_KEY:process.env.SUPABASE_SERVICE_ROLE_KEY??"sb_secret_e2e_placeholder",
      NEXT_PUBLIC_APP_URL:baseURL,
    },
  },
});
