/* eslint-disable */
/**
 * SVG → 다중 해상도 PNG → PNG-embedded ICO 생성.
 * png-to-ico는 PNG를 BMP로 디코드해 버려서 Windows Vista+ 256 엔트리 요건을 어김.
 * 여기선 PNG 버퍼를 그대로 ICO 포맷에 packing하여 Explorer 캐시 miss 후에도 정상 표시.
 */
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const ROOT = __dirname
const SVG = path.join(ROOT, 'icon.svg')
const svgBuf = fs.readFileSync(SVG)

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

async function renderPngBuffer(size) {
  return sharp(svgBuf, { density: Math.max(96, Math.ceil(96 * size / 1024 * 4)) })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer()
}

async function renderPngFile(size, outFile) {
  const buf = await renderPngBuffer(size)
  fs.writeFileSync(outFile, buf)
}

/**
 * PNG 버퍼 배열을 PNG-embedded ICO로 직렬화.
 * Windows Vista SP1+ Explorer가 정상 인식.
 */
function buildIco(pngs) {
  const count = pngs.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type = icon
  header.writeUInt16LE(count, 4)

  const dirEntries = []
  let offset = 6 + 16 * count
  for (const { size, buffer } of pngs) {
    const e = Buffer.alloc(16)
    e.writeUInt8(size === 256 ? 0 : size, 0) // width (0 = 256)
    e.writeUInt8(size === 256 ? 0 : size, 1) // height
    e.writeUInt8(0, 2)                       // palette colors
    e.writeUInt8(0, 3)                       // reserved
    e.writeUInt16LE(1, 4)                    // color planes
    e.writeUInt16LE(32, 6)                   // bits per pixel
    e.writeUInt32LE(buffer.length, 8)        // image data size
    e.writeUInt32LE(offset, 12)              // offset to image data
    dirEntries.push(e)
    offset += buffer.length
  }
  return Buffer.concat([header, ...dirEntries, ...pngs.map((p) => p.buffer)])
}

async function main() {
  // 고해상도 마스터 + 트레이 아이콘
  await renderPngFile(1024, path.join(ROOT, 'icon.png'))
  await renderPngFile(32, path.join(ROOT, 'tray-icon.png'))
  await renderPngFile(16, path.join(ROOT, 'tray-icon@16.png'))

  // ICO: 각 해상도를 PNG 그대로 packing (BMP로 디코드 X)
  const pngs = []
  for (const s of ICO_SIZES) {
    const buffer = await renderPngBuffer(s)
    pngs.push({ size: s, buffer })
  }
  const ico = buildIco(pngs)
  fs.writeFileSync(path.join(ROOT, 'icon.ico'), ico)

  console.log(`OK: icon.ico (${ico.length} bytes, ${pngs.length} PNG entries), icon.png, tray-icon.png`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
