-- CB ScriptStore: Admin badges + Public Script moderation
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verified_blue boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS badge_emoji text;

-- Admin is identified by the account username Challo_Boy.
CREATE OR REPLACE FUNCTION public.cb_is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND lower(p.username) = 'challo_boy'
  );
$$;

CREATE OR REPLACE FUNCTION public.admin_set_verified(p_user_id uuid, p_verified boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.cb_is_admin() THEN RAISE EXCEPTION 'Admin only'; END IF;
  UPDATE public.profiles SET verified_blue = COALESCE(p_verified,false) WHERE id = p_user_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_badge(p_user_id uuid, p_badge text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.cb_is_admin() THEN RAISE EXCEPTION 'Admin only'; END IF;
  UPDATE public.profiles SET badge_emoji = NULLIF(left(COALESCE(p_badge,''), 16), '') WHERE id = p_user_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_public_script(p_script_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.cb_is_admin() THEN RAISE EXCEPTION 'Admin only'; END IF;
  DELETE FROM public.scripts WHERE id = p_script_id AND visibility = 'public';
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.cb_is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_verified(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_badge(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_public_script(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cb_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_verified(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_badge(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_public_script(bigint) TO authenticated;

DROP POLICY IF EXISTS "public can read profiles" ON public.profiles;
CREATE POLICY "public can read profiles"
ON public.profiles FOR SELECT TO anon, authenticated USING (true);
