import { supabase } from "./supabaseClient.js";
import { detectCourier } from "./courier.js";

export function parseDateSafe(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === "number") {
    // Handle Excel serial date
    if (val > 20000 && val < 60000) {
      const utc_days = Math.floor(val - 25569);
      const utc_value = utc_days * 86400;
      const fractional_day = val - Math.floor(val) + 0.0000001;
      let total_seconds = Math.floor(86400 * fractional_day);
      return new Date((utc_value + total_seconds) * 1000);
    }
    return new Date(val);
  }
  if (typeof val === "string") {
    let s = val.trim();
    if (!s || s === "-" || s.toLowerCase() === "null") return null;

    // Bersihkan keterangan tambahan seperti "(Sinkronisasi Data Lama)" atau "WIB"
    s = s.replace(/\(.*\)/g, "").replace(/WIB/gi, "").trim();

    // Format DD/MM/YYYY atau DD-MM-YYYY (format standar TikTok export)
    const dmyMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[,\s]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (dmyMatch) {
      const day = parseInt(dmyMatch[1], 10);
      const month = parseInt(dmyMatch[2], 10) - 1;
      const year = parseInt(dmyMatch[3], 10);
      const hour = dmyMatch[4] ? parseInt(dmyMatch[4], 10) : 0;
      const min = dmyMatch[5] ? parseInt(dmyMatch[5], 10) : 0;
      const sec = dmyMatch[6] ? parseInt(dmyMatch[6], 10) : 0;
      const d = new Date(year, month, day, hour, min, sec);
      if (!isNaN(d.getTime())) return d;
    }

    // Format ISO tanpa offset
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(s) && !s.endsWith("Z") && !/[+-]\d{2}(:\d{2})?$/.test(s)) {
      const d = new Date(s + "Z");
      if (!isNaN(d.getTime())) return d;
    }

    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

export function formatWIBDateTime(dateObj = new Date()) {
  if (!dateObj) return "-";
  const d = parseDateSafe(dateObj);
  if (!d || isNaN(d.getTime())) return String(dateObj);

  const time = d
    .toLocaleTimeString("id-ID", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    })
    .replace(/\./g, ":") + " WIB";

  const date = d.toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });

  return `${date}, ${time}`;
}

