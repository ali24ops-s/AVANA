const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function generateFavicons() {
  const rootDir = path.resolve(__dirname, '..');
  const inputLogo = path.join(rootDir, 'public', 'brand', 'avana-logo.png');
  const publicDir = path.join(rootDir, 'public');

  if (!fs.existsSync(inputLogo)) {
    throw new Error(`Input logo not found at: ${inputLogo}`);
  }

  console.log(`Processing official logo from: ${inputLogo}`);
  const metadata = await sharp(inputLogo).metadata();
  console.log(`Input dimensions: ${metadata.width}x${metadata.height}, format: ${metadata.format}`);

  // 1. Generate 512x512 square favicon.png with transparent padding
  const favicon512Path = path.join(publicDir, 'favicon.png');
  const square512Buffer = await sharp(inputLogo)
    .resize(512, 512, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toBuffer();
  fs.writeFileSync(favicon512Path, square512Buffer);
  console.log(`Created 512x512 favicon.png at: ${favicon512Path} (${square512Buffer.length} bytes)`);

  // 2. Generate 180x180 apple-touch-icon.png with transparent padding
  const appleTouchPath = path.join(publicDir, 'apple-touch-icon.png');
  const appleTouchBuffer = await sharp(inputLogo)
    .resize(180, 180, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toBuffer();
  fs.writeFileSync(appleTouchPath, appleTouchBuffer);
  console.log(`Created 180x180 apple-touch-icon.png at: ${appleTouchPath} (${appleTouchBuffer.length} bytes)`);

  // 3. Generate multi-resolution favicon.ico (16, 32, 48)
  const icoSizes = [16, 32, 48];
  const pngBuffers = [];
  for (const size of icoSizes) {
    const buf = await sharp(inputLogo)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toBuffer();
    pngBuffers.push({ size, buffer: buf });
  }

  // Construct ICO binary (standard ICONDIR + ICONDIRENTRY[] + PNG image buffers)
  const numImages = icoSizes.length;
  const header = Buffer.alloc(6 + numImages * 16);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // 1 = ICO
  header.writeUInt16LE(numImages, 4); // Count of images

  let currentOffset = 6 + numImages * 16;
  for (let i = 0; i < numImages; i++) {
    const entryOffset = 6 + i * 16;
    const { size, buffer } = pngBuffers[i];
    header.writeUInt8(size >= 256 ? 0 : size, entryOffset);     // bWidth
    header.writeUInt8(size >= 256 ? 0 : size, entryOffset + 1); // bHeight
    header.writeUInt8(0, entryOffset + 2);                       // bColorCount (0 for >= 8bpp)
    header.writeUInt8(0, entryOffset + 3);                       // bReserved
    header.writeUInt16LE(1, entryOffset + 4);                    // wPlanes
    header.writeUInt16LE(32, entryOffset + 6);                   // wBitCount
    header.writeUInt32LE(buffer.length, entryOffset + 8);        // dwBytesInRes
    header.writeUInt32LE(currentOffset, entryOffset + 12);       // dwImageOffset
    currentOffset += buffer.length;
  }

  const icoBuffer = Buffer.concat([header, ...pngBuffers.map(p => p.buffer)]);
  const icoPath = path.join(publicDir, 'favicon.ico');
  fs.writeFileSync(icoPath, icoBuffer);
  console.log(`Created multi-size favicon.ico at: ${icoPath} (${icoBuffer.length} bytes, sizes: ${icoSizes.join(', ')})`);

  console.log('All favicon assets generated successfully!');
}

generateFavicons().catch((err) => {
  console.error('Error generating favicons:', err);
  process.exit(1);
});
