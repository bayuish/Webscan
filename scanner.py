#!/usr/bin/env python3
"""
WebScan - USB Barcode & Resi Scanner Terminal
Membaca input dari Scanner USB secara real-time, mendeteksi ekspedisi/kurir,
menyimpan riwayat ke file CSV (Excel-ready), dan otomatis salin ke Clipboard Mac.
"""

import sys
import os
import time
import csv
import json
import subprocess
from datetime import datetime

# ANSI Colors for Terminal
C_RESET   = "\033[0m"
C_BOLD    = "\033[1m"
C_DIM     = "\033[2m"
C_CYAN    = "\033[36m"
C_GREEN   = "\033[32m"
C_YELLOW  = "\033[33m"
C_BLUE    = "\033[34m"
C_MAGENTA = "\033[35m"
C_RED     = "\033[31m"
C_WHITE   = "\033[37m"
BG_BLUE   = "\033[44m"
BG_GREEN  = "\033[42m"

CSV_FILENAME = "hasil_scan.csv"

def detect_courier(code: str) -> str:
    """Mendeteksi jenis ekspedisi / kurir berdasarkan pola nomor resi Indonesia."""
    code_upper = code.upper().strip()
    
    # Shopee Xpress (SPX)
    if code_upper.startswith("SPXID") or code_upper.startswith("SPX"):
        return "Shopee Xpress (SPX)"
    if code_upper.startswith("ID") and len(code_upper) >= 14 and code_upper[2:14].isdigit():
        return "Shopee Xpress / ID"
    
    # J&T Express (JNT) - misal: JY1539235452, JP..., JX...
    if code_upper.startswith(("JY", "JP", "JX", "EZ", "TJNT", "JET")):
        return "J&T Express (JNT)"
    if code_upper.startswith("JD") or code_upper.startswith("JN"):
        return "J&T Cargo / J&T"

    # SiCepat
    if (code_upper.startswith("00") or code_upper.startswith("01")) and len(code_upper) == 12 and code_upper.isdigit():
        return "SiCepat Ekspres"
    if code_upper.startswith("SC") or code_upper.startswith("TKP"):
        return "SiCepat / Tokopedia"

    # Anteraja
    if code_upper.startswith("1000") or code_upper.startswith("ASA"):
        return "Anteraja"

    # Ninja Xpress
    if code_upper.startswith("NLID") or code_upper.startswith("SHP"):
        return "Ninja Xpress"

    # ID Express
    if code_upper.startswith("IDE") or code_upper.startswith("IDS"):
        return "ID Express"

    # Lion Parcel
    if code_upper.startswith("LP") or (len(code_upper) == 12 and code_upper.startswith("11")):
        return "Lion Parcel"

    # JNE Express
    if code_upper.startswith("CGK") or code_upper.startswith("TJNE"):
        return "JNE Express"
    if len(code_upper) in (15, 16) and code_upper.isdigit():
        return "JNE Express (Reguler/Trucking)"

    # Pos Indonesia
    if code_upper.startswith("POS") or (len(code_upper) == 11 and code_upper.isdigit()):
        return "Pos Indonesia"

    # TikTok Shop Logistics
    if code_upper.startswith("TTS") or code_upper.startswith("TKT"):
        return "TikTok Logistics"

    # Generic Barcode / Code128 / QR
    if code_upper.isalnum():
        return "Barcode / Resi Standar"
    
    return "Data Barcode"

