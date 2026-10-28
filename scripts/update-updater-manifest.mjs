#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const args = process.argv.slice(2);
const tag = args[0] || process.env.GITHUB_REF_NAME || '';
const platform = args[1] || 'all';

if (!tag) {
  console.error('Usage: node scripts/update-updater-manifest.mjs <tag> [platform]');
  console.error('Example: node scripts/update-updater-manifest.mjs v1.2.9 linux');
  process.exit(1);
}

const cleanVersion = tag.replace(/^v/, '');
const repoRoot = path.resolve(import.meta.dirname ? path.join(import.meta.dirname, '..') : process.cwd());
const manifestPath = path.join(repoRoot, 'latest.json');

console.log(`[Updater Manifest] Updating manifest for tag: ${tag} (${cleanVersion}), platform: ${platform}`);

// Try downloading existing latest.json from GitHub release
let manifest = {
  version: cleanVersion,
  notes: `Gradus21 Release ${tag}`,
  pub_date: new Date().toISOString(),
  platforms: {},
};

try {
  const existingJsonStr = execSync(`gh release download "${tag}" -p "latest.json" -O - 2>/dev/null`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (existingJsonStr) {
    const parsed = JSON.parse(existingJsonStr);
    if (parsed && typeof parsed === 'object') {
      manifest = {
        ...parsed,
        version: cleanVersion,
        platforms: {
          ...(parsed.platforms || {}),
        },
      };
      console.log(`[Updater Manifest] Downloaded existing latest.json with platforms: ${Object.keys(manifest.platforms).join(', ') || 'none'}`);
    }
  }
} catch {
  console.log('[Updater Manifest] No existing latest.json found in release; creating new manifest.');
}

function findArtifacts(dir, ext) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  function scan(current) {
    for (const item of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, item.name);
      if (item.isDirectory()) {
        scan(full);
      } else if (item.isFile() && item.name.endsWith(ext)) {
        files.push(full);
      }
    }
  }
  scan(dir);
  return files;
}

// 1. Linux
if (platform === 'linux' || platform === 'all') {
  const linuxDir = path.join(repoRoot, 'target', 'release', 'bundle', 'appimage');
  const tarFiles = findArtifacts(linuxDir, '.tar.gz');
  for (const tarFile of tarFiles) {
    const sigFile = tarFile + '.sig';
    if (fs.existsSync(sigFile)) {
      const sigContent = fs.readFileSync(sigFile, 'utf8').trim();
      const filename = path.basename(tarFile);
      manifest.platforms['linux-x86_64'] = {
        signature: sigContent,
        url: `https://github.com/gradus21/gradus21/releases/download/${tag}/${filename}`,
      };
      console.log(`[Updater Manifest] Found Linux updater artifact: ${filename}`);
    }
  }
}

// 2. Windows
if (platform === 'windows' || platform === 'all') {
  const nsisDir = path.join(repoRoot, 'target', 'release', 'bundle', 'nsis');
  const zipFiles = findArtifacts(nsisDir, '.zip');
  for (const zipFile of zipFiles) {
    const sigFile = zipFile + '.sig';
    if (fs.existsSync(sigFile)) {
      const sigContent = fs.readFileSync(sigFile, 'utf8').trim();
      const filename = path.basename(zipFile);
      manifest.platforms['windows-x86_64'] = {
        signature: sigContent,
        url: `https://github.com/gradus21/gradus21/releases/download/${tag}/${filename}`,
      };
      console.log(`[Updater Manifest] Found Windows updater artifact: ${filename}`);
    }
  }
}

// 3. macOS
if (platform === 'macos' || platform === 'all') {
  const targetDir = path.join(repoRoot, 'target');
  const macTarFiles = findArtifacts(targetDir, '.tar.gz').filter((p) => p.includes('bundle') && p.includes('macos'));
  for (const tarFile of macTarFiles) {
    const sigFile = tarFile + '.sig';
    if (fs.existsSync(sigFile)) {
      const sigContent = fs.readFileSync(sigFile, 'utf8').trim();
      const filename = path.basename(tarFile);
      const url = `https://github.com/gradus21/gradus21/releases/download/${tag}/${filename}`;
      if (filename.includes('aarch64') || filename.includes('universal')) {
        manifest.platforms['darwin-aarch64'] = { signature: sigContent, url };
      }
      if (filename.includes('x64') || filename.includes('x86_64') || filename.includes('universal')) {
        manifest.platforms['darwin-x86_64'] = { signature: sigContent, url };
      }
      console.log(`[Updater Manifest] Found macOS updater artifact: ${filename}`);
    }
  }
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(`[Updater Manifest] Written latest.json with platforms: ${Object.keys(manifest.platforms).join(', ')}`);

// If running in CI or if GH_TOKEN / gh is available, attempt upload
if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN || process.env.CI) {
  try {
    console.log(`[Updater Manifest] Uploading latest.json to GitHub release ${tag}...`);
    execSync(`gh release upload "${tag}" "${manifestPath}" --clobber`, { stdio: 'inherit' });
    console.log('[Updater Manifest] Successfully uploaded latest.json to GitHub release!');
  } catch (err) {
    console.warn('[Updater Manifest] Could not upload latest.json via gh CLI:', err.message);
  }
}
