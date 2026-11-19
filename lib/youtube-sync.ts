/**
 * Compare an entire stored playlist snapshot, not just the currently visible
 * 100-row review page. All IDs are untrusted external metadata; missing videos
 * are reported for review, never deleted from college courses.
 */
export function summarizeYoutubeSync(
  existing:ReadonlyArray<{video_id:string;playlist_position:number}>,
  snapshot:ReadonlyArray<{video_id:string|null;playlist_position:number}>,
):{missing:number;added:number;reordered:number}{
  const before=new Map(existing.map(item=>[item.video_id,item.playlist_position]));
  const after=new Map<string,number>();
  for(const item of snapshot){
    if(item.video_id&&!after.has(item.video_id))after.set(item.video_id,item.playlist_position);
  }
  let missing=0,added=0,reordered=0;
  for(const [id,position] of before){
    if(!after.has(id))missing++;
    else if(after.get(id)!==position)reordered++;
  }
  for(const id of after.keys())if(!before.has(id))added++;
  return {missing,added,reordered};
}
