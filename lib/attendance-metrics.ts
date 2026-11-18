export type AttendanceEvidence={
  session_id:string;student_id:string;status:string;
};

/** Treat an explicit 'excused' attendance record as exempt, not absent.
 * A completed session without a present/late/excused record is an absence.
 * A null percentage means no eligible completed sessions.
 */
export function attendanceForStudent(
  completedSessionIds:readonly string[],
  records:readonly Pick<AttendanceEvidence,"session_id"|"status">[],
):{attended:number;eligible:number;percent:number|null}{
  const ids=new Set(completedSessionIds);
  const status=new Map<string,string>();
  for(const record of records){
    if(ids.has(record.session_id))status.set(record.session_id,record.status);
  }
  let eligible=0,attended=0;
  for(const id of ids){
    if(status.get(id)==="excused")continue;
    eligible++;
    if(status.get(id)==="present"||status.get(id)==="late")attended++;
  }
  return {attended,eligible,percent:eligible?Math.round(attended/eligible*100):null};
}

export type SessionEvidence={
  id:string;starts_at:string;expires_at:string;closed_at:string|null;
};
export type QuizReleaseEvidence={
  quiz_id:string;student_id:string;score:number|string|null;
  released_at:string|null;
};
export type WeekSignal={
  label:string;weekStart:string;attendance:number|null;releasedQuiz:number|null;
  sessions:number;quizSamples:number;
};
function mondayUtcMs(timestamp:number):number{
  const date=new Date(timestamp);
  date.setUTCHours(0,0,0,0);
  date.setUTCDate(date.getUTCDate()-((date.getUTCDay()+6)%7));
  return date.getTime();
}
function weekLabel(timestamp:number):string{
  return new Date(timestamp).toLocaleDateString("en-GB",{
    day:"2-digit",month:"short",timeZone:"UTC",
  });
}
/** Historical observed signals only: actual completed sessions and released
 * quiz scores. Missing evidence is null, not an inferred zero.
 * An individual best released quiz score is counted once across the period.
 */
export function weeklyAcademicTrends(
  sessions:readonly SessionEvidence[],
  attendanceRecords:readonly AttendanceEvidence[],
  quizReleases:readonly QuizReleaseEvidence[],
  maxMarksByQuiz:Map<string,number>,
  enrolledStudentIds:readonly string[],
  now:number,
):WeekSignal[]{
  const monday=mondayUtcMs(now);
  const studentIds=new Set(enrolledStudentIds);
  const periods=Array.from({length:8},(_,index)=>monday-(7-index)*7*86400000);
  const completed=sessions.filter((session)=>{
    const start=Date.parse(session.starts_at);
    return Number.isFinite(start) && (session.closed_at!==null ||
      (Number.isFinite(Date.parse(session.expires_at)) &&
      Date.parse(session.expires_at)<=now));
  });
  const best=new Map<string,{score:number;releasedAt:number}>();
  for(const attempt of quizReleases){
    if(!studentIds.has(attempt.student_id)||!attempt.released_at||attempt.score===null)continue;
    const max=maxMarksByQuiz.get(attempt.quiz_id);
    const releasedAt=Date.parse(attempt.released_at);
    const score=Number(attempt.score);
    if(!max||max<=0||!Number.isFinite(max)||!Number.isFinite(releasedAt)
      ||!Number.isFinite(score)||score<0||score>max)continue;
    const key=attempt.student_id+":"+attempt.quiz_id;
    const percent=Math.round(score/max*10000)/100;
    const previous=best.get(key);
    if(!previous||percent>previous.score)best.set(key,{score:percent,releasedAt});
  }
  return periods.map((weekStart,index)=>{
    const next=weekStart+7*86400000;
    const weekSessions=completed.filter((session)=>{
      const start=Date.parse(session.starts_at);
      return start>=weekStart&&start<next;
    });
    const weekSessionIds=new Set(weekSessions.map((session)=>session.id));
    const currentRecords=attendanceRecords.filter((record)=>
      weekSessionIds.has(record.session_id)&&studentIds.has(record.student_id));
    let present=0,excused=0;
    const tracked=new Set<string>();
    for(const record of currentRecords){
      const key=record.session_id+":"+record.student_id;
      if(tracked.has(key))continue;
      tracked.add(key);
      if(record.status==="excused")excused++;
      if(record.status==="present"||record.status==="late")present++;
    }
    const possible=weekSessionIds.size*studentIds.size-excused;
    const attendance=possible>0?Math.round(present/possible*100):null;
    const scores=[...best.values()].filter((item)=>item.releasedAt>=weekStart&&item.releasedAt<next)
      .map((item)=>item.score);
    const releasedQuiz=scores.length
      ?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length):null;
    return {label:weekLabel(weekStart),weekStart:new Date(weekStart).toISOString(),
      attendance,releasedQuiz,sessions:weekSessionIds.size,quizSamples:scores.length};
  });
}
