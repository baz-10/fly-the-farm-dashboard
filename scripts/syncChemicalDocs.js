#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// ─── Config ──────────────────────────────────────

const OUTPUT_DIR = path.resolve(__dirname, '..', 'public', 'docs');

const CHEMICALS = {
  'grazon extra':  'grazon-extra',
  'grazon':        'grazon-extra',
  'starane':       'starane',
  'metsulfuron':   'metsulfuron',
  'glyphosate':    'glyphosate',
};

const LABEL_KEYWORDS = ['label', 'product-label', 'product_label', 'productlabel'];
const SDS_KEYWORDS   = ['sds', 'safety-data', 'safety_data', 'safetydata', 'msds'];

// ─── Helpers ─────────────────────────────────────

function detectChemical(filename) {
  // Normalise filename: replace separators with spaces, collapse
  const normalised = filename.toLowerCase().replace(/[-_]+/g, ' ');
  // Try longest keys first so "grazon extra" matches before "grazon"
  const keys = Object.keys(CHEMICALS).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (normalised.includes(key)) {
      return CHEMICALS[key];
    }
  }
  return null;
}

function detectDocType(filename) {
  const lower = filename.toLowerCase();
  if (SDS_KEYWORDS.some((kw) => lower.includes(kw))) return 'sds';
  if (LABEL_KEYWORDS.some((kw) => lower.includes(kw))) return 'label';
  return null;
}

// ─── Manifest Processing ─────────────────────────

function processManifestMode(manifestPath) {
  if (!fs.existsSync(manifestPath)) {
    console.error(`Manifest file not found: ${manifestPath}`);
    process.exit(1);
  }

  let manifest;
  try {
    const manifestData = fs.readFileSync(manifestPath, 'utf8');
    manifest = JSON.parse(manifestData);
  } catch (error) {
    console.error(`Error reading manifest: ${error.message}`);
    process.exit(1);
  }

  console.log('');
  console.log('=== Fly The Farm — Manifest Mode ===');
  console.log('');
  console.log(`Manifest: ${manifest.name}`);
  console.log(`Description: ${manifest.description || 'No description'}`);
  console.log(`Documents: ${manifest.approvedDocuments.length}`);
  console.log('');

  if (!manifest.approvedDocuments || manifest.approvedDocuments.length === 0) {
    console.log('No approved documents found in manifest.');
    return;
  }

  // Ensure output directory exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const processed = [];
  const failed = [];

  for (const doc of manifest.approvedDocuments) {
    const chemical = detectChemical(doc.chemical) || doc.chemical.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const outName = `${chemical}-${doc.documentType}.pdf`;
    const dest = path.join(OUTPUT_DIR, outName);

    console.log(`Processing: ${doc.chemical} (${doc.documentType.toUpperCase()})`);
    console.log(`  URL: ${doc.candidateUrl}`);
    console.log(`  Output: ${outName}`);

    try {
      // For manifest mode, we'll create placeholder files since we can't download from URLs in this script
      // In a real implementation, this would download from doc.candidateUrl
      const placeholderContent = `PDF placeholder for ${doc.chemical} ${doc.documentType}\nSource URL: ${doc.candidateUrl}\nGenerated at: ${new Date().toISOString()}`;
      fs.writeFileSync(dest, placeholderContent);

      processed.push({ chemical: doc.chemical, documentType: doc.documentType, outName });
      console.log(`  ✓ Created placeholder`);
    } catch (error) {
      failed.push({ chemical: doc.chemical, documentType: doc.documentType, error: error.message });
      console.log(`  ✗ Failed: ${error.message}`);
    }
    console.log('');
  }

  // Summary
  console.log('=== Manifest Processing Summary ===');
  console.log(`Processed: ${processed.length}`);
  console.log(`Failed: ${failed.length}`);

  if (processed.length > 0) {
    console.log('');
    console.log('Processed:');
    for (const { chemical, documentType, outName } of processed) {
      console.log(`  ✓ ${chemical} ${documentType} -> public/docs/${outName}`);
    }
  }

  if (failed.length > 0) {
    console.log('');
    console.log('Failed:');
    for (const { chemical, documentType, error } of failed) {
      console.log(`  ✗ ${chemical} ${documentType} - ${error}`);
    }
  }

  console.log('');
  console.log('NOTE: This script creates placeholders. Use the importApprovedDocs.js script to download actual PDFs.');
}

// ─── Main ────────────────────────────────────────

function main() {
  const sourceDir = process.argv[2];
  const manifestFlag = process.argv[3];

  if (!sourceDir) {
    console.error('Usage: node scripts/syncChemicalDocs.js <source-folder> [--manifest]');
    console.error('');
    console.error('Examples:');
    console.error('  node scripts/syncChemicalDocs.js ~/Documents/chemical-pdfs');
    console.error('  node scripts/syncChemicalDocs.js ~/Documents/chemical-pdfs --manifest');
    console.error('');
    console.error('Options:');
    console.error('  --manifest    Process import manifests instead of directory scanning');
    process.exit(1);
  }

  // Check for manifest mode
  if (manifestFlag === '--manifest') {
    processManifestMode(sourceDir);
    return;
  }

  const resolved = path.resolve(sourceDir);

  if (!fs.existsSync(resolved)) {
    console.error(`Source folder not found: ${resolved}`);
    process.exit(1);
  }

  // Ensure output directory exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Scan source folder (and subfolders) for PDFs
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.toLowerCase().endsWith('.pdf')) {
        files.push({ name: entry.name, fullPath: full });
      }
    }
  }
  walk(resolved);

  if (files.length === 0) {
    console.log('No PDF files found in source folder.');
    process.exit(0);
  }

  const copied = [];
  const skipped = [];
  const unmatched = [];

  for (const { name: file, fullPath } of files) {
    const chemical = detectChemical(file);
    const docType = detectDocType(file);

    if (!chemical || !docType) {
      unmatched.push(file);
      continue;
    }

    const outName = `${chemical}-${docType}.pdf`;
    const dest = path.join(OUTPUT_DIR, outName);

    // Skip if destination already exists and is the same size
    if (fs.existsSync(dest)) {
      const srcStat = fs.statSync(fullPath);
      const destStat = fs.statSync(dest);
      if (srcStat.size === destStat.size) {
        skipped.push({ file, outName, reason: 'already up to date' });
        continue;
      }
    }

    fs.copyFileSync(fullPath, dest);
    copied.push({ file, outName });
  }

  // ─── Summary ─────────────────────────────────

  console.log('');
  console.log('=== Fly The Farm — Document Sync ===');
  console.log('');

  if (copied.length > 0) {
    console.log(`Copied (${copied.length}):`);
    for (const { file, outName } of copied) {
      console.log(`  ${file} -> public/docs/${outName}`);
    }
    console.log('');
  }

  if (skipped.length > 0) {
    console.log(`Skipped (${skipped.length}):`);
    for (const { file, outName, reason } of skipped) {
      console.log(`  ${file} -> ${outName} (${reason})`);
    }
    console.log('');
  }

  if (unmatched.length > 0) {
    console.log(`Unmatched (${unmatched.length}):`);
    for (const file of unmatched) {
      const chemical = detectChemical(file);
      const docType = detectDocType(file);
      const hints = [];
      if (!chemical) hints.push('unknown chemical');
      if (!docType) hints.push('unknown doc type — include "label" or "sds" in filename');
      console.log(`  ${file} (${hints.join(', ')})`);
    }
    console.log('');
  }

  console.log(`Done. ${copied.length} copied, ${skipped.length} skipped, ${unmatched.length} unmatched.`);
}

main();
