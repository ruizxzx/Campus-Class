import { test, expect, type Page } from "@playwright/test";

const admin={email:process.env.E2E_ADMIN_EMAIL,password:process.env.E2E_ADMIN_PASSWORD};
const student={email:process.env.E2E_STUDENT_EMAIL,password:process.env.E2E_STUDENT_PASSWORD};

async function login(page:Page,user:{email?:string;password?:string}){
  if(!user.email||!user.password)throw new Error("Missing staging test credentials.");
  await page.goto("/login");
  await page.getByLabel("Email address").fill(user.email);
  await page.getByLabel("Password",{exact:true}).fill(user.password);
  await page.getByRole("button",{name:/Sign in/}).click();
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
}

test.describe("Anonymous browser smoke",()=>{
  test("public sign-in form is accessible and responsive",async({page})=>{
    await page.goto("/login");
    await expect(page.getByRole("heading",{name:"Welcome back"})).toBeVisible();
    await expect(page.getByLabel("Email address")).toBeVisible();
    await expect(page.getByLabel("Password",{exact:true})).toBeVisible();
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(2);
  });
  test("anonymous browser cannot see the staff outcomes dashboard",async({page})=>{
    await page.goto("/outcomes");
    await expect(page.getByRole("heading",{name:"Welcome back"})).toBeVisible();
    await expect(page.getByText("Outcome attainment")).toHaveCount(0);
  });
});

test.describe("Authenticated academic acceptance (requires isolated staging users)",()=>{
  test.skip(!admin.email||!admin.password,"Configure E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD with a staging admin account.");

  const pages=[
    {path:"/success",title:"Student Success Intelligence"},
    {path:"/gradebook",title:"Academic gradebook"},
    {path:"/outcomes",title:"Course outcome analytics"},
  ];
  for(const item of pages){
    test(item.path+" has no server crash or missing academic schema",async({page})=>{
      await login(page,admin);
      await page.goto(item.path);
      await expect(page.getByRole("heading",{name:item.title})).toBeVisible();
      await expect(page.getByText("This page couldn")).toHaveCount(0);
      await expect(page.getByText(/academic database setup needs an update/i)).toHaveCount(0);
      await expect(page.getByText(/academic database access needs repair/i)).toHaveCount(0);
      await expect(page.getByText(/academic records are temporarily unavailable/i)).toHaveCount(0);
    });
  }
  test("admin diagnostics identifies all academic schema prerequisites",async({page})=>{
    await login(page,admin);
    await page.goto("/admin/academic-health");
    await expect(page.getByRole("heading",{name:"Academic diagnostics"})).toBeVisible();
    await expect(page.getByText(/academic checks need attention/i)).toHaveCount(0);
    await expect(page.getByText(/server connection is unavailable/i)).toHaveCount(0);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(2);
  });
});

test.describe("Student role security acceptance (requires isolated staging student)",()=>{
  test.skip(!student.email||!student.password,"Configure E2E_STUDENT_EMAIL and E2E_STUDENT_PASSWORD with a staging student account.");
  test("a student cannot view staff-only academic diagnostic and intervention pages",async({page})=>{
    await login(page,student);
    await page.goto("/admin/academic-health");
    await expect(page.getByRole("heading",{name:"Academic diagnostics"})).toHaveCount(0);
    await page.goto("/success");
    await expect(page.getByRole("heading",{name:"Student Success Intelligence"})).toHaveCount(0);
    await page.goto("/ai-study");
    await expect(page.getByRole("heading",{name:"Campus AI Study Copilot"})).toBeVisible();
  });
});
