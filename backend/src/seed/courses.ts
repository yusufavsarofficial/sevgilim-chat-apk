import { query } from "../db.js";

type SeedCourse = {
  slug: string;
  title: string;
  summary: string;
  level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  tags: string[];
};

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function buildSeedCourses(): SeedCourse[] {
  // 200 modül: kategori x konu kombinasyonları + gerçekçi özetler.
  const families: Array<{
    family: string;
    level: SeedCourse["level"];
    tags: string[];
    topics: Array<{ title: string; summary: string }>;
  }> = [
    {
      family: "Temeller",
      level: "BEGINNER",
      tags: ["temel", "guvenlik", "pratik"],
      topics: [
        { title: "Bilgi Güvenliği Temelleri", summary: "CIA üçlüsü, tehdit modeli, risk ve kontrol kavramları. Güvenlik bakış açısını doğru kur." },
        { title: "Ağ Temelleri (Güvenlik Odaklı)", summary: "TCP/IP, portlar, DNS, HTTP(S). Trafiği okuyup anomaliyi fark etme." },
        { title: "Linux Temelleri (Pentest İçin)", summary: "Shell, izinler, süreçler, servisler. Pentest ve savunma için gerekli komut pratiği." },
        { title: "Windows Temelleri (Blue/Red)", summary: "AD temeli, servisler, event log, yerel yetkiler. Windows ortamında güvenlik düşüncesi." },
        { title: "Kriptografi 101", summary: "Hash, MAC, simetrik/asimetrik, TLS mantığı. Ne zaman ne kullanılır?" }
      ]
    },
    {
      family: "Web Güvenliği",
      level: "INTERMEDIATE",
      tags: ["web", "owasp", "api"],
      topics: [
        { title: "OWASP Top 10 Pratik", summary: "XSS, SQLi, IDOR, SSRF, CSRF. Gerçek senaryolar ve doğrulama yöntemleri." },
        { title: "JWT ve Session Güvenliği", summary: "Access/refresh mimarisi, token saklama, rotation, revocation ve saldırı vektörleri." },
        { title: "IDOR ve Yetkilendirme Tasarımı", summary: "RBAC/ABAC, object-level auth. Tasarım hatalarını yakalama ve düzeltme." },
        { title: "API Güvenliği (OWASP API Top 10)", summary: "Rate limit, authz, schema validation, audit log, error hygiene. Sağlam API standardı." },
        { title: "SSRF Savunması ve Hardening", summary: "Egress kontrol, allowlist, DNS rebinding, metadata endpoint riskleri. Uygulama seviyesinde önlem." }
      ]
    },
    {
      family: "Uygulama Güvenliği",
      level: "INTERMEDIATE",
      tags: ["secure-coding", "sdlc", "threat-model"],
      topics: [
        { title: "Threat Modeling (STRIDE) Atölyesi", summary: "Varlıklar, sınırlar, tehditler, kontroller. Ürüne uygulanabilir çıktılar üret." },
        { title: "Secure Coding: Input Validation", summary: "Zod/Schema yaklaşımı, canonicalization, boundary checks. Doğru doğrulama stratejisi." },
        { title: "Logging & Audit Tasarımı", summary: "Gereken kayıtlar, PII minimizasyonu, incident odaklı log şeması ve arama." },
        { title: "Rate Limiting ve Abuse Prevention", summary: "Kim, neyi, ne kadar? IP/user/device bazlı kısıtlar ve bypass’lara karşı tasarım." },
        { title: "Secrets Yönetimi", summary: "Client’ta secret yok, env+vault yaklaşımı. Build/deploy hattında gizli yönetimi." }
      ]
    },
    {
      family: "Mobil Güvenlik",
      level: "ADVANCED",
      tags: ["mobile", "android", "ios", "reverse"],
      topics: [
        { title: "Mobil Reverse Engineering Temelleri", summary: "APK/IPA yapısı, string/endpoint analizi, runtime gözlem. Savunma için tehditleri tanı." },
        { title: "Root/Jailbreak ve Debug Tespiti", summary: "Tespit yaklaşımları, false-positive yönetimi ve güvenli degrade stratejileri." },
        { title: "Client Token Saklama Stratejileri", summary: "Keychain/Keystore, memory riskleri, refresh token hijack senaryoları." },
        { title: "Certificate Pinning ve Alternatifleri", summary: "Pinning trade-off’ları, rotasyon, observability. Uygulanabilir ve sürdürülebilir yaklaşım." },
        { title: "Mobile API Abuse Senaryoları", summary: "Replay, automation, device spoofing. Backend savunmasıyla birlikte ele al." }
      ]
    },
    {
      family: "SOC / Blue Team",
      level: "INTERMEDIATE",
      tags: ["soc", "blue", "incident"],
      topics: [
        { title: "Incident Response Temelleri", summary: "Triage, containment, eradication, recovery. Kanıt bütünlüğü ve iletişim." },
        { title: "SIEM Kural Yazımı Mantığı", summary: "Log kaynakları, korelasyon, false-positive azaltma. Etkin alarm tasarımı." },
        { title: "Endpoint Telemetry Okuma", summary: "Process tree, network events, persistence bulguları. Saldırı izlerini yorumla." },
        { title: "Phishing Analizi", summary: "Header, URL, attachment analiz adımları. Hızlı ve sistematik inceleme." },
        { title: "Vulnerability Management Operasyonu", summary: "Önceliklendirme, SLA, risk kabulü. Kurumsal süreç tasarımı." }
      ]
    }
  ];

  // 5 aile x 5 konu = 25. Bunu 200’e genişletmek için konu varyantlarını çoğaltıyoruz.
  // Aynı çekirdek konuları farklı açı ve pratiklerle bölerek “gerçek modül” hissi veriyoruz.
  const variants = [
    "Giriş",
    "Check-list",
    "Atölye",
    "Saha Uygulaması",
    "Hardening",
    "Mimari Tasarım",
    "Debugging",
    "Pentest Perspektifi",
    "Blue Team Perspektifi",
    "Case Study",
    "Threat Hunting",
    "Kod İncelemesi",
    "Playbook",
    "Doğrulama ve Test",
    "Yanlış Yapılanlar"
  ];

  const extraTopics: Array<{ title: string; summary: string; tags: string[]; level: SeedCourse["level"] }> = [
    { title: "SQL Injection (Derinlemesine)", summary: "Union, blind, time-based, ORM bypass. Güvenli parametreleme ve WAF sınırları.", tags: ["web", "sqli"], level: "ADVANCED" },
    { title: "XSS (DOM ve Stored)", summary: "DOM sink/source, CSP, sanitization. Modern framework’lerde gerçek riskler.", tags: ["web", "xss"], level: "INTERMEDIATE" },
    { title: "SSO ve OAuth2/OIDC", summary: "Flow’lar, PKCE, token doğrulama. Yanlış implementasyonların tipik sonuçları.", tags: ["auth", "oauth"], level: "ADVANCED" },
    { title: "Konteyner Güvenliği", summary: "Image hardening, runtime politika, secret sızıntıları. CI/CD ile güvenlik.", tags: ["devsecops", "container"], level: "INTERMEDIATE" },
    { title: "Kubernetes Güvenliği", summary: "RBAC, network policy, admission kontrol. Cluster saldırı yüzeyi ve savunma.", tags: ["k8s", "devsecops"], level: "ADVANCED" },
    { title: "Supply Chain Güvenliği", summary: "Dependency pinning, SBOM, imza doğrulama. Paket ekosistem riskleri.", tags: ["supply-chain", "devsecops"], level: "ADVANCED" }
  ];

  const base: SeedCourse[] = [];

  for (const group of families) {
    for (const topic of group.topics) {
      for (const v of variants) {
        const title = `${topic.title} - ${v}`;
        base.push({
          slug: slugify(`${group.family}-${title}`),
          title,
          summary: topic.summary,
          level: group.level,
          tags: [...group.tags, group.family.toLowerCase()]
        });
      }
    }
  }

  for (const t of extraTopics) {
    for (const v of variants.slice(0, 10)) {
      const title = `${t.title} - ${v}`;
      base.push({
        slug: slugify(title),
        title,
        summary: t.summary,
        level: t.level,
        tags: t.tags
      });
    }
  }

  // Normalize: benzersiz slug, ilk 200.
  const seen = new Set<string>();
  const unique: SeedCourse[] = [];
  for (const item of base) {
    if (unique.length >= 200) break;
    const slug = item.slug || slugify(item.title);
    if (seen.has(slug)) continue;
    seen.add(slug);
    unique.push({ ...item, slug });
  }

  // Fallback: garanti 200
  while (unique.length < 200) {
    const i = unique.length + 1;
    unique.push({
      slug: `ek-modul-${i}`,
      title: `Ek Eğitim Modülü ${i}`,
      summary: "Bu modül, güvenlik uygulamalarını pekiştirmek için pratik senaryolar içerir.",
      level: "BEGINNER",
      tags: ["ek", "pratik"]
    });
  }

  return unique;
}

