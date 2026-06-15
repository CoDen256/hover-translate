const fs = require("fs");
const path = require("path");

const browser = process.argv[2];

const browsers = {
  chrome: "manifest.chrome.json",
  edge: "manifest.edge.json",
  firefox: "manifest.firefox.json",
};

if (!browser || !browsers[browser]) {
  console.error(`Usage: node stage.js [chrome|edge|firefox]`);
  process.exit(1);
}

const manifestFile = browsers[browser];
const stagingDir = path.join("staging", browser);

const filesToCopy = [
  { src: manifestFile, dest: "manifest.json" },
  { src: "_locales", dest: "_locales" },
  { src: "assets/icons", dest: "assets/icons" },
  { src: "extension/dist", dest: "extension/dist" },
  { src: "popup/dist", dest: "popup/dist" },
];

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

// Clean and recreate staging dir
if (fs.existsSync(stagingDir)) {
  fs.rmSync(stagingDir, { recursive: true });
}
fs.mkdirSync(stagingDir, { recursive: true });

for (const { src, dest } of filesToCopy) {
  if (!fs.existsSync(src)) {
    console.warn(`⚠️  Skipping missing: ${src}`);
    continue;
  }
  copyRecursive(src, path.join(stagingDir, dest));
  console.log(`✓ ${src} → ${path.join(stagingDir, dest)}`);
}

console.log(`\n✅ Staged to: ${stagingDir}`);
console.log(`   Load unpacked in Chrome → select: ${path.resolve(stagingDir)}`);