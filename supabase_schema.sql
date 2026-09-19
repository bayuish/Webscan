-- ==============================================================================
-- SKEMA DATABASE LENGKAP SUPABASE (POSTGRESQL) - WEBSCAN
-- Seluruh Halaman: Scanner Live, Database Riwayat, Retur TikTok, Stok Masuk & Keluar
-- ==============================================================================

-- Aktifkan ekstensi UUID generator (jika belum aktif)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================================================
-- 1. TABEL RIWAYAT SCAN BARCODE (Pemindai Live & Halaman Database Riwayat)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.scans_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tracking_number VARCHAR(100) NOT NULL,
    courier_name VARCHAR(50) NOT NULL DEFAULT 'Lainnya',
    scan_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_duplicate BOOLEAN NOT NULL DEFAULT FALSE,
    source VARCHAR(30) NOT NULL DEFAULT 'SCANNER_LIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index performa pencarian nomor resi & filter tanggal scan
CREATE INDEX IF NOT EXISTS idx_scans_tracking ON public.scans_history(tracking_number);
CREATE INDEX IF NOT EXISTS idx_scans_time ON public.scans_history(scan_time DESC);
CREATE INDEX IF NOT EXISTS idx_scans_courier ON public.scans_history(courier_name);

-- ==============================================================================
-- 2. TABEL MANAJEMEN RETUR TIKTOK SHOP (Halaman Manajemen Retur)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.return_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tracking_id VARCHAR(100) NOT NULL UNIQUE,
    order_id VARCHAR(100),
    provider VARCHAR(50) NOT NULL DEFAULT 'Lainnya',
    cancelled_time TIMESTAMP,
    received_at TIMESTAMP,
    is_received BOOLEAN NOT NULL DEFAULT FALSE,
    is_synced BOOLEAN NOT NULL DEFAULT TRUE,
    raw_payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index performa pencarian resi retur & filter status penerimaan
CREATE INDEX IF NOT EXISTS idx_return_tracking ON public.return_packages(tracking_id);
CREATE INDEX IF NOT EXISTS idx_return_order_id ON public.return_packages(order_id);
CREATE INDEX IF NOT EXISTS idx_return_status ON public.return_packages(is_received, is_synced);
CREATE INDEX IF NOT EXISTS idx_return_received_at ON public.return_packages(received_at DESC);

-- Tabel Detail Produk Paket Retur (One-to-Many)
CREATE TABLE IF NOT EXISTS public.return_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    return_package_id UUID NOT NULL REFERENCES public.return_packages(id) ON DELETE CASCADE,
    sku_id VARCHAR(100),
    product_name TEXT NOT NULL,
    variation VARCHAR(100),
    quantity INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_return_items_pkg ON public.return_order_items(return_package_id);

-- ==============================================================================
-- 3. TABEL MANAJEMEN STOK MASUK (Halaman Manajemen Stok Masuk)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.stock_in (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_code VARCHAR(50),
    character_name VARCHAR(150),
    qty_lusin INTEGER NOT NULL CHECK (qty_lusin > 0),
    entry_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_stock_in_identifier CHECK (
        (item_code IS NOT NULL AND TRIM(item_code) <> '') OR 
        (character_name IS NOT NULL AND TRIM(character_name) <> '')
    )
);

CREATE INDEX IF NOT EXISTS idx_stock_in_code ON public.stock_in(item_code);
CREATE INDEX IF NOT EXISTS idx_stock_in_name ON public.stock_in(character_name);
CREATE INDEX IF NOT EXISTS idx_stock_in_date ON public.stock_in(entry_date DESC);

