# Puantaj Maas APK (Expo)

Android için puantaj + maaş + mesai + eksik ödeme + giriş/çıkış + konum kaydı uygulaması.

## Özellikler
- Giriş/çıkış ile vardiya kaydı
- Giriş konumu ve çıkış konumu kaydı
- Vardiya tipleri: `NORMAL`, `OVERTIME`, `SUNDAY`, `HOLIDAY`
- Aylık özet: saat, alacak, kesinti, hak ediş, eksik/fazla ödeme
- Katsayı ayarları değiştirilebilir
- Supabase ile online veri senkronizasyonu

## Resmî Katsayı Dayanakları (Varsayılan)
- Fazla mesai: `1.5x` (4857 Madde 41, saat ücretine `%50` artış)
- Resmî tatilde çalışma: varsayılan `2.0x` toplam etki (4857 Madde 47 + Madde 49 uygulaması)
- Pazar/hafta tatili: varsayılan `2.5x` (uygulamada sözleşme ve içtihada göre değişebilir, ayarlardan düzenlenebilir)

Not: Bordro tipi, toplu sözleşme ve sektör uygulamaları farklı olabildiği için katsayılar Ayarlar ekranından düzenlenebilir.

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

Supabase SQL Editor'da tablo oluştur:

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

Güvenlik notu: Üretimde `employee_code` veya auth tabanlı RLS policy ile veri yetkilendirmesi yapman önerilir.
