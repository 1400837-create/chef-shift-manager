// Phone camera photos are routinely 10-30MB (modern sensors, high-res JPEGs).
// Holding that raw file in React state and round-tripping it through
// IndexedDB was almost certainly what caused the "out of memory" crash on
// mobile — downscale to a sane size immediately after the user picks/shoots
// the photo, before it touches state or storage.
export async function compressImage(file, maxDim = 1600, quality = 0.75) {
  if (!file || !file.type || !file.type.startsWith('image/')) return file

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

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    return blob || file
  } catch {
    // createImageBitmap/canvas unsupported or failed — fall back to the
    // original file rather than blocking the user from adding the receipt.
    return file
  }
}
