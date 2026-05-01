# AyfSoft Yönetim Paneli

Bu panel artık backend API ile gerçek admin yönetimi yapar.

## Açılış
1. Backend çalışırken `/admin` adresine girin.
2. Admin kullanıcı adı/şifre ile giriş yapın.
3. Dashboard, kullanıcı listesi, IP ban ve audit log ekranlarını kullanın.

## Güvenlik
- Panel hiçbir veriyi token olmadan göstermez.
- Admin olmayan kullanıcı ile giriş yapılırsa erişim verilmez.
- Yapılan admin işlemleri `audit_logs` tablosuna yazılır.