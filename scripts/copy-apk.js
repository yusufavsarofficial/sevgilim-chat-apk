const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const releaseDir = path.join(root, "android", "app", "build", "outputs", "apk", "release");
const outputs = [
  path.join(root, "release", "PuantajMaas.apk"),
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!fs.existsSync(releaseDir)) {
  fail(`Release APK klasoru bulunamadi: ${releaseDir}`);
}

const candidates = fs
  .readdirSync(releaseDir)
  .filter((name) => name.endsWith(".apk"))
  .sort((a, b) => {
    if (a === "app-release.apk") return -1;
    if (b === "app-release.apk") return 1;
    return a.localeCompare(b);
  });

if (candidates.length === 0) {
  fail(`Release APK bulunamadi: ${releaseDir}`);
}

const sourceName = candidates[0];
const sourceFile = path.join(releaseDir, sourceName);

for (const outputFile of outputs) {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.copyFileSync(sourceFile, outputFile);
  console.log(`APK kopyalandi: ${outputFile}`);
}

if (sourceName.includes("unsigned")) {
  console.warn("Uyari: APK unsigned gorunuyor. Telefona kurulum icin imzali APK gerekebilir.");
}
