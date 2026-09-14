/**
 * Client-side resize before base64 encoding.
 *
 * The API caps media at 8 MB decoded and base64 inflates by ~33%, so a straight
 * 12 MP camera photo will be rejected. 1600px on the long edge is plenty for
 * "which box is this" photos and keeps payloads well inside the limit.
 */

const MAX_EDGE = 1600;
const MAX_BYTES = 8 * 1024 * 1024;

export interface PreparedImage {
  /** `data:image/jpeg;base64,...` — ready for imagesBase64 / coverImageBase64. */
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
}

export async function prepareImage(file: File, maxEdge = MAX_EDGE): Promise<PreparedImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('That file is not an image.');
  }

  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process that image.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  if ('close' in bitmap) bitmap.close();

  // Step the quality down until the encoded payload is comfortably under the cap.
  let quality = 0.85;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  while (decodedBytes(dataUrl) > MAX_BYTES && quality > 0.4) {
    quality -= 0.15;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }

  const bytes = decodedBytes(dataUrl);
  if (bytes > MAX_BYTES) {
    throw new Error('That image is too large even after resizing. Try a smaller one.');
  }

  return { dataUrl, width, height, bytes };
}

function decodedBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      /* HEIF and friends can fail here — fall through to the <img> path */
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image. Try a JPEG or PNG.'));
    };
    img.src = url;
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
