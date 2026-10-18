/** Canvas で画像をリサイズ+JPEG圧縮して上限バイト以内に収める */
export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024; // Workers limit
const MAX_DIMENSION = 1600; // px
const JPEG_QUALITY = 0.85;

type CompressOptions = {
  maxDim?: number;
  maxBytes?: number;
  quality?: number;
};

export function compressImage(file: File, opts?: CompressOptions): Promise<File> {
  const maxBytes = opts?.maxBytes ?? MAX_UPLOAD_BYTES;
  const maxDim = opts?.maxDim ?? MAX_DIMENSION;
  const quality = opts?.quality ?? JPEG_QUALITY;

  // JPEGでサイズも小さい場合はスキップ
  if (file.size <= maxBytes && file.type === "image/jpeg") return Promise.resolve(file);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      let { width, height } = img;

      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas unsupported')); return; }
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error('圧縮に失敗しました')); return; }
          if (blob.size > maxBytes) {
            canvas.toBlob(
              (blob2) => {
                if (!blob2) { reject(new Error('圧縮に失敗しました')); return; }
                if (blob2.size > maxBytes) {
                  reject(new Error(`画像を圧縮しても${Math.round(maxBytes / 1024 / 1024)}MBを超えています。より小さい画像を選択してください。`));
                  return;
                }
                resolve(new File([blob2], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
              },
              'image/jpeg',
              0.6,
            );
            return;
          }
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
        },
        'image/jpeg',
        quality,
      );
    };
    img.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
    img.src = URL.createObjectURL(file);
  });
}
