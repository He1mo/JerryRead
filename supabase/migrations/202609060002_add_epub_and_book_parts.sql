alter table public.books drop constraint if exists books_file_type_check;
alter table public.books add constraint books_file_type_check check (file_type in ('txt', 'epub'));
alter table public.books drop constraint if exists books_file_size_check;
alter table public.books add constraint books_file_size_check check (file_size > 0 and file_size <= 943718400);

create table if not exists public.book_files (
  book_id uuid not null references public.books(id) on delete cascade,
  part_index integer not null check (part_index >= 0),
  storage_path text not null unique,
  file_size bigint not null check (file_size > 0 and file_size <= 8388608),
  primary key (book_id, part_index)
);

create index if not exists book_files_book_id_idx on public.book_files(book_id);

alter table public.book_files enable row level security;
revoke all on public.book_files from anon, authenticated;
grant select, insert, update, delete on public.book_files to authenticated;

create policy "book_files_select_own" on public.book_files for select to authenticated
using (exists (select 1 from public.books where books.id = book_files.book_id and books.user_id = (select auth.uid())));
create policy "book_files_insert_own" on public.book_files for insert to authenticated
with check (exists (select 1 from public.books where books.id = book_files.book_id and books.user_id = (select auth.uid())));
create policy "book_files_update_own" on public.book_files for update to authenticated
using (exists (select 1 from public.books where books.id = book_files.book_id and books.user_id = (select auth.uid())))
with check (exists (select 1 from public.books where books.id = book_files.book_id and books.user_id = (select auth.uid())));
create policy "book_files_delete_own" on public.book_files for delete to authenticated
using (exists (select 1 from public.books where books.id = book_files.book_id and books.user_id = (select auth.uid())));

update storage.buckets
set allowed_mime_types = array['text/plain', 'application/epub+zip', 'application/octet-stream']
where id = 'books';
