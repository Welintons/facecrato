
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://tnogcviolluveumzrhyy.supabase.co";

const SUPABASE_KEY = "sb_publishable_cOoVzxE6nEJXfpOXZFhlIg_qDBWo7L1";

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "facecrato-auth"
    }
  }
);