function buildLessonMarkdown(course: SeedCourse): string {
  return [
    `## Amaç`,
    `Bu modülde ${course.title.toLowerCase()} kapsamında temel kavramlar, gerçek saldırı senaryoları ve savunma kontrolleri ele alınır.`,
    ``,
    `## Öğrenim çıktıları`,
    `- Risk ve tehditleri doğru sınıflandırma`,
    `- Doğru kontrolü doğru yere uygulama`,
    `- Uygulamada doğrulama (test) adımlarını çıkarma`,
    ``,
    `## İçerik`,
    `- Kavramlar ve terminoloji`,
    `- Saha senaryosu`,
    `- Hardening / düzeltme adımları`,
    `- Kontrol listesi`,
    ``,
    `## Not`,
    `Bu içerik bilgilendirme amaçlıdır; kurumsal ortamlarda değişiklikler kontrollü şekilde uygulanmalıdır.`
  ].join("\n");
}

export async function ensureSeedCourses(): Promise<void> {
  const existing = await query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM courses`);
  const count = Number(existing[0]?.count ?? 0);
  if (count >= 200) {
    return;
  }

  const seed = buildSeedCourses();

  for (const course of seed) {
    const inserted = await query<{ id: string }>(
      `
        INSERT INTO courses (slug, title, summary, level, tags, is_published)
        VALUES ($1, $2, $3, $4, $5::jsonb, TRUE)
        ON CONFLICT (slug) DO NOTHING
        RETURNING id
      `,
      [course.slug, course.title, course.summary, course.level, JSON.stringify(course.tags)]
    );

    const courseId = inserted[0]?.id;
    if (!courseId) {
      continue;
    }

    await query(
      `
        INSERT INTO course_access (course_id, requires_active_license, required_plan)
        VALUES ($1, TRUE, 'STANDARD')
        ON CONFLICT (course_id) DO NOTHING
      `,
      [courseId]
    );

    await query(
      `
        INSERT INTO course_lessons (course_id, lesson_order, title, content_md)
        VALUES ($1, 1, $2, $3)
        ON CONFLICT (course_id, lesson_order) DO NOTHING
      `,
      [courseId, "Ders 1 - Başlangıç", buildLessonMarkdown(course)]
    );
  }
}

