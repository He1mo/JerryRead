insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tts-audio', 'tts-audio', false, 10485760, array['audio/mpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "tts_audio_select_own" on storage.objects;
create policy "tts_audio_select_own" on storage.objects for select to authenticated
using (bucket_id = 'tts-audio' and (storage.foldername(name))[1] = (select auth.uid()::text));
