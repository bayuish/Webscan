import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const SUPABASE_URL = "https://dmwhdnytsamzrhebjpwg.supabase.co";
const SUPABASE_KEY = "sb_publishable_SfcR_7avL5HYP1bzuom4dA_acvQsYjX";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function runSeed() {
  console.log("=== START SEEDING TO SUPABASE DATABASE ===");

  // 1. SEED SCANS HISTORY
  const scansData = JSON.parse(fs.readFileSync("scripts/scans_backup.json", "utf8"));
  console.log(`Uploading ${scansData.length} scans to scans_history...`);

  // Upload in chunks of 200 to avoid payload limits
  const chunkSize = 200;
  let insertedScans = 0;
  for (let i = 0; i < scansData.length; i += chunkSize) {
    const chunk = scansData.slice(i, i + chunkSize);
    const { data, error } = await supabase.from("scans_history").insert(chunk).select();
    if (error) {
      console.error(`Error inserting scans chunk ${i}:`, error.message);
      process.exit(1);
    }
    insertedScans += data.length;
    process.stdout.write(`Inserted ${insertedScans}/${scansData.length} scans...\r`);
  }
  console.log(`\n✓ SUCCESS: ${insertedScans} scans inserted into scans_history.`);

  // 2. SEED STOCK IN
  const stockInData = JSON.parse(fs.readFileSync("scripts/stock_in_backup.json", "utf8"));
  console.log(`Uploading ${stockInData.length} items to stock_in...`);

  const stockInPayload = stockInData.map((item) => ({
    item_code: item.item_code || null,
    character_name: item.character_name || null,
    qty_lusin: item.qty_lusin,
    entry_date: item.entry_date
  }));

  const { data: insertedStockIn, error: stockInErr } = await supabase
    .from("stock_in")
    .insert(stockInPayload)
    .select();

  if (stockInErr) {
    console.error("Error inserting stock_in:", stockInErr.message);
    process.exit(1);
  }
  console.log(`✓ SUCCESS: ${insertedStockIn.length} items inserted into stock_in.`);

  // 3. SEED STOCK OUT FOR ITEM WITH 0 REMAINING (item 2: 't34 58 tes' or matching)
  const itemOut = insertedStockIn.find(
    (si) => (si.item_code === "t34 58" || si.character_name === "tes") && si.qty_lusin === 1
  );

  if (itemOut) {
    console.log(`Creating 1 record in stock_out for '${itemOut.item_code} ${itemOut.character_name}'...`);
    const { data: insertedStockOut, error: stockOutErr } = await supabase
      .from("stock_out")
      .insert({
        stock_in_id: itemOut.id,
        item_code: itemOut.item_code,
        character_name: itemOut.character_name,
        qty_lusin: 1,
        exit_date_locked: "2026-09-20 00:09:43",
        photo_proof_url: "https://dmwhdnytsamzrhebjpwg.supabase.co/storage/v1/object/public/stock-out-proofs/sample.webp",
        notes: "Pengeluaran stok batch awal"
      })
      .select();

    if (stockOutErr) {
      console.warn("Stock out insert warning:", stockOutErr.message);
    } else {
      console.log(`✓ SUCCESS: 1 item inserted into stock_out.`);
    }
  }

  // 4. VERIFY VIEW SUMMARY
  const { data: viewData, error: viewErr } = await supabase
    .from("view_inventory_stock_summary")
    .select("*");

  if (!viewErr && viewData) {
    const totalMasuk = viewData.reduce((acc, r) => acc + (r.total_masuk_lusin || 0), 0);
    const totalKeluar = viewData.reduce((acc, r) => acc + (r.total_keluar_lusin || 0), 0);
    const totalSisa = viewData.reduce((acc, r) => acc + (r.sisa_stok_lusin || 0), 0);
    console.log(`\n=== VERIFIKASI VIEW INVENTORY STOCK SUMMARY ===`);
    console.log(`Total Item: ${viewData.length} Barang`);
    console.log(`Total Masuk: ${totalMasuk} Lusin`);
    console.log(`Total Keluar: ${totalKeluar} Lusin`);
    console.log(`Sisa Stok: ${totalSisa} Lusin`);
  }

  console.log("\n=== SEEDING COMPLETED SUCCESSFULLY! ===");
}

runSeed().catch((e) => {
  console.error("Fatal seed error:", e);
  process.exit(1);
});
