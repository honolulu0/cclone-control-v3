import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const options = {
    target: "desktop-clone",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--target") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value for --target");
      }
      options.target = value;
      index += 1;
      continue;
    }

    if (arg.startsWith("--target=")) {
      const value = arg.slice("--target=".length);
      if (!value) {
        throw new Error("Missing value for --target");
      }
      options.target = value;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

const { target: targetDirName } = parseArgs(process.argv.slice(2));
const workspaceRoot = process.cwd();
const sourceRoot = path.join(workspaceRoot, "app", "resources");
const asarPath = path.join(sourceRoot, "app.asar");
const unpackedPath = path.join(sourceRoot, "app.asar.unpacked");
const nativePath = path.join(sourceRoot, "native");
const targetRoot = path.join(workspaceRoot, targetDirName);
const extractedRoot = path.join(targetRoot, "app");

function assertExists(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required path: ${filePath}`);
  }
}

function readAsarArchive(filePath) {
  const archive = fs.readFileSync(filePath);
  const headerSize = archive.readUInt32LE(4);
  const jsonSize = archive.readUInt32LE(12);
  const header = JSON.parse(archive.subarray(16, 16 + jsonSize).toString("utf8"));
  const baseOffset = 8 + headerSize;
  return { archive, header, baseOffset };
}

function walkFiles(node, prefix = "") {
  if (!node.files) {
    return [];
  }

  const entries = [];
  for (const [name, child] of Object.entries(node.files)) {
    const nextPath = prefix ? path.join(prefix, name) : name;
    if (child.files) {
      entries.push({ type: "dir", relativePath: nextPath });
      entries.push(...walkFiles(child, nextPath));
    } else {
      entries.push({
        type: "file",
        relativePath: nextPath,
        offset: Number(child.offset),
        size: Number(child.size),
        executable: Boolean(child.executable),
        unpacked: Boolean(child.unpacked),
      });
    }
  }

  return entries;
}

function ensureCleanDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
  fs.mkdirSync(dirPath, { recursive: true });
}

function extractArchive() {
  assertExists(asarPath);
  const { archive, header, baseOffset } = readAsarArchive(asarPath);
  const entries = walkFiles(header);

  ensureCleanDir(extractedRoot);

  let fileCount = 0;
  let totalBytes = 0;

  for (const entry of entries) {
    const outPath = path.join(extractedRoot, entry.relativePath);
    if (entry.type === "dir") {
      fs.mkdirSync(outPath, { recursive: true });
      continue;
    }

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const start = baseOffset + entry.offset;
    const end = start + entry.size;
    fs.writeFileSync(outPath, archive.subarray(start, end));

    if (entry.executable && process.platform !== "win32") {
      fs.chmodSync(outPath, 0o755);
    }

    fileCount += 1;
    totalBytes += entry.size;
  }

  return { entries, fileCount, totalBytes };
}

function copyOptionalTree(source, target) {
  if (!fs.existsSync(source)) {
    return false;
  }

  fs.cpSync(source, target, { recursive: true, force: true });
  return true;
}

function replaceOptionalTree(source, target) {
  if (!fs.existsSync(source)) {
    return false;
  }

  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(source, target, { recursive: true, force: true });
  return true;
}

function writeManifest(manifest) {
  fs.mkdirSync(targetRoot, { recursive: true });
  fs.writeFileSync(
    path.join(targetRoot, "extraction-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
}

function findKeyPaths() {
  const candidates = [
    "package.json",
    ".vite/build/bootstrap.js",
    ".vite/build/preload.js",
    "webview/index.html",
  ];

  const buildDir = path.join(extractedRoot, ".vite", "build");
  if (fs.existsSync(buildDir)) {
    for (const fileName of fs.readdirSync(buildDir)) {
      if (/^main-.*\.js$/.test(fileName)) {
        candidates.push(path.join(".vite", "build", fileName));
      }
    }
  }

  const webviewAssetsDir = path.join(extractedRoot, "webview", "assets");
  if (fs.existsSync(webviewAssetsDir)) {
    for (const fileName of fs.readdirSync(webviewAssetsDir)) {
      if (/^index-.*\.(js|css)$/.test(fileName)) {
        candidates.push(path.join("webview", "assets", fileName));
      }
    }
  }

  return [...new Set(candidates)].filter((relativePath) =>
    fs.existsSync(path.join(extractedRoot, relativePath)),
  );
}

function main() {
  assertExists(sourceRoot);

  const { entries, fileCount, totalBytes } = extractArchive();

  const mergedUnpackedIntoApp = copyOptionalTree(unpackedPath, extractedRoot);
  const copiedUnpacked = replaceOptionalTree(
    unpackedPath,
    path.join(targetRoot, "app.asar.unpacked"),
  );
  const copiedNative = replaceOptionalTree(nativePath, path.join(targetRoot, "native"));

  const copiedResourceFiles = [];
  for (const fileName of [
    "notification.wav",
    "codex",
    "codex.exe",
    "codex-command-runner.exe",
    "codex-windows-sandbox-setup.exe",
    "rg",
    "rg.exe",
    "THIRD_PARTY_NOTICES.txt",
  ]) {
    const source = path.join(sourceRoot, fileName);
    if (!fs.existsSync(source)) {
      continue;
    }

    const target = path.join(targetRoot, fileName);
    fs.copyFileSync(source, target);
    copiedResourceFiles.push(fileName);
  }

  const keyPaths = findKeyPaths();

  const manifest = {
    createdAt: new Date().toISOString(),
    targetRoot,
    sourceAsar: asarPath,
    extractedRoot,
    fileCount,
    totalBytes,
    mergedUnpackedIntoApp,
    copiedUnpacked,
    copiedNative,
    copiedResourceFiles,
    keyPaths,
  };

  writeManifest(manifest);

  console.log(
    JSON.stringify(
      {
        message: "Codex desktop bundle extracted",
        ...manifest,
      },
      null,
      2,
    ),
  );
}

main();
