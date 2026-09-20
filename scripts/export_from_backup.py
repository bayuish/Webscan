import openpyxl
import pdfplumber
import json
import re

print("--- 1. PARSING EXCEL SCAN RESI ---")
wb = openpyxl.load_workbook('Laporan_Scan_Resi_2026-09-20.xlsx', data_only=True)
sheet = wb['SEMUA DATA']
header_idx = 4
scans = []
for row in sheet.iter_rows(min_row=header_idx + 1, values_only=True):
    if not row or not isinstance(row[0], int):
        continue
    no, waktu, tanggal, resi, ekspedisi, status = row[:6]
    
    # Parse timestamp: '19/09/2026' and '20:45:21 WIB' -> '2026-09-19 20:45:21'
    clean_time = str(waktu).replace(" WIB", "").strip()
    d_parts = str(tanggal).strip().split("/")
    if len(d_parts) == 3:
        formatted_ts = f"{d_parts[2]}-{d_parts[1]}-{d_parts[0]} {clean_time}"
    else:
        formatted_ts = f"2026-09-20 {clean_time}"

    scans.append({
        "tracking_number": str(resi).strip(),
        "courier_name": str(ekspedisi).strip() if ekspedisi else "Lainnya",
        "scan_time": formatted_ts,
        "is_duplicate": (str(status).strip().lower() == "duplikat"),
        "source": "SCANNER_LIVE"
    })

print(f"Total scans extracted: {len(scans)}")
with open('scripts/scans_backup.json', 'w', encoding='utf-8') as f:
    json.dump(scans, f, ensure_ascii=False, indent=2)


print("\n--- 2. PARSING PDF STOK MASUK ---")
stock_in = []
with pdfplumber.open('Laporan_Stok_Masuk_Engkong_Stuff_2026-09-20.pdf') as pdf:
    for page in pdf.pages:
        tables = page.extract_tables()
        for t in tables:
            for r in t:
                if r and r[0] and r[0].strip().isdigit():
                    no = int(r[0].strip())
                    raw_dt = r[1].replace("\n", " ").replace("WIB", "").strip()
                    dt_parts = raw_dt.split(",")
                    date_part = dt_parts[0].strip()
                    time_part = dt_parts[1].strip() if len(dt_parts) > 1 else "00:00:00"
                    dp = date_part.split("/")
                    if len(dp) == 3:
                        formatted_entry = f"{dp[2]}-{dp[1]}-{dp[0]} {time_part}"
                    else:
                        formatted_entry = f"2026-09-20 {time_part}"

                    code = r[2].strip() if r[2] else ""
                    if code == "-":
                        code = ""

                    name = r[3].strip() if r[3] else ""
                    if name == "-":
                        name = ""

                    raw_qty = r[4].replace("Lsn", "").strip()
                    qty = int(raw_qty) if raw_qty.isdigit() else 1

                    raw_rem = r[5].replace("Lsn", "").strip() if len(r) > 5 else raw_qty
                    remaining_qty = int(raw_rem) if raw_rem.isdigit() else qty

                    stock_in.append({
                        "item_code": code,
                        "character_name": name,
                        "qty_lusin": qty,
                        "remaining_qty": remaining_qty,
                        "entry_date": formatted_entry
                    })

print(f"Total stock_in extracted: {len(stock_in)}")
total_qty = sum(item['qty_lusin'] for item in stock_in)
print(f"Total Lusin: {total_qty}")
with open('scripts/stock_in_backup.json', 'w', encoding='utf-8') as f:
    json.dump(stock_in, f, ensure_ascii=False, indent=2)

print("\n--- DONE EXPORTING BACKUP DATA TO JSON ---")
