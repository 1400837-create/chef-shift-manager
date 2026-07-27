// Phone camera photos are routinely 10-30MB. Storing them (even via
// IndexedDB) turned out to be unreliable on some mobile browsers/embedded
// webviews — so receipts don't touch IndexedDB at all. Instead, every photo
// is downscaled hard and turned into a small base64 data URL that rides
// along with the receipt's own data (same localStorage mechanism as
// everything else in the app, which is already proven reliable there).
// Receipt photos are for "can I read the total/date on this", not archival
// quality, so an aggressive size cap is the right trade-off.
export async function compressToDataUrl(file, maxDim = 1100, quality = 0.6) {
  if (!file || !file.type || !file.type.startsWith('image/')) return null

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close?.()

    return canvas.toDataURL('image/jpeg', quality)
  } catch {
    // createImageBitmap/canvas unsupported or the file wasn't decodable —
    // skip the photo rather than risk storing/crashing on the original.
    return null
  }
}
