const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const inputSvg = path.join(__dirname, '../public/icons/icon.svg');
const outputDir = path.join(__dirname, '../public/icons');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

async function generateIcons() {
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  for (const size of sizes) {
    const outputPath = path.join(outputDir, `icon-${size}.png`);
    try {
      await sharp(inputSvg)
        .resize(size, size)
        .png()
        .toFile(outputPath);
      console.log(`✓ Generated icon-${size}.png`);
    } catch (err) {
      console.error(`✗ Failed to generate icon-${size}.png:`, err.message);
    }
  }

  // Also create maskable icon (512x512 with padding)
  const maskablePath = path.join(outputDir, 'icon-maskable-512.png');
  try {
    await sharp(inputSvg)
      .resize(512, 512, { fit: 'contain', background: { r: 14, g: 165, b: 233 } })
      .png()
      .toFile(maskablePath);
    console.log('✓ Generated icon-maskable-512.png');
  } catch (err) {
    console.error('✗ Failed to generate maskable icon:', err.message);
  }

  // Create apple-touch-icon (180x180)
  const applePath = path.join(outputDir, 'apple-touch-icon.png');
  try {
    await sharp(inputSvg)
      .resize(180, 180)
      .png()
      .toFile(applePath);
    console.log('✓ Generated apple-touch-icon.png');
  } catch (err) {
    console.error('✗ Failed to generate apple-touch-icon:', err.message);
  }

  console.log('\nAll icons generated!');
}

generateIcons();