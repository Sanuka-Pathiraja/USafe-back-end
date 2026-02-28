// config/supabase.js
import { createClient } from "@supabase/supabase-js";

let supabaseInstance = null;

try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_KEY;
    if (url && key && url.startsWith("http")) {
        supabaseInstance = createClient(url, key);
    } else {
        console.warn("⚠️ Valid SUPABASE_URL and SUPABASE_KEY are missing. Supabase functionality disabled.");
    }
} catch (error) {
    console.warn("⚠️ Failed to initialize Supabase client:", error.message);
}

export const supabase = supabaseInstance;