def play_beep(courier: str = "", is_duplicate: bool = False):
    """Memainkan suara custom (DOUBLE.mp4 / SICEPATSOUND.mp4 / JNTSOUND.mp4) atau suara bawaan."""
    base_dir = os.path.dirname(os.path.abspath(__file__))
    
    sound_path = None
    if is_duplicate:
        double_file = os.path.join(base_dir, "DOUBLE.mp4")
        if os.path.exists(double_file):
            sound_path = double_file

    if not sound_path:
        courier_upper = courier.upper()
        if "SICEPAT" in courier_upper:
            sicepat_file = os.path.join(base_dir, "SICEPATSOUND.mp4")
            if os.path.exists(sicepat_file):
                sound_path = sicepat_file
        elif "J&T" in courier_upper or "JNT" in courier_upper:
            jnt_file = os.path.join(base_dir, "JNTSOUND.mp4")
            if os.path.exists(jnt_file):
                sound_path = jnt_file

    if not sound_path or not os.path.exists(sound_path):
        sound_path = "/System/Library/Sounds/Tink.aiff"

    try:
        if sound_path and os.path.exists(sound_path):
            subprocess.Popen(["afplay", sound_path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            sys.stdout.write("\a")
            sys.stdout.flush()
    except Exception:
        sys.stdout.write("\a")
        sys.stdout.flush()

def copy_to_clipboard(text: str):
    """Menyalin teks hasil scan ke clipboard macOS (pbcopy)."""
    try:
        p = subprocess.Popen(["pbcopy"], stdin=subprocess.PIPE)
        p.communicate(input=text.encode("utf-8"))
    except Exception:
        pass

EXCEL_FILENAME = "hasil_scan.xlsx"
CSV_FILENAME = "hasil_scan.csv"

def init_excel():
    """Inisialisasi workbook Excel (.xlsx) jika belum ada."""
    try:
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
        
        if not os.path.exists(EXCEL_FILENAME):
            wb = openpyxl.Workbook()
            # Buat sheet JNT, SICEPAT, SEMUA DATA
            ws_jnt = wb.active
            ws_jnt.title = "JNT"
            ws_sic = wb.create_sheet("SICEPAT")
            ws_all = wb.create_sheet("SEMUA DATA")
            
            headers = ["NO", "WAKTU SCAN", "NOMOR RESI", "EKSPEDISI", "STATUS"]
            col_widths = [8, 22, 28, 24, 14]
            
            header_fill = PatternFill(start_color="18181B", end_color="18181B", fill_type="solid")
            header_font = Font(name="Calibri", size=10, bold=True, color="FFFFFF")
            align_center = Alignment(horizontal="center", vertical="center")
            
            for ws, title in [(ws_jnt, "LAPORAN SCAN RESI - J&T EXPRESS (JNT)"), 
                              (ws_sic, "LAPORAN SCAN RESI - SICEPAT EKSPRES"), 
                              (ws_all, "REKAPITULASI SELURUH DATA SCAN RESI")]:
                # Title
                ws.merge_cells("A1:E1")
                ws["A1"] = title
                ws["A1"].font = Font(name="Calibri", size=13, bold=True, color="09090B")
                ws["A1"].alignment = Alignment(horizontal="left", vertical="center")
                ws.row_dimensions[1].height = 26
                
                # Headers
                ws.append([]) # Baris 2 kosong
                ws.append(headers) # Baris 3
                ws.row_dimensions[3].height = 24
                
                for col_idx in range(1, len(headers) + 1):
                    cell = ws.cell(row=3, column=col_idx)
                    cell.fill = header_fill
                    cell.font = header_font
                    cell.alignment = align_center
                    ws.column_dimensions[openpyxl.utils.get_column_letter(col_idx)].width = col_widths[col_idx - 1]
            
            wb.save(EXCEL_FILENAME)
    except Exception as e:
        pass

def append_excel(timestamp: str, code: str, courier: str, length: int, is_duplicate: bool):
    """Menyimpan data hasil scan ke sheet yang sesuai di file Excel (.xlsx)."""
    try:
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
        
        if not os.path.exists(EXCEL_FILENAME):
            init_excel()
            
        wb = openpyxl.load_workbook(EXCEL_FILENAME)
        
        thin_border = Border(
            left=Side(style='thin', color='E2E8F0'),
            right=Side(style='thin', color='E2E8F0'),
            top=Side(style='thin', color='E2E8F0'),
            bottom=Side(style='thin', color='E2E8F0')
        )
        
        courier_upper = courier.upper()
        target_sheets = [wb["SEMUA DATA"]]
        
        if "J&T" in courier_upper or "JNT" in courier_upper:
            target_sheets.append(wb["JNT"])
        elif "SICEPAT" in courier_upper:
            target_sheets.append(wb["SICEPAT"])
            
        status_text = "Duplikat" if is_duplicate else "Asli"
        
        for ws in target_sheets:
            row_idx = ws.max_row + 1
            item_no = row_idx - 3 # Baris 1 judul, 2 kosong, 3 header
            
            # Kolom PANJANG dihapus
            ws.append([item_no, timestamp, f"'{code}", courier, status_text])
            ws.row_dimensions[row_idx].height = 20
            
            is_even = (item_no % 2 == 0)
            row_fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid") if is_even else None
            
            for col_idx in range(1, 6):
                cell = ws.cell(row=row_idx, column=col_idx)
                cell.border = thin_border
                if row_fill:
                    cell.fill = row_fill
                
                if col_idx in (1, 2, 5):
                    cell.alignment = Alignment(horizontal="center", vertical="center")
                    cell.font = Font(name="Calibri", size=10, color="18181B")
                elif col_idx == 3:
                    # Nomor resi
                    cell.alignment = Alignment(horizontal="center", vertical="center")
                    cell.font = Font(name="Consolas", size=10.5, bold=True, color="09090B")
                    cell.number_format = "@"
                else:
                    cell.alignment = Alignment(horizontal="left", vertical="center")
                    cell.font = Font(name="Calibri", size=10, color="18181B")
                    
                if col_idx == 5 and is_duplicate:
                    cell.font = Font(name="Calibri", size=9.5, bold=True, color="DC2626")
                    
        wb.save(EXCEL_FILENAME)
    except Exception as e:
        pass

JSON_FILENAME = "data_scan.json"

def append_json(timestamp: str, code: str, courier: str, length: int, is_duplicate: bool):
    """Menyimpan data hasil scan ke file JSON lokal (append/persist)."""
    try:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        json_path = os.path.join(base_dir, JSON_FILENAME)
        
        data = []
        if os.path.exists(json_path):
            try:
                with open(json_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except Exception:
                data = []
                
        if not isinstance(data, list):
            data = []
            
        now_dt = datetime.now()
        courier_upper = courier.upper()
        tag = "JNT" if ("J&T" in courier_upper or "JNT" in courier_upper) else "SICEPAT" if "SICEPAT" in courier_upper else "LAINNYA"
        
        item = {
            "id": f"{int(time.time() * 1000)}-{code}",
            "code": code,
            "courier": {
                "name": courier,
                "tag": tag
            },
            "timestamp": timestamp,
            "fullDate": now_dt.strftime("%d/%m/%Y %H:%M:%S"),
            "isDuplicate": is_duplicate
        }
        
        # Tambah ke paling depan (unshift)
        data.insert(0, item)
        
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        pass

def print_banner():
    """Tampilan header selamat datang."""
    print(f"{C_CYAN}{C_BOLD}╔═══════════════════════════════════════════════════════════════════════╗{C_RESET}")
    print(f"{C_CYAN}{C_BOLD}║           📦 PROGRAM SCANNER RESI USB (TERMINAL READER)               ║{C_RESET}")
    print(f"{C_CYAN}{C_BOLD}╚═══════════════════════════════════════════════════════════════════════╝{C_RESET}")
    print(f"{C_DIM}Status: {C_GREEN}● Scanner Standby & Siap Scan{C_RESET}")
    print(f"{C_DIM}Fitur Otomatis:{C_RESET}")
    print(f"  {C_GREEN}✓{C_RESET} Deteksi Otomatis Ekspedisi: {C_BOLD}J&T Express & SiCepat Ekspres{C_RESET}")
    print(f"  {C_GREEN}✓{C_RESET} Tersimpan rapi ke file Excel: {C_YELLOW}{C_BOLD}{EXCEL_FILENAME}{C_RESET} (Sheet JNT & SICEPAT terpisah)")
    print(f"  {C_GREEN}✓{C_RESET} Auto-Copy ke Clipboard (Siap langsung {C_BOLD}Cmd+V{C_RESET} di WA/Excel)")
    print(f"  {C_GREEN}✓{C_RESET} Suara custom: {C_BOLD}SICEPATSOUND.mp4{C_RESET}, {C_BOLD}JNTSOUND.mp4{C_RESET}, {C_BOLD}DOUBLE.mp4{C_RESET}")
    print(f"{C_DIM}Tekan {C_RED}{C_BOLD}Ctrl + C{C_RESET}{C_DIM} kapan saja untuk menghentikan program.{C_RESET}")
    print(f"{C_CYAN}─" * 71 + f"{C_RESET}\n")

def main():
    init_excel()
    print_banner()

    scanned_history = set()
    scan_count = 0

    print(f"{C_YELLOW}{C_BOLD}>>> Arahkan Scanner USB ke Barcode / Resi lalu SCAN <<<{C_RESET}\n")

    try:
        while True:
            # Membaca input dari USB scanner (yang bertindak sebagai keyboard input + Enter)
            try:
                raw_input = input(f"{C_CYAN}[SCAN READY] {C_RESET}").strip()
            except EOFError:
                break

            if not raw_input:
                continue

            scan_count += 1
            now_dt = datetime.now()
            time_str = now_dt.strftime("%d/%m/%Y, %H:%M:%S") + " WIB"
            short_time = now_dt.strftime("%H:%M:%S") + " WIB"
            
            courier = detect_courier(raw_input)
            code_len = len(raw_input)
            is_duplicate = raw_input in scanned_history

            # Play beep sound & copy to clipboard
            play_beep(courier, is_duplicate=is_duplicate)
            copy_to_clipboard(raw_input)

            # Save to Excel (.xlsx) dan JSON lokal (data_scan.json)
            append_excel(time_str, raw_input, courier, code_len, is_duplicate)
            append_json(time_str, raw_input, courier, code_len, is_duplicate)
            scanned_history.add(raw_input)

            # Print scan result
            print(f"\n{C_BOLD}┌─ HASIL SCAN #{scan_count} ───────────────────────────────────────┐{C_RESET}")
            print(f"│ {C_DIM}Waktu     :{C_RESET} {short_time}")
            print(f"│ {C_DIM}No. Resi  :{C_RESET} {C_GREEN}{C_BOLD}{raw_input}{C_RESET}")
            print(f"│ {C_DIM}Ekspedisi :{C_RESET} {C_CYAN}{courier}{C_RESET}")
            print(f"│ {C_DIM}Panjang   :{C_RESET} {code_len} karakter")
            print(f"│ {C_DIM}Status    :{C_RESET} {'⚠️  DUPLIKAT' if is_duplicate else '✓ Unik'}")
            print(f"│ {C_DIM}Excel     :{C_RESET} Tersimpan ke Sheet {C_YELLOW}{'JNT' if 'J&T' in courier.upper() or 'JNT' in courier.upper() else 'SICEPAT' if 'SICEPAT' in courier.upper() else 'SEMUA DATA'}{C_RESET}")
            print(f"│ {C_DIM}Clipboard :{C_RESET} {C_GREEN}Tersalin! (Bisa langsung Cmd+V di WA/Excel){C_RESET}")
            
            if is_duplicate:
                print(f"│ {C_YELLOW}{C_BOLD}⚠️  PERINGATAN: Resi ini sudah pernah di-scan sebelumnya!{C_RESET}")
            
            print(f"{C_BOLD}└────────────────────────────────────────────────────────┘{C_RESET}\n")

    except KeyboardInterrupt:
        print(f"\n\n{C_YELLOW}Program dihentikan.{C_RESET}")
        print(f"{C_CYAN}Total resi di-scan sesi ini : {C_BOLD}{scan_count}{C_RESET}")
        print(f"{C_CYAN}File Excel formal tersimpan di : {C_BOLD}{os.path.abspath(EXCEL_FILENAME)}{C_RESET}")
        print(f"{C_GREEN}Terima kasih! Sampai jumpa.{C_RESET}\n")

if __name__ == "__main__":
    main()
