export const SAMPLE_PHOTOS: Record<string, string> = {
  rice: "/samples/rice.jpg",
  oil: "/samples/oil.jpg",
};

export function withSamplePhotos<T extends { id: string; photo?: string }>(products: T[]) {
  return products.map((product) => {
    if (product.photo) return product;
    const sample = SAMPLE_PHOTOS[product.id];
    return sample ? { ...product, photo: sample } : product;
  });
}

export function readPhoto(file: File) {
  return new Promise<string>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const max = 480;
      const scale = Math.min(max / image.width, max / image.height, 1);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("canvas"));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("image"));
    };
    image.src = objectUrl;
  });
}
