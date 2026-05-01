# Puantaj Maas APK (Expo)

Android icin puantaj + maas + mesai + eksik odeme + giris/cikis + konum kaydi uygulamasi.

## Ozellikler
- Giris/cikis ile vardiya kaydi
- Giris konumu ve cikis konumu kaydi
- Vardiya tipleri: `NORMAL`, `OVERTIME`, `SUNDAY`, `HOLIDAY`
- Aylik ozet: saat, alacak, kesinti, hak edis, eksik/fazla odeme
- Katsayi ayarlari degistirilebilir
- Supabase ile online veri senkronu

## Resmi Katsayi Dayanaklari (Varsayilan)
- Fazla mesai: `1.5x` (4857 Madde 41, saat ucretine `%50` artis)
- Resmi tatilde calisma: varsayilan `2.0x` toplam etki (4857 Madde 47 + Madde 49 uygulamasi)
- Pazar/hafta tatili: varsayilan `2.5x` (uygulamada sozlesme ve ictihada gore degisebilir, ayarlardan duzenlenebilir)

Not: Bordro tipi, toplu sozlesme ve sektor uygulamalari farkli olabildigi icin katsayilar Ayarlar ekranindan duzenlenebilir.

## Kurulum
1. Node.js ve npm kur.
2. Proje klasorunde:
```bash
npm install
npx expo start
```

## Android APK Alma
Expo EAS ile:
```bash
npx eas login
npx eas build -p android --profile preview
```

`eas.json` zaten APK icin ayarli (`android.buildType = "apk"`).

## Supabase Online Kurulum
`Bulut` sekmesinde `supabaseUrl`, `supabaseAnonKey`, `employeeCode` gir.

Supabase SQL Editor'da tablo olustur:

```sql
create table if not exists public.work_logs (
  id text primary key,
  employee_code text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  break_minutes numeric not null default 0,
  shift_type text not null,
  allowance numeric not null default 0,
  deduction numeric not null default 0,
  note text not null default '',
  check_in_lat double precision,
  check_in_lng double precision,
  check_in_accuracy double precision,
  check_in_at timestamptz,
  check_out_lat double precision,
  check_out_lng double precision,
  check_out_accuracy double precision,
  check_out_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.work_logs enable row level security;

-- Demo policy (uretimde daha kisitli policy yaz):
create policy "work_logs_read_all" on public.work_logs
for select using (true);

create policy "work_logs_write_all" on public.work_logs
for insert with check (true);

create policy "work_logs_update_all" on public.work_logs
for update using (true) with check (true);
```

Guvenlik notu: Uretimde `employee_code` veya auth tabanli RLS policy ile veri yetkilendirmesi yapman onerilir.
