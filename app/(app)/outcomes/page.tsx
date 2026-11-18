import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/ui";
import { OutcomeDashboard } from "@/components/outcome-dashboard";

export const dynamic = "force-dynamic";
export default async function OutcomesPage({ searchParams }: { searchParams: Promise<{ class_id?: string }> }) {
  const profile = await requireRole(["admin","faculty"]);
  const db = createAdminClient();
  const collegeId = profile.college_id;
  const relations = profile.role === "faculty"
    ? await db.from("class_faculty").select("class_id").eq("college_id", collegeId).eq("faculty_id", profile.id)
    : { data: null, error: null };
  if (relations.error) throw new Error("Unable to verify faculty access.");
  const classIds = relations.data?.map((item) => item.class_id) ?? [];
  const query = db.from("classes").select("id,subject_id,display_name,section,subjects(name,code)")
    .eq("college_id", collegeId).eq("is_active", true);
  const { data: rawClasses, error: classesError } = profile.role === "admin"
    ? await query.limit(200)
    : classIds.length ? await query.in("id", classIds).limit(200) : { data: [], error: null };
  if (classesError) throw new Error("Could not load outcomes classes.");
  const classes = (rawClasses ?? []).map((item) => {
    const subject = Array.isArray(item.subjects) ? item.subjects[0] : item.subjects;
    return { id:item.id, subjectId:item.subject_id, name:(subject?.code ?? subject?.name ?? "Class") + " · " + item.section };
  });
  const params = await searchParams;
  const selected = classes.find((item) => item.id === params.class_id) ?? classes[0];
  if (!selected) return <><PageHeader title="Course outcomes" description="Evidence-informed outcome attainment and assessment mapping."/><div className="surface p-8 text-sm text-[var(--muted)]">No assigned class is available.</div></>;

  const [outcomeResponse, assignmentResponse, quizResponse] = await Promise.all([
    db.from("course_outcomes").select("id,code,title,target_percent").eq("college_id",collegeId).eq("subject_id",selected.subjectId).order("code").limit(100),
    db.from("assignments").select("id,title,max_marks").eq("college_id",collegeId).eq("class_id",selected.id).eq("status","published").limit(100),
    db.from("quizzes").select("id,title,max_marks").eq("college_id",collegeId).eq("class_id",selected.id).eq("status","published").limit(100),
  ]);
  if (outcomeResponse.error || assignmentResponse.error || quizResponse.error) {
    throw new Error("Unable to load course-outcome data. Check migration 202611180026.");
  }
  const outcomeIds = (outcomeResponse.data ?? []).map((item) => item.id);
  const { data: allMappings, error: mappingsError } = outcomeIds.length
    ? await db.from("outcome_assessments").select("id,outcome_id,assignment_id,quiz_id,weight").eq("college_id",collegeId).in("outcome_id",outcomeIds).limit(300)
    : { data: [], error: null };
  if (mappingsError) throw new Error("Unable to load outcome mappings.");

  const assignmentIds = (assignmentResponse.data ?? []).map((item) => item.id);
  const quizIds = (quizResponse.data ?? []).map((item) => item.id);
  const [subsResult,quizScoresResult] = await Promise.all([
    assignmentIds.length ? db.from("assignment_submissions").select("id,assignment_id,student_id,version")
      .eq("college_id", collegeId).in("assignment_id", assignmentIds).limit(5000)
      : Promise.resolve({data:[],error:null}),
    quizIds.length ? db.from("quiz_attempts").select("quiz_id,student_id,score,released_at")
      .eq("college_id", collegeId).in("quiz_id",quizIds).not("released_at","is",null).limit(5000)
      : Promise.resolve({data:[],error:null}),
  ]);
  if (subsResult.error || quizScoresResult.error) throw new Error("Cannot load published assessment results.");
  const submissionIds = (subsResult.data ?? []).map((item) => item.id);
  const { data: evaluations, error: evalError } = submissionIds.length
    ? await db.from("assignment_evaluations").select("submission_id,marks,released_at")
      .eq("college_id",collegeId).in("submission_id",submissionIds).not("released_at","is",null).limit(5000)
    : { data:[],error:null };
  if (evalError) throw new Error("Unable to load released evaluations.");

  const assessmentAverages = new Map<string,number>();
  for (const assignment of assignmentResponse.data ?? []) {
    const latest = new Map<string,{ id:string; version:number }>();
    for (const sub of subsResult.data ?? []) if(sub.assignment_id === assignment.id && (!latest.has(sub.student_id) || (latest.get(sub.student_id)?.version ?? -1) < sub.version)) {
      latest.set(sub.student_id,{ id:sub.id, version:sub.version });
    }
    const marks = new Map((evaluations ?? []).map((item)=>[item.submission_id,Number(item.marks)]));
    const values = [...latest.values()].map((item)=>marks.get(item.id)).filter((value):value is number=>value !== undefined);
    if (values.length && Number(assignment.max_marks)>0) assessmentAverages.set("assignment:"+assignment.id,values.reduce((a,b)=>a+b,0)/values.length/Number(assignment.max_marks)*100);
  }
  for (const quiz of quizResponse.data ?? []) {
    const values = (quizScoresResult.data ?? []).filter((item)=>item.quiz_id===quiz.id && item.score!==null).map((item)=>Number(item.score));
    if(values.length && Number(quiz.max_marks)>0) assessmentAverages.set("quiz:"+quiz.id,values.reduce((a,b)=>a+b,0)/values.length/Number(quiz.max_marks)*100);
  }
  const outcomes = (outcomeResponse.data ?? []).map((item)=>{
    const mappings = (allMappings ?? []).filter((mapping)=>mapping.outcome_id===item.id).map((mapping)=>{
      const kind=mapping.assignment_id?"assignment:":"quiz:";
      const id=mapping.assignment_id??mapping.quiz_id;
      return { id:mapping.id, key:kind+id, weight:Number(mapping.weight), observed:assessmentAverages.get(kind+id)??null };
    });
    const observed=mappings.filter((mapping)=>mapping.observed!==null);
    const denominator=observed.reduce((total,mapping)=>total+mapping.weight,0);
    const attainment=denominator?Math.round(observed.reduce((total,mapping)=>total+(mapping.observed??0)*mapping.weight,0)/denominator):null;
    return { ...item, target_percent:Number(item.target_percent), attainment, mappings };
  });
  return <><PageHeader title="Course outcome analytics" description="Link learning outcomes to evidence and track attainment from released assessments."/>
    <OutcomeDashboard classes={classes} classId={selected.id} subjectId={selected.subjectId} outcomes={outcomes}
      assessments={[...(assignmentResponse.data ?? []).map((item)=>({id:item.id,title:item.title,type:"assignment"})),
        ...(quizResponse.data ?? []).map((item)=>({id:item.id,title:item.title,type:"quiz"}))]}/>
  </>;
}
