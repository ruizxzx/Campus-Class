export type GradeWeights = {
  assignment_weight:number;
  project_weight:number;
  quiz_weight:number;
  attendance_weight:number;
};
export type GradeColumn = { type:string; maxMarks:number };
export type GradeScoreRow = { scores:(number|null)[]; attendance:number|null };

const bounded=(value:number)=>Math.max(0,Math.min(100,value));

export function validGradeWeights(policy:GradeWeights):boolean {
  const values=Object.values(policy);
  return values.length===4 && values.every((value)=>Number.isFinite(value)
    && value>=0 && value<=100 && Math.abs(value*100-Math.round(value*100))<1e-5)
    && values.reduce((sum,value)=>sum+Math.round(value*100),0)===10000;
}

/**
 * Each assessment within a category has equal influence on its category mean.
 * Configurable weights apply to the categories with ACTUAL released data only.
 * Missing/unreleased marks and empty attendance do not become zero.
 * Results are indicative, not official transcript grades.
 */
export function weightedRecordedIndex(
  row:GradeScoreRow,
  columns:GradeColumn[],
  weights:GradeWeights,
):number|null {
  if(!validGradeWeights(weights))return null;
  const groups:Record<"assignment"|"project"|"quiz",number[]>={
    assignment:[],project:[],quiz:[],
  };
  columns.forEach((column,index)=>{
    const score=row.scores[index];
    if(score===null || !Number.isFinite(score) || !Number.isFinite(column.maxMarks)
      || column.maxMarks<=0 || score<0 || score>column.maxMarks)return;
    const key=column.type==="project"?"project":column.type==="quiz"?"quiz":"assignment";
    groups[key].push(score/column.maxMarks*100);
  });
  const values:[
    keyof GradeWeights,number|null
  ][]=[
    ["assignment_weight",mean(groups.assignment)],
    ["project_weight",mean(groups.project)],
    ["quiz_weight",mean(groups.quiz)],
    ["attendance_weight",row.attendance!==null&&Number.isFinite(row.attendance)
      && row.attendance>=0&&row.attendance<=100?row.attendance:null],
  ];
  const usable=values.filter(([key,score])=>score!==null&&weights[key]>0);
  const total=usable.reduce((sum,[key])=>sum+weights[key],0);
  if(!total)return null;
  const value=usable.reduce((sum,[key,score])=>sum+Number(score)*weights[key],0)/total;
  return Math.round(bounded(value)*100)/100;
}
function mean(values:number[]):number|null {
  return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
}
