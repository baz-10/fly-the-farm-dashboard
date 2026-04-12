#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// ─── Config ──────────────────────────────────────

const OUTPUT_DIR = path.resolve(__dirname, '..', 'public', 'docs');

// ─── Utilities ───────────────────────────────────

function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https:') ? https : http;

    const request = protocol.get(url, (response) => {
      if (response.statusCode === 200) {
        const file = fs.createWriteStream(outputPath);
        response.pipe(file);

        file.on('finish', () => {
          file.close();
          resolve();
        });

        file.on('error', (err) => {
          fs.unlink(outputPath, () => {}); // Delete partial file
          reject(err);
        });
      } else if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        // Follow redirect
        downloadFile(response.headers.location, outputPath).then(resolve).catch(reject);
      } else {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
      }
    });

    request.on('error', reject);
    request.setTimeout(30000, () => {
      request.abort();
      reject(new Error('Download timeout'));
    });
  });
}

function getCanonicalFilename(chemical, documentType) {
  // Handle special cases
  const normalized = chemical.toLowerCase().trim();
  if (normalized === '2,4-d' || normalized.startsWith('2,4-d ') ||
      normalized === '24d' || normalized === '24-d') {
    return documentType === 'label' ? '24d-label.pdf' : '24d-sds.pdf';
  }

  // Standard slug generation
  const slug = chemical
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return `${slug}-${documentType}.pdf`;
}

async function processManifest(manifestPath) {
  console.log(`\n=== Fly The Farm — Document Import ===\n`);

  // Read and parse manifest
  if (!fs.existsSync(manifestPath)) {
    console.error(`Error: Manifest file not found: ${manifestPath}`);
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

  console.log(`Manifest: ${manifest.name}`);
  console.log(`Description: ${manifest.description || 'No description'}`);
  console.log(`Documents to import: ${manifest.approvedDocuments.length}`);
  console.log();

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`Created output directory: ${OUTPUT_DIR}`);
  }

  // Process each approved document
  const results = {
    successful: [],
    failed: [],
  };

  for (let i = 0; i < manifest.approvedDocuments.length; i++) {
    const doc = manifest.approvedDocuments[i];
    const progress = `[${i + 1}/${manifest.approvedDocuments.length}]`;

    console.log(`${progress} ${doc.chemical} (${doc.documentType.toUpperCase()})`);
    console.log(`  URL: ${doc.candidateUrl}`);

    try {
      // Generate canonical filename
      const filename = getCanonicalFilename(doc.chemical, doc.documentType);
      const outputPath = path.join(OUTPUT_DIR, filename);

      console.log(`  Downloading to: ${filename}`);

      // Download the file
      await downloadFile(doc.candidateUrl, outputPath);

      // Verify file was created and has content
      const stats = fs.statSync(outputPath);
      if (stats.size === 0) {
        throw new Error('Downloaded file is empty');
      }

      console.log(`  ✓ Success (${(stats.size / 1024).toFixed(1)} KB)`);
      results.successful.push({
        chemical: doc.chemical,
        documentType: doc.documentType,
        url: doc.candidateUrl,
        filename,
        size: stats.size,
      });

    } catch (error) {
      console.log(`  ✗ Failed: ${error.message}`);
      results.failed.push({
        chemical: doc.chemical,
        documentType: doc.documentType,
        url: doc.candidateUrl,
        error: error.message,
      });
    }

    console.log();
  }

  // Summary
  console.log('=== Import Summary ===');
  console.log(`Successful: ${results.successful.length}`);
  console.log(`Failed: ${results.failed.length}`);

  if (results.successful.length > 0) {
    console.log('\nSuccessful imports:');
    results.successful.forEach(result => {
      console.log(`  ✓ ${result.chemical} ${result.documentType} → ${result.filename}`);
    });
  }

  if (results.failed.length > 0) {
    console.log('\nFailed imports:');
    results.failed.forEach(result => {
      console.log(`  ✗ ${result.chemical} ${result.documentType} - ${result.error}`);
    });
  }

  // Generate import report
  const reportPath = path.join(OUTPUT_DIR, `import-report-${Date.now()}.json`);
  const report = {
    manifestId: manifest.id,
    manifestName: manifest.name,
    importedAt: new Date().toISOString(),
    totalDocuments: manifest.approvedDocuments.length,
    successfulImports: results.successful.length,
    failedImports: results.failed.length,
    results,
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nImport report saved: ${path.basename(reportPath)}`);

  // Update source manager (if possible)
  console.log('\nTo update Source Manager status, refresh the Admin → Source Manager section.');

  if (results.failed.length > 0) {
    process.exit(1);
  }
}

// ─── Main ────────────────────────────────────────

function main() {
  const manifestPath = process.argv[2];

  if (!manifestPath) {
    console.error('Usage: node scripts/importApprovedDocs.js <manifest-file.json>');
    console.error('');
    console.error('Examples:');
    console.error('  node scripts/importApprovedDocs.js import-manifest-2024-01-15.json');
    console.error('  node scripts/importApprovedDocs.js ~/Downloads/my-manifest.json');
    process.exit(1);
  }

  processManifest(manifestPath).catch(error => {
    console.error(`\nFatal error: ${error.message}`);
    process.exit(1);
  });
}

if (require.main === module) {
  main();
}