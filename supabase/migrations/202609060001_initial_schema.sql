create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  voice_id text,
  playback_speed numeric(3, 2) not null default 1.00 check (playback_speed between 0.50 and 2.00),
  default_sleep_minutes integer not null default 30 check (default_sleep_minutes in (30, 60, 90)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  author text,
  file_type text not null default 'txt' check (file_type = 'txt'),
  storage_path text not null unique,
  file_size bigint not null check (file_size > 0 and file_size <= 52428800),
  last_opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reading_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  chapter_index integer not null default 0 check (chapter_index >= 0),
  paragraph_index integer not null default 0 check (paragraph_index >= 0),
  text_offset integer not null default 0 check (text_offset >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

create index if not exists books_user_id_idx on public.books(user_id);
create index if not exists reading_progress_user_id_idx on public.reading_progress(user_id);
create index if not exists reading_progress_book_id_idx on public.reading_progress(book_id);

alter table public.user_settings enable row level security;
alter table public.books enable row level security;
alter table public.reading_progress enable row level security;

revoke all on public.user_settings, public.books, public.reading_progress from anon, authenticated;
grant select, insert, update, delete on public.user_settings, public.books, public.reading_progress to authenticated;

create policy "user_settings_select_own" on public.user_settings for select to authenticated using ((select auth.uid()) = user_id);
create policy "user_settings_insert_own" on public.user_settings for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "user_settings_update_own" on public.user_settings for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "user_settings_delete_own" on public.user_settings for delete to authenticated using ((select auth.uid()) = user_id);

create policy "books_select_own" on public.books for select to authenticated using ((select auth.uid()) = user_id);
create policy "books_insert_own" on public.books for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "books_update_own" on public.books for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "books_delete_own" on public.books for delete to authenticated using ((select auth.uid()) = user_id);

create policy "reading_progress_select_own" on public.reading_progress for select to authenticated using ((select auth.uid()) = user_id);
create policy "reading_progress_insert_own" on public.reading_progress for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "reading_progress_update_own" on public.reading_progress for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "reading_progress_delete_own" on public.reading_progress for delete to authenticated using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('books', 'books', false, 52428800, array['text/plain', 'application/octet-stream'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "book_objects_select_own" on storage.objects for select to authenticated
using (bucket_id = 'books' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "book_objects_insert_own" on storage.objects for insert to authenticated
with check (bucket_id = 'books' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "book_objects_update_own" on storage.objects for update to authenticated
using (bucket_id = 'books' and (storage.foldername(name))[1] = (select auth.uid()::text))
with check (bucket_id = 'books' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "book_objects_delete_own" on storage.objects for delete to authenticated
using (bucket_id = 'books' and (storage.foldername(name))[1] = (select auth.uid()::text));
