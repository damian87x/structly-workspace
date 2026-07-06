-- Seed: demo login for local development.
--   email:    demo@structly.app
--   password: structly-demo-1
-- Applied automatically by `supabase start` / `supabase db reset`.

do $$
declare
  demo_id uuid := gen_random_uuid();
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', demo_id, 'authenticated', 'authenticated',
    'demo@structly.app', crypt('structly-demo-1', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}', '{}',
    now(), now(),
    '', '', '', ''
  );

  -- GoTrue requires a matching identity row for email/password sign-in.
  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), demo_id, demo_id,
    jsonb_build_object('sub', demo_id::text, 'email', 'demo@structly.app', 'email_verified', true),
    'email', now(), now(), now()
  );
end $$;
