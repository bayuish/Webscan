import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || "https://dmwhdnytsamzrhebjpwg.supabase.co";
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_SfcR_7avL5HYP1bzuom4dA_acvQsYjX";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "engkong_stuff_auth_session"
  }
});

/**
 * Dapatkan sesi aktif saat ini dari Supabase Auth
 */
export async function getActiveSession() {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session?.user) return null;
    const meta = session.user.user_metadata || {};
    const emailPrefix = session.user.email ? session.user.email.split("@")[0] : "";
    return {
      session,
      user: {
        id: session.user.id,
        username: meta.username || emailPrefix,
        full_name: meta.name || meta.username || emailPrefix,
        role: meta.role || (emailPrefix === "fathanaj" ? "OWNER" : "EMPLOYEE"),
        email: session.user.email
      }
    };
  } catch (err) {
    console.error("getActiveSession error:", err);
    return null;
  }
}

/**
 * Refresh token aktif untuk mencegah sesi expired selama user aktif
 */
export async function refreshActiveSession() {
  try {
    const { data, error } = await supabase.auth.refreshSession();
    if (!error && data?.session) {
      return data.session;
    }
  } catch (e) {
    console.warn("Auto refresh session warning:", e);
  }
  return null;
}

/**
 * Autentikasi Pengguna via Supabase Auth (supabase.auth.signInWithPassword)
 * @param {string} username - fathanaj atau fachrudin (atau email)
 * @param {string} password - 123 atau 456
 */
export async function authenticateUser(username, password) {
  try {
    const cleanUser = (username || "").trim().toLowerCase();
    const cleanPass = (password || "").trim();

    // Petakan username ke format email Supabase Auth jika belum ada domain
    const email = cleanUser.includes("@") ? cleanUser : `${cleanUser}@webscan.com`;

    // 1. Otentikasi langsung menggunakan fitur resmi Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: cleanPass
    });

    if (!error && data?.user) {
      const meta = data.user.user_metadata || {};
      const resolvedRole = meta.role || (cleanUser === "fathanaj" ? "OWNER" : "EMPLOYEE");
      const resolvedUsername = meta.username || cleanUser;

      return {
        success: true,
        session: data.session,
        user: {
          id: data.user.id,
          username: resolvedUsername,
          full_name: meta.name || resolvedUsername,
          role: resolvedRole,
          email: data.user.email
        }
      };
    }

    // 2. Jika Supabase Auth mengembalikan error, coba verifikasi lewat database RPC
    console.warn("Supabase Auth sign-in note:", error?.message);
    const { data: rpcData, error: rpcError } = await supabase.rpc("verify_user_login", {
      p_username: cleanUser,
      p_password: cleanPass
    });

    if (!rpcError && rpcData && rpcData.length > 0 && rpcData[0].is_valid) {
      return {
        success: true,
        user: {
          id: rpcData[0].id,
          username: rpcData[0].username,
          full_name: rpcData[0].full_name,
          role: rpcData[0].role
        }
      };
    }

    return {
      success: false,
      message: error?.message || "Username atau password salah."
    };
  } catch (err) {
    console.error("Auth exception:", err);
    return { success: false, message: "Terjadi kesalahan saat memproses login ke Supabase." };
  }
}

/**
 * Upload Foto Bukti Pengeluaran ke Supabase Storage (Bucket: stock-out-proofs)
 * @param {string} base64DataUrl - Data URL gambar terkompresi (<= 200 KB)
 * @param {string} fileName - Nama file unik
 * @returns {Promise<string>} - Public URL gambar di Supabase Storage
 */
export async function uploadStockOutProof(base64DataUrl, fileName) {
  try {
    if (!base64DataUrl || !base64DataUrl.startsWith("data:")) {
      return base64DataUrl;
    }

    // Convert base64 Data URL to Blob
    const arr = base64DataUrl.split(",");
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    const blob = new Blob([u8arr], { type: mime });

    const safePath = `${Date.now()}_${(fileName || "proof").replace(/[^a-zA-Z0-9_\-\.]/g, "_")}.webp`;

    const { data, error } = await supabase.storage
      .from("stock-out-proofs")
      .upload(safePath, blob, {
        contentType: "image/webp",
        upsert: true
      });

    if (error) {
      console.warn("Storage upload error, using local fallback:", error);
      return base64DataUrl;
    }

    const { data: publicUrlData } = supabase.storage
      .from("stock-out-proofs")
      .getPublicUrl(data.path);

    return publicUrlData.publicUrl || base64DataUrl;
  } catch (err) {
    console.error("Upload error, keeping base64:", err);
    return base64DataUrl;
  }
}
