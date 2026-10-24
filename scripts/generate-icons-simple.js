const fs = require('fs');
const path = require('path');

// Simple PNG generator - creates a basic colored square PNG
// This is a minimal PNG encoder for our placeholder icons

function createPNG(width, height, bgColor = [14, 165, 233], text = 'WC') {
  // Simple PNG with solid color (no text for now - just colored squares)
  // PNG signature
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  // Helper to create chunk
  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const crc = Buffer.alloc(4);
    const crcData = Buffer.concat([Buffer.from(type), data]);
    // Simple CRC32 (not implemented, using 0 for placeholder)
    crc.writeUInt32BE(0, 0);
    return Buffer.concat([len, Buffer.from(type), data, crc]);
  }

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type: truecolor
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = chunk('IHDR', ihdrData);

  // IDAT chunk - simple solid color image data
  const rowSize = width * 3 + 1; // 3 bytes per pixel + filter byte
  const imageData = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y++) {
    imageData[y * rowSize] = 0; // filter type: none
    for (let x = 0; x < width; x++) {
      const offset = y * rowSize + 1 + x * 3;
      imageData[offset] = bgColor[0];     // R
      imageData[offset + 1] = bgColor[1]; // G
      imageData[offset + 2] = bgColor[2]; // B
    }
  }

  // Compress with zlib (simple - no compression for now)
  const zlib = require('zlib');
  const compressed = zlib.deflateSync(imageData);
  const idat = chunk('IDAT', compressed);

  // IEND chunk
  const iend = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

const outputDir = path.join(__dirname, '../public/icons');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const bgColor = [14, 165, 233]; // #0ea5e9 - blue

for (const size of sizes) {
  const png = createPNG(size, size, bgColor);
  const outputPath = path.join(outputDir, `icon-${size}.png`);
  fs.writeFileSync(outputPath, png);
  console.log(`✓ Generated icon-${size}.png (${size}x${size})`);
}

// Maskable icon (512x512 with padding - same for now)
const maskablePng = createPNG(512, 512, bgColor);
fs.writeFileSync(path.join(outputDir, 'icon-maskable-512.png'), maskablePng);
console.log('✓ Generated icon-maskable-512.png (512x512)');

// Apple touch icon (180x180)
const applePng = createPNG(180, 180, bgColor);
fs.writeFileSync(path.join(outputDir, 'apple-touch-icon.png'), applePng);
console.log('✓ Generated apple-touch-icon.png (180x180)');

console.log('\nAll placeholder icons generated!');
console.log('Note: These are solid color squares. Replace with proper icons later.');