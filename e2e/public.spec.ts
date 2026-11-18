import { test, expect } from "@playwright/test";

test("public login page has accessible sign-in and password controls", async ({page}) => {
  await page.goto("/login");
  await expect(page.getByRole("heading",{name:"Welcome back"})).toBeVisible();
  await expect(page.getByRole("textbox",{name:"Email address"})).toBeVisible();
  await expect(page.getByLabel("Password",{exact:true})).toBeVisible();
  const password=page.getByLabel("Password",{exact:true});
  await password.fill("temporary-demo-value");
  await page.getByRole("button",{name:"Toggle password visibility"}).click();
  await expect(password).toHaveAttribute("type","text");
  await page.getByRole("button",{name:"Toggle password visibility"}).click();
  await expect(password).toHaveAttribute("type","password");
  await expect(page.getByRole("button",{name:"Sign in"})).toBeVisible();
});

test("auth routes work with narrow mobile layouts and do not overflow horizontally",async({page})=>{
  for(const width of [320,375,768]){
    await page.setViewportSize({width,height:780});
    for(const route of ["/login","/register","/forgot-password"]){
      await page.goto(route);
      await expect(page.locator("h1")).toBeVisible();
      const overflow=await page.evaluate(()=>({
        viewport:document.documentElement.clientWidth,
        content:document.documentElement.scrollWidth,
      }));
      expect.soft(overflow.content,route+" overflows at "+width+"px").toBeLessThanOrEqual(overflow.viewport+1);
    }
  }
});

test("navigation between public onboarding routes works without JavaScript errors",async({page})=>{
  const faults:string[]=[];
  page.on("pageerror",(error)=>faults.push(error.message));
  await page.goto("/login");
  await page.getByRole("link",{name:"Create a workspace"}).click();
  await expect(page.getByRole("heading",{name:"Create your college workspace"})).toBeVisible();
  await page.getByRole("link",{name:"Sign in"}).click();
  await expect(page.getByRole("heading",{name:"Welcome back"})).toBeVisible();
  await page.getByRole("link",{name:"Forgot password?"}).click();
  await expect(page.getByRole("heading",{name:"Reset your password"})).toBeVisible();
  expect(faults).toEqual([]);
});

test("PWA manifest exposes an installable start URL",async({request})=>{
  const response=await request.get("/manifest.webmanifest");
  expect(response.ok()).toBeTruthy();
  const manifest=await response.json();
  expect(manifest.start_url).toBe("/dashboard");
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons?.length).toBeGreaterThan(0);
});
