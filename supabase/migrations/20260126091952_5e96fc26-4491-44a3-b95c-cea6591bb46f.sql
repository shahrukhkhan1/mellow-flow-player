-- Add storage policy for music-files bucket to allow authenticated users to upload their own files
CREATE POLICY "Users can upload their own music files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'music-files' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own music files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'music-files' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can read their own music files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'music-files' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own music files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'music-files' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);