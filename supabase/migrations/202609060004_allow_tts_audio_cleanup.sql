drop policy if exists "tts_audio_delete_own" on storage.objects;
create policy "tts_audio_delete_own" on storage.objects for delete to authenticated
using (bucket_id = 'tts-audio' and (storage.foldername(name))[1] = (select auth.uid()::text));
