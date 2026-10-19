// Supabase → Project Settings → API. The anon key is safe to publish: row-level security
// in supabase/schema.sql lets only the emails in allowed_emails read or write anything.
export const SUPABASE_URL = 'https://eyzbdakkalbckoaaxvzj.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable__GJIsowl5smeUoNPSc3ftA_GmXww5kH'; // publishable key
// Public half of the Web Push (VAPID) key pair; the private half lives only in Supabase function secrets.
export const VAPID_PUBLIC_KEY = 'BKFEoq_FtGpuXtRQQU7jCW5KtV_eDhWwUgoHKLdZWALY3Gtsp_kg8QY0QDgnHrlrXOVFPuYoYYAe1tfjpLsJQ_U';
