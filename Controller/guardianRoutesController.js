import { supabase } from "../config/supabase.js";

function getAccessToken(req) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.replace("Bearer ", "").trim();
}

async function getSupabaseUser(req) {
  const token = getAccessToken(req);
  if (!token) {
    return { user: null, error: "Missing Authorization bearer token" };
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return { user: null, error: error?.message || "Invalid token" };
  }

  return { user: data.user, error: null };
}

export async function createGuardianRoute(req, res) {
  try {
    const { user, error } = await getSupabaseUser(req);
    if (error) {
      return res.status(401).json({ error });
    }

    const { name, checkpoints, is_active } = req.body;

    if (!name || !Array.isArray(checkpoints) || checkpoints.length === 0) {
      return res.status(400).json({ error: "Name and checkpoints are required" });
    }

    const { data, error: insertError } = await supabase
      .from("guardian_routes")
      .insert([
        {
          user_id: user.id,
          name,
          checkpoints,
          is_active: is_active ?? true,
        },
      ])
      .select("id,user_id,name,checkpoints,is_active,created_at")
      .single();

    if (insertError) {
      return res.status(500).json({ error: insertError.message });
    }

    return res.status(201).json({ success: true, route: data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

export async function listGuardianRoutes(req, res) {
  try {
    const { user, error } = await getSupabaseUser(req);
    if (error) {
      return res.status(401).json({ error });
    }

    const { data, error: queryError } = await supabase
      .from("guardian_routes")
      .select("id,user_id,name,checkpoints,is_active,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (queryError) {
      return res.status(500).json({ error: queryError.message });
    }

    return res.status(200).json({ success: true, routes: data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