export function formatWIBDateOnly(dateObj = new Date()) {
  if (!dateObj) return "";
  const d = parseDateSafe(dateObj);
  if (!d || isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

// ============================================================================
// 1. SCANS HISTORY (Pemindai Live & Database Riwayat Scan)
// ============================================================================

/**
 * Mengambil seluruh riwayat pemindaian resi dari tabel public.scans_history
 */
export async function fetchScansHistory() {
  try {
    let allData = [];
    let from = 0;
    const pageSize = 1000;

    while (true) {
      const { data, error } = await supabase
        .from("scans_history")
        .select("*")
        .order("scan_time", { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) {
        console.error("Error fetchScansHistory:", error);
        break;
      }
      if (!data || data.length === 0) break;
      allData = allData.concat(data);
      if (data.length < pageSize) break;
      from += pageSize;
    }

    return allData.map((row) => {
      const courierObj = detectCourier(row.tracking_number);
      const scanDate = new Date(row.scan_time);
      const fullDateStr = formatWIBDateTime(scanDate);
      const timeParts = fullDateStr.split(", ");
      const timeStr = timeParts.length > 1 ? timeParts[1] : fullDateStr;

      return {
        id: row.id,
        code: row.tracking_number,
        courier: courierObj,
        timestamp: timeStr,
        fullDate: fullDateStr,
        dateRaw: row.scan_time,
        isDuplicate: Boolean(row.is_duplicate),
        source: row.source || "SCANNER_LIVE"
      };
    });
  } catch (err) {
    console.error("fetchScansHistory exception:", err);
    return [];
  }
}

/**
 * Menyimpan satu record hasil scan baru ke tabel public.scans_history
 */
export async function insertScanRecord(scanItem) {
  try {
    const payload = {
      tracking_number: scanItem.code,
      courier_name: scanItem.courier?.name || "Lainnya",
      scan_time: new Date().toISOString(),
      is_duplicate: Boolean(scanItem.isDuplicate),
      source: "SCANNER_LIVE"
    };

    const { data, error } = await supabase
      .from("scans_history")
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error("Error insertScanRecord:", error);
      return null;
    }
    return data;
  } catch (err) {
    console.error("insertScanRecord exception:", err);
    return null;
  }
}

/**
 * Menghapus satu record scan dari tabel public.scans_history
 */
export async function deleteScanRecord(id) {
  try {
    const { error } = await supabase
      .from("scans_history")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleteScanRecord:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("deleteScanRecord exception:", err);
    return false;
  }
}

/**
 * Mengosongkan seluruh riwayat pemindaian resi
 */
export async function clearScansHistory() {
  try {
    const { error } = await supabase
      .from("scans_history")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");

    if (error) {
      console.error("Error clearScansHistory:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("clearScansHistory exception:", err);
    return false;
  }
}

// ============================================================================
// 2. STOCK IN (Manajemen Stok Masuk)
// ============================================================================

/**
 * Mengambil data seluruh stok masuk dari tabel public.stock_in
 */
export async function fetchStockInList() {
  try {
    const { data, error } = await supabase
      .from("stock_in")
      .select("*")
      .order("entry_date", { ascending: false });

    if (error) {
      console.error("Error fetchStockInList:", error);
      return [];
    }

    return (data || []).map((row) => ({
      id: row.id,
      code: row.item_code || "",
      name: row.character_name || "",
      qty: row.qty_lusin,
      date: row.entry_date,
      formattedDate: formatWIBDateTime(row.entry_date),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  } catch (err) {
    console.error("fetchStockInList exception:", err);
    return [];
  }
}

/**
 * Menambahkan data stok masuk baru ke public.stock_in
 */
export async function insertStockInItem(item) {
  try {
    const payload = {
      item_code: item.code ? item.code.trim() : null,
      character_name: item.name ? item.name.trim() : null,
      qty_lusin: parseInt(item.qty, 10),
      entry_date: item.date ? new Date(item.date).toISOString() : new Date().toISOString()
    };

    const { data, error } = await supabase
      .from("stock_in")
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error("Error insertStockInItem:", error);
      throw error;
    }

    return {
      id: data.id,
      code: data.item_code || "",
      name: data.character_name || "",
      qty: data.qty_lusin,
      date: data.entry_date,
      formattedDate: formatWIBDateTime(data.entry_date),
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  } catch (err) {
    console.error("insertStockInItem exception:", err);
    throw err;
  }
}

/**
 * Memperbarui data stok masuk yang sudah ada
 */
export async function updateStockInItem(item) {
  try {
    const payload = {
      item_code: item.code ? item.code.trim() : null,
      character_name: item.name ? item.name.trim() : null,
      qty_lusin: parseInt(item.qty, 10),
      entry_date: item.date ? new Date(item.date).toISOString() : new Date().toISOString()
    };

    const { data, error } = await supabase
      .from("stock_in")
      .update(payload)
      .eq("id", item.id)
      .select()
      .single();

    if (error) {
      console.error("Error updateStockInItem:", error);
      throw error;
    }

    return {
      id: data.id,
      code: data.item_code || "",
      name: data.character_name || "",
      qty: data.qty_lusin,
      date: data.entry_date,
      formattedDate: formatWIBDateTime(data.entry_date),
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  } catch (err) {
    console.error("updateStockInItem exception:", err);
    throw err;
  }
}

/**
 * Menghapus data stok masuk berdasarkan ID
 */
export async function deleteStockInItem(id) {
  try {
    const { error } = await supabase
      .from("stock_in")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleteStockInItem:", error);
      throw error;
    }
    return true;
  } catch (err) {
    console.error("deleteStockInItem exception:", err);
    throw err;
  }
}

// ============================================================================
// 3. STOCK OUT (Manajemen Stok Keluar)
// ============================================================================

/**
 * Mengambil data seluruh stok keluar dari tabel public.stock_out
 */
export async function fetchStockOutList() {
  try {
    const { data, error } = await supabase
      .from("stock_out")
      .select("*")
      .order("exit_date_locked", { ascending: false });

    if (error) {
      console.error("Error fetchStockOutList:", error);
      return [];
    }

    return (data || []).map((row) => ({
      id: row.id,
      stockInId: row.stock_in_id,
      code: row.item_code || "",
      name: row.character_name || "",
      qty: row.qty_lusin,
      date: row.exit_date_locked,
      formattedDate: formatWIBDateTime(row.exit_date_locked),
      image: row.photo_proof_url,
      notes: row.notes || "-",
      createdAt: row.created_at
    }));
  } catch (err) {
    console.error("fetchStockOutList exception:", err);
    return [];
  }
}

/**
 * Menambahkan data pengeluaran stok baru ke public.stock_out
 */
export async function insertStockOutItem(item) {
  try {
    const payload = {
      stock_in_id: item.stockInId,
      item_code: item.code ? item.code.trim() : null,
      character_name: item.name ? item.name.trim() : null,
      qty_lusin: parseInt(item.qty, 10),
      exit_date_locked: item.date ? new Date(item.date).toISOString() : new Date().toISOString(),
      photo_proof_url: item.image || "",
      notes: item.notes || "-"
    };

    const { data, error } = await supabase
      .from("stock_out")
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error("Error insertStockOutItem:", error);
      throw error;
    }

    return {
      id: data.id,
      stockInId: data.stock_in_id,
      code: data.item_code || "",
      name: data.character_name || "",
      qty: data.qty_lusin,
      date: data.exit_date_locked,
      formattedDate: formatWIBDateTime(data.exit_date_locked),
      image: data.photo_proof_url,
      notes: data.notes || "-",
      createdAt: data.created_at
    };
  } catch (err) {
    console.error("insertStockOutItem exception:", err);
    throw err;
  }
}

/**
 * Menghapus data pengeluaran stok berdasarkan ID
 */
export async function deleteStockOutItem(id) {
  try {
    const { error } = await supabase
      .from("stock_out")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleteStockOutItem:", error);
      throw error;
    }
    return true;
  } catch (err) {
    console.error("deleteStockOutItem exception:", err);
    throw err;
  }
}

// ============================================================================
// 4. RETURN PACKAGES (Manajemen Retur TikTok Shop)
// ============================================================================

/**
 * Mengambil data seluruh paket retur dari tabel public.return_packages (dengan pagination otomatis)
 */
export async function fetchReturnPackages() {
  try {
    let allData = [];
    let from = 0;
    const pageSize = 1000;

    while (true) {
      const { data, error } = await supabase
        .from("return_packages")
        .select("*, return_order_items(*)")
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) {
        console.error("Error fetchReturnPackages:", error);
        break;
      }
      if (!data || data.length === 0) break;
      allData = allData.concat(data);
      if (data.length < pageSize) break;
      from += pageSize;
    }

    return allData.map((row) => ({
      id: row.id,
      trackingId: row.tracking_id,
      orderId: row.order_id || "-",
      provider: row.provider || "Lainnya",
      cancelledTime: row.cancelled_time ? formatWIBDateTime(row.cancelled_time) : "-",
      cancelledTimeRaw: row.cancelled_time,
      isReceived: Boolean(row.is_received),
      receivedAt: row.received_at ? formatWIBDateTime(row.received_at) : null,
      receivedAtRaw: row.received_at,
      isSynced: Boolean(row.is_synced),
      products: (row.return_order_items || []).map((item) => ({
        skuId: item.sku_id || "",
        name: item.product_name,
        variation: item.variation || "",
        quantity: item.quantity || 1
      }))
    }));
  } catch (err) {
    console.error("fetchReturnPackages exception:", err);
    return [];
  }
}

/**
 * Simpan / Upsert paket retur tunggal ke public.return_packages dan public.return_order_items
 */
export async function upsertReturnPackage(pkg) {
  try {
    const parsedCancelled = parseDateSafe(pkg.cancelledTimeRaw || pkg.cancelledTime);
    const parsedReceived = parseDateSafe(pkg.receivedAtRaw || pkg.receivedAt);

    const payload = {
      tracking_id: pkg.trackingId,
      order_id: pkg.orderId && pkg.orderId !== "-" ? pkg.orderId : null,
      provider: pkg.provider || "Lainnya",
      cancelled_time: parsedCancelled ? parsedCancelled.toISOString() : null,
      received_at: parsedReceived ? parsedReceived.toISOString() : null,
      is_received: Boolean(pkg.isReceived),
      is_synced: Boolean(pkg.isSynced)
    };

    const { data: savedPkg, error: pkgErr } = await supabase
      .from("return_packages")
      .upsert(payload, { onConflict: "tracking_id" })
      .select()
      .single();

    if (pkgErr) {
      console.error("Error upsertReturnPackage:", pkgErr);
      return null;
    }

    // Upsert detail produk jika ada
    if (Array.isArray(pkg.products) && pkg.products.length > 0) {
      const itemsPayload = pkg.products
        .filter((p) => p && p.name && p.name !== "-")
        .map((p) => ({
          return_package_id: savedPkg.id,
          sku_id: p.skuId || null,
          product_name: p.name || "Produk Retur",
          variation: p.variation || "",
          quantity: p.quantity || 1
        }));

      if (itemsPayload.length > 0) {
        await supabase.from("return_order_items").delete().eq("return_package_id", savedPkg.id);
        await supabase.from("return_order_items").insert(itemsPayload);
      }
    }

    return savedPkg;
  } catch (err) {
    console.error("upsertReturnPackage exception:", err);
    return null;
  }
}

/**
 * Batch Upsert paket retur dalam jumlah banyak (misal import Excel ribuan baris)
 */
export async function batchUpsertReturnPackages(pkgList, onProgress) {
  if (!Array.isArray(pkgList) || pkgList.length === 0) return { success: true, count: 0 };

  const CHUNK_SIZE = 100;
  let totalSaved = 0;

  for (let i = 0; i < pkgList.length; i += CHUNK_SIZE) {
    const chunk = pkgList.slice(i, i + CHUNK_SIZE);

    const packageRows = chunk.map((pkg) => {
      const parsedCancelled = parseDateSafe(pkg.cancelledTimeRaw || pkg.cancelledTime);
      const parsedReceived = parseDateSafe(pkg.receivedAtRaw || pkg.receivedAt);

      return {
        tracking_id: pkg.trackingId,
        order_id: pkg.orderId && pkg.orderId !== "-" ? pkg.orderId : null,
        provider: pkg.provider || "Lainnya",
        cancelled_time: parsedCancelled ? parsedCancelled.toISOString() : null,
        received_at: parsedReceived ? parsedReceived.toISOString() : null,
        is_received: Boolean(pkg.isReceived),
        is_synced: Boolean(pkg.isSynced)
      };
    });

    const { data: savedPackages, error: pkgErr } = await supabase
      .from("return_packages")
      .upsert(packageRows, { onConflict: "tracking_id" })
      .select("id, tracking_id");

    if (pkgErr) {
      console.error("Error batchUpsertReturnPackages chunk:", pkgErr);
      throw pkgErr;
    }

    // Tangani item produk jika ada
    const savedPkgMap = new Map();
    (savedPackages || []).forEach((p) => savedPkgMap.set(p.tracking_id, p.id));

    const allProductItems = [];
    const packageIdsWithItems = [];

    chunk.forEach((pkg) => {
      const dbPkgId = savedPkgMap.get(pkg.trackingId);
      if (dbPkgId && Array.isArray(pkg.products) && pkg.products.length > 0) {
        packageIdsWithItems.push(dbPkgId);
        pkg.products.forEach((p) => {
          if (p && p.name && p.name !== "-") {
            allProductItems.push({
              return_package_id: dbPkgId,
              sku_id: p.skuId || null,
              product_name: p.name,
              variation: p.variation || "",
              quantity: p.quantity || 1
            });
          }
        });
      }
    });

    if (packageIdsWithItems.length > 0) {
      await supabase.from("return_order_items").delete().in("return_package_id", packageIdsWithItems);
      if (allProductItems.length > 0) {
        const { error: itemsErr } = await supabase.from("return_order_items").insert(allProductItems);
        if (itemsErr) console.error("Error inserting return_order_items chunk:", itemsErr);
      }
    }

    totalSaved += chunk.length;
    if (typeof onProgress === "function") {
      onProgress(totalSaved, pkgList.length);
    }
  }

  return { success: true, count: totalSaved };
}

/**
 * Tandai paket retur sebagai 'Sudah Sampai' (Scan fisik di gudang)
 */
export async function markReturnAsReceived(trackingId) {
  try {
    const nowISO = new Date().toISOString();
    const { data, error } = await supabase
      .from("return_packages")
      .update({
        is_received: true,
        received_at: nowISO
      })
      .eq("tracking_id", trackingId)
      .select()
      .single();

    if (error) {
      console.error("Error markReturnAsReceived:", error);
      return null;
    }
    return data;
  } catch (err) {
    console.error("markReturnAsReceived exception:", err);
    return null;
  }
}

/**
 * Hapus seluruh data retur
 */
export async function clearAllReturnPackages() {
  try {
    const { error } = await supabase
      .from("return_packages")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");

    if (error) {
      console.error("Error clearAllReturnPackages:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("clearAllReturnPackages exception:", err);
    return false;
  }
}
