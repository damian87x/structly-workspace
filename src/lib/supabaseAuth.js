const CONFIG_ERROR = "Supabase credentials are not configured.";

function getSupabaseConfig(env = process.env) {
  const url = env.EXPO_PUBLIC_SUPABASE_URL || null;
  const anonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY || null;

  return {
    anonKey,
    error: url && anonKey ? null : CONFIG_ERROR,
    url,
  };
}

async function signInWithPassword({
  anonKey,
  email,
  fetchImpl = fetch,
  password,
  url,
}) {
  if (!url || !anonKey) {
    return { error: new Error(CONFIG_ERROR), session: null };
  }

  const response = await fetchImpl(
    `${url.replace(/\/$/, "")}/auth/v1/token?grant_type=password`,
    {
      body: JSON.stringify({ email, password }),
      headers: {
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
        apikey: anonKey,
      },
      method: "POST",
    },
  );

  if (!response.ok) {
    return {
      error: new Error("Unable to sign in with those credentials."),
      session: null,
    };
  }

  const data = await response.json();

  if (!data.access_token || !data.refresh_token || !data.user) {
    return {
      error: new Error("Unable to create a Supabase session."),
      session: null,
    };
  }

  return {
    error: null,
    session: {
      access_token: data.access_token,
      expires_at: data.expires_at,
      expires_in: data.expires_in,
      refresh_token: data.refresh_token,
      token_type: data.token_type,
      user: data.user,
    },
  };
}

module.exports = {
  CONFIG_ERROR,
  getSupabaseConfig,
  signInWithPassword,
};
