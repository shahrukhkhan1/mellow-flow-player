GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracks TO authenticated;
GRANT ALL ON public.tracks TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.playlists TO authenticated;
GRANT ALL ON public.playlists TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.playlist_tracks TO authenticated;
GRANT ALL ON public.playlist_tracks TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.favorites TO authenticated;
GRANT ALL ON public.favorites TO service_role;

UPDATE public.profiles
SET display_name = CASE
  WHEN NULLIF(BTRIM(LEFT(COALESCE(display_name, ''), 100)), '') IS NULL THEN 'User'
  ELSE BTRIM(LEFT(display_name, 100))
END
WHERE display_name IS NULL
   OR display_name <> BTRIM(LEFT(display_name, 100))
   OR BTRIM(display_name) = ''
   OR CHAR_LENGTH(display_name) > 100;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_display_name_valid;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_display_name_valid
  CHECK (
    display_name IS NULL OR (
      CHAR_LENGTH(display_name) BETWEEN 1 AND 100
      AND display_name = BTRIM(display_name)
    )
  );

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  display_name_value TEXT;
BEGIN
  display_name_value := BTRIM(LEFT(COALESCE(new.raw_user_meta_data->>'display_name', ''), 100));

  IF display_name_value = '' THEN
    display_name_value := 'User';
  END IF;

  INSERT INTO public.profiles (id, email, display_name)
  VALUES (new.id, new.email, display_name_value);

  RETURN new;
END;
$$;