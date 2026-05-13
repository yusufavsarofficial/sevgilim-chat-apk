const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const projectRoot = path.resolve(__dirname, "..");
const buildRoot = "C:\\pm-apk-build";
const androidDir = path.join(buildRoot, "android");
const sourceApkDir = path.join(buildRoot, "android", "app", "build", "outputs", "apk", "release");
const targetApkDir = path.join(projectRoot, "android", "app", "build", "outputs", "apk", "release");

function run(command, args, cwd) {
  execFileSync(command, args, {
    cwd,
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "production",
      EXPO_PUBLIC_API_BASE_URL:
        process.env.EXPO_PUBLIC_API_BASE_URL || "https://puantaj-maas-backend.onrender.com"
    }
  });
}

function removeBuildRoot() {
  const resolved = path.resolve(buildRoot);
  if (resolved.toLowerCase() !== "c:\\pm-apk-build") {
    throw new Error(`Güvenli olmayan build klasörü: ${resolved}`);
  }
  if (fs.existsSync(resolved)) {
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}

function copyProjectToShortPath() {
  removeBuildRoot();
  fs.mkdirSync(buildRoot, { recursive: true });
  const result = execFileSync(
    "robocopy",
    [
      projectRoot,
      buildRoot,
      "/E",
      "/XD",
      path.join(projectRoot, "android", "app", "build"),
      path.join(projectRoot, "android", "app", ".cxx"),
      path.join(projectRoot, "android", "build"),
      path.join(projectRoot, ".gradle"),
      "/NFL",
      "/NDL",
      "/NJH",
      "/NJS",
      "/NP"
    ],
    { stdio: "inherit" }
  );
  return result;
}

function syncApkBack() {
  if (!fs.existsSync(sourceApkDir)) {
    throw new Error(`Release APK klasörü bulunamadı: ${sourceApkDir}`);
  }
  const candidates = fs
    .readdirSync(sourceApkDir)
    .filter((name) => name.endsWith(".apk"))
    .sort((a, b) => {
      if (a === "app-release.apk") return -1;
      if (b === "app-release.apk") return 1;
      return a.localeCompare(b);
    });
  if (candidates.length === 0) {
    throw new Error(`Release APK bulunamadı: ${sourceApkDir}`);
  }

  fs.mkdirSync(targetApkDir, { recursive: true });
  fs.copyFileSync(path.join(sourceApkDir, candidates[0]), path.join(targetApkDir, candidates[0]));
}

try {
  copyProjectToShortPath();
} catch (error) {
  // Robocopy returns 1-7 for successful copy states.
  if (!error || typeof error.status !== "number" || error.status > 7) {
    throw error;
  }
}

run("cmd.exe", ["/c", "gradlew.bat", "--stop"], androidDir);
run("cmd.exe", ["/c", "gradlew.bat", "--no-daemon", "clean", "assembleRelease"], androidDir);
syncApkBack();