-- ==============================================================================
-- 4. TABEL MANAJEMEN STOK KELUAR (Halaman Manajemen Stok Keluar)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.stock_out (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_in_id UUID NOT NULL REFERENCES public.stock_in(id) ON DELETE CASCADE,
    item_code VARCHAR(50),
    character_name VARCHAR(150),
    qty_lusin INTEGER NOT NULL CHECK (qty_lusin > 0),
    exit_date_locked TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    photo_proof_url TEXT NOT NULL, -- URL bukti foto di Supabase Storage (≤ 200 KB)
    notes TEXT,
    created_by UUID, -- ID User/Karyawan jika menggunakan Supabase Auth
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_out_parent ON public.stock_out(stock_in_id);
CREATE INDEX IF NOT EXISTS idx_stock_out_date ON public.stock_out(exit_date_locked DESC);

-- ==============================================================================
-- 5. TABEL PENGGUNA & HAK AKSES ROLE (Owner & Employee)
-- ==============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.app_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('OWNER', 'EMPLOYEE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed 2 User Sesuai Permintaan:
-- 1. Owner: username 'fathanaj', password '123'
-- 2. Employe: username 'fachrudin', password '456'
INSERT INTO public.app_users (username, password_hash, full_name, role)
VALUES 
    ('fathanaj', crypt('123', gen_salt('bf')), 'Fathan (Owner)', 'OWNER'),
    ('fachrudin', crypt('456', gen_salt('bf')), 'Fachrudin (Karyawan)', 'EMPLOYEE')
ON CONFLICT (username) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role;

-- Fungsi RPC untuk Verifikasi Login Aman
CREATE OR REPLACE FUNCTION public.verify_user_login(p_username TEXT, p_password TEXT)
RETURNS TABLE(id UUID, username VARCHAR, full_name VARCHAR, role VARCHAR, is_valid BOOLEAN) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.id, 
        u.username, 
        u.full_name, 
        u.role, 
        TRUE AS is_valid
    FROM public.app_users u
    WHERE LOWER(u.username) = LOWER(p_username)
      AND u.password_hash = crypt(p_password, u.password_hash);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ==============================================================================
-- 5. VIEW OTOMATIS: REKAPITULASI SISA STOK GUDANG REAL-TIME
-- ==============================================================================
CREATE OR REPLACE VIEW public.view_inventory_stock_summary AS
SELECT 
    si.id,
    si.item_code,
    si.character_name,
    si.qty_lusin AS total_masuk_lusin,
    COALESCE(SUM(so.qty_lusin), 0) AS total_keluar_lusin,
    (si.qty_lusin - COALESCE(SUM(so.qty_lusin), 0)) AS sisa_stok_lusin,
    si.entry_date,
    si.created_at,
    si.updated_at
FROM public.stock_in si
LEFT JOIN public.stock_out so ON si.id = so.stock_in_id
GROUP BY si.id, si.item_code, si.character_name, si.qty_lusin, si.entry_date, si.created_at, si.updated_at;

-- ==============================================================================
-- 6. VIEW OTOMATIS: REKAPITULASI STATISTIK RETUR PER EKSPEDISI
-- ==============================================================================
CREATE OR REPLACE VIEW public.view_return_provider_stats AS
SELECT 
    provider,
    COUNT(*) AS total_paket,
    COUNT(*) FILTER (WHERE is_received = TRUE) AS total_sudah_sampai,
    COUNT(*) FILTER (WHERE is_received = FALSE) AS total_belum_sampai,
    COUNT(*) FILTER (WHERE is_synced = FALSE) AS total_belum_sinkron
FROM public.return_packages
GROUP BY provider
ORDER BY total_paket DESC;

-- ==============================================================================
-- 7. TRIGGER OTOMATIS: UPDATE TIMESTAMP 'updated_at'
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_return_packages_updated_at
    BEFORE UPDATE ON public.return_packages
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_stock_in_updated_at
    BEFORE UPDATE ON public.stock_in
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ==============================================================================
-- 8. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
-- Mengaktifkan RLS untuk keamanan data
ALTER TABLE public.scans_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_in ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_out ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

-- Policy Akses Publik/Internal (Full CRUD untuk Anon / Authenticated Users)
CREATE POLICY "Allow public read-write scans" ON public.scans_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write returns" ON public.return_packages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write return_items" ON public.return_order_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write stock_in" ON public.stock_in FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write stock_out" ON public.stock_out FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow read app_users" ON public.app_users FOR SELECT USING (true);


-- ==============================================================================
-- 9. SUPABASE STORAGE BUCKET (Foto Bukti Pengeluaran Stok <= 200 KB)
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'stock-out-proofs',
    'stock-out-proofs',
    true,
    204800, -- Maksimal 200 KB (204,800 Bytes)
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 204800,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- Storage RLS Policy (Izinkan upload & view foto bukti)
CREATE POLICY "Allow public read storage proofs" ON storage.objects FOR SELECT USING (bucket_id = 'stock-out-proofs');
CREATE POLICY "Allow public upload storage proofs" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'stock-out-proofs');
CREATE POLICY "Allow public delete storage proofs" ON storage.objects FOR DELETE USING (bucket_id = 'stock-out-proofs');
