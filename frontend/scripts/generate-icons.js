/**
 * Icon Generator Script
 *
 * This script generates PNG icons from SVG for PWA manifest.
 * Run: node scripts/generate-icons.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Dynamic import for sharp
let sharp;
try {
  sharp = (await import('sharp')).default;
} catch (e) {
  console.error('Sharp not installed. Please run: npm install sharp --save-dev');
  console.log('\nAlternatively, you can manually create PNG icons from the SVG files in public/icons/');
  process.exit(1);
}

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const inputSvg = path.join(__dirname, '..', 'public', 'icons', 'icon.svg');
const outputDir = path.join(__dirname, '..', 'public', 'icons');

async function generateIcons() {
  console.log('Generating PWA icons...\n');

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Read the SVG
  const svgBuffer = fs.readFileSync(inputSvg);

  for (const size of sizes) {
    const outputPath = path.join(outputDir, `icon-${size}.png`);

    try {
      await sharp(svgBuffer)
        .resize(size, size)
        .png()
        .toFile(outputPath);

      console.log(`✓ Generated icon-${size}.png`);
    } catch (error) {
      console.error(`✗ Failed to generate icon-${size}.png:`, error.message);
    }
  }

  // Generate favicon (32x32 PNG)
  try {
    const faviconPath = path.join(outputDir, '..', 'favicon.png');
    await sharp(svgBuffer)
      .resize(32, 32)
      .png()
      .toFile(faviconPath);

    console.log('\n✓ Generated favicon.png');
  } catch (error) {
    console.error('✗ Failed to generate favicon:', error.message);
  }

  // Generate Apple touch icon (180x180)
  try {
    const appleTouchPath = path.join(outputDir, 'apple-touch-icon.png');
    await sharp(svgBuffer)
      .resize(180, 180)
      .png()
      .toFile(appleTouchPath);

    console.log('✓ Generated apple-touch-icon.png');
  } catch (error) {
    console.error('✗ Failed to generate apple-touch-icon:', error.message);
  }

  console.log('\n✅ Icon generation complete!');
}

generateIcons().catch(console.error);
