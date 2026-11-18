-- CampusClass 2.0: secure, page-aware PDF text chunks with pgvector.
-- Apply manually AFTER 202611180035. No existing student data is changed.
begin;
create schema if not exists extensions;
create extension if not exists vector with schema extensions;

create table if not exists public.syllabus_text_chunks(
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null,
  class_id uuid not null,
  syllabus_id uuid not null,
  document_hash text not null check (char_length(document_hash) between 16 and 128),
  chunk_index integer not null check (chunk_index between 0 and 255),
  page_number integer check (page_number between 1 and 10000),
  chunk_text text not null check (char_length(chunk_text) between 20 and 1800),
  embedding extensions.vector(1536) not null,
  created_at timestamptz not null default now(),
  unique (syllabus_id,chunk_index),
  foreign key (college_id,class_id) references public.classes(college_id,id) on delete cascade,
  foreign key (college_id,syllabus_id) references public.class_syllabi(college_id,id) on delete cascade
);
create index if not exists syllabus_chunks_scope_idx
  on public.syllabus_text_chunks(college_id,class_id,syllabus_id);
create index if not exists syllabus_chunks_embedding_idx
  on public.syllabus_text_chunks using hnsw(embedding extensions.vector_cosine_ops);

alter table public.syllabus_text_chunks enable row level security;
revoke all on public.syllabus_text_chunks from public,anon,authenticated;
grant select,insert,update,delete on public.syllabus_text_chunks to service_role;

-- Transactional replacement prevents partial reprocessing from erasing a valid index.
create or replace function public.replace_syllabus_text_chunks(
  p_college_id uuid,p_actor_id uuid,p_syllabus_id uuid,p_chunks jsonb
) returns integer
language plpgsql security definer set search_path=''
as $$
declare
  v_class_id uuid;
  v_actor_role text;
  v_chunk jsonb;
  v_number integer:=0;
begin
  if p_college_id is null or p_actor_id is null or p_syllabus_id is null
    or p_chunks is null or jsonb_typeof(p_chunks)<>'array'
    or jsonb_array_length(p_chunks) not between 1 and 96 then
    raise exception 'Invalid document index payload' using errcode='22023';
  end if;
  select p.role into v_actor_role from public.profiles p
   where p.id=p_actor_id and p.college_id=p_college_id and p.status='active';
  if v_actor_role not in ('admin','faculty') then
    raise exception 'Staff permission required' using errcode='42501';
  end if;
  select s.class_id into v_class_id from public.class_syllabi s
   where s.id=p_syllabus_id and s.college_id=p_college_id;
  if v_class_id is null then
    raise exception 'Syllabus not found' using errcode='42501';
  end if;
  if v_actor_role='faculty' and not exists(
    select 1 from public.class_faculty f where
    f.college_id=p_college_id and f.faculty_id=p_actor_id and f.class_id=v_class_id
  ) then
    raise exception 'Faculty not assigned to class' using errcode='42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('study-syllabus:'||p_syllabus_id::text,0)
  );
  delete from public.syllabus_text_chunks
   where college_id=p_college_id and syllabus_id=p_syllabus_id;
  for v_chunk in select * from jsonb_array_elements(p_chunks) loop
    if jsonb_typeof(v_chunk)<>'object'
      or jsonb_typeof(v_chunk->'embedding')<>'array'
      or jsonb_array_length(v_chunk->'embedding')<>1536
      or (v_chunk->>'content') is null
      or char_length(v_chunk->>'content') not between 20 and 1800
      or (v_chunk->>'hash') is null
      or char_length(v_chunk->>'hash') not between 16 and 128
      or (v_chunk->>'index')::integer <> v_number
      or (v_chunk->>'page') is not null
        and (v_chunk->>'page')::integer not between 1 and 10000
      then raise exception 'Invalid document chunk' using errcode='22023';
    end if;
    insert into public.syllabus_text_chunks(
      college_id,class_id,syllabus_id,document_hash,chunk_index,page_number,chunk_text,embedding
    ) values(
      p_college_id,v_class_id,p_syllabus_id,v_chunk->>'hash',
      v_number,(v_chunk->>'page')::integer,v_chunk->>'content',
      (v_chunk->'embedding')::text::extensions.vector(1536)
    );
    v_number:=v_number+1;
  end loop;
  return v_number;
end $$;

-- Called only from the service-role server after checking the student session.
-- The function still enforces actual active enrollment independently.
create or replace function public.match_syllabus_text_chunks(
  p_college_id uuid,p_student_id uuid,p_embedding extensions.vector(1536),
  p_limit integer default 5
) returns table(
  syllabus_id uuid,title text,class_id uuid,page_number integer,
  chunk_text text,similarity double precision
)
language sql stable security definer set search_path=''
as $$
  select c.syllabus_id,s.title,c.class_id,c.page_number,c.chunk_text,
    (1-(c.embedding operator(extensions.<=>) p_embedding))::double precision as similarity
  from public.syllabus_text_chunks c
  join public.class_syllabi s on s.id=c.syllabus_id and s.college_id=c.college_id
  join public.class_enrollments e on e.college_id=c.college_id
    and e.class_id=c.class_id and e.student_id=p_student_id and e.status='active'
  join public.profiles p on p.id=p_student_id and p.college_id=c.college_id
    and p.role='student' and p.status='active'
  where c.college_id=p_college_id
    and p_limit between 1 and 8
    and (1-(c.embedding operator(extensions.<=>) p_embedding)) >= 0.2
  order by c.embedding operator(extensions.<=>) p_embedding
  limit least(greatest(p_limit,1),8);
$$;

revoke all on function public.replace_syllabus_text_chunks(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.match_syllabus_text_chunks(uuid,uuid,extensions.vector,integer) from public,anon,authenticated;
grant execute on function public.replace_syllabus_text_chunks(uuid,uuid,uuid,jsonb) to service_role;
grant execute on function public.match_syllabus_text_chunks(uuid,uuid,extensions.vector,integer) to service_role;

commit;

-- Read-only checks:
-- select to_regclass('public.syllabus_text_chunks') as syllabus_text_index;
-- select extname from pg_extension where extname='vector';
