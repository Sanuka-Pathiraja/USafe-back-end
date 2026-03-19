// config/supabase.js
import { createClient } from "@supabase/supabase-js";

// server-side key
export const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
