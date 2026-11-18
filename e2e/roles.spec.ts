import { test, expect } from "@playwright/test";

// Read-only staging journeys; no database mutation or production fixtures.
// Set E2E_BASE_URL and the corresponding test credentials in an isolated
// staging environment. These tests intentionally skip without credentials.
const cases=[
  {role:"admin",email:process.env.E2E_ADMIN_EMAIL,password:process.env.E2E_ADMIN_PASSWORD,
    paths:["/dashboard","/admin/classes","/admin/ai","/success","/gradebook","/outcomes"]},
  {role:"faculty",email:process.env.E2E_FACULTY_EMAIL,password:process.env.E2E_FACULTY_PASSWORD,
    paths:["/dashboard","/faculty/learning","/faculty/courses","/success","/gradebook","/outcomes"]},
  {role:"student",email:process.env.E2E_STUDENT_EMAIL,password:process.env.E2E_STUDENT_PASSWORD,
    paths:["/dashboard","/courses","/quizzes","/ai-study","/gradebook"]},
] as const;
for(const roleCase of cases){
  test(roleCase.role+" read-only role journey",async({page})=>{
    test.skip(!roleCase.email||!roleCase.password,
      "Needs seeded staging credentials for this role.");
    await page.goto("/login");
    await page.getByRole("textbox",{name:"Email address"}).fill(roleCase.email!);
    await page.getByLabel("Password",{exact:true}).fill(roleCase.password!);
    await page.getByRole("button",{name:"Sign in"}).click();
    await expect(page).toHaveURL(/\/dashboard/,{timeout:20000});
    for(const path of roleCase.paths){
      const response=await page.goto(path);
      expect(response?.status(),path).toBeLessThan(400);
      await expect(page.locator("body")).not.toContainText("Internal Server Error");
    }
  });
}
