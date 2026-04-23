/* ICO 파일 구조 검증: 각 엔트리가 PNG인지 BMP인지, size/offset이 유효한지 확인 */
const fs = require('fs')
const path = require('path')
const buf = fs.readFileSync(path.join(__dirname, 'icon.ico'))

if (buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) {
  console.log('❌ Invalid ICO header')
  process.exit(1)
}

const count = buf.readUInt16LE(4)
console.log(`ICO total size: ${buf.length} bytes, ${count} entries\n`)

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])

for (let i = 0; i < count; i++) {
  const off = 6 + i * 16
  let w = buf.readUInt8(off); if (w === 0) w = 256
  let h = buf.readUInt8(off + 1); if (h === 0) h = 256
  const colors = buf.readUInt8(off + 2)
  const bpp = buf.readUInt16LE(off + 6)
  const size = buf.readUInt32LE(off + 8)
  const imgOffset = buf.readUInt32LE(off + 12)

  const head = buf.slice(imgOffset, imgOffset + 8)
  const isPNG = head.equals(PNG_SIG)
  const isBMP = buf.readUInt32LE(imgOffset) === 40 // BITMAPINFOHEADER

  const tag = isPNG ? '🟢 PNG' : isBMP ? '🔵 BMP' : '⚠️  UNKNOWN'
  console.log(`  ${String(w).padStart(3)}×${String(h).padStart(3)}  ${bpp}bpp  ${String(size).padStart(7)}B  @${imgOffset}  ${tag}`)
}

console.log('\nWindows requires 256×256 entry to be PNG-encoded.')
console.log('BMP for 16/24/32/48 is traditional; PNG works on Vista+.')
