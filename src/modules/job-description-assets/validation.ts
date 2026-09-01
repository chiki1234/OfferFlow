const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_COUNT = 4;

const supportedTypes = new Map([
  ["image/jpeg", ["jpg", "jpeg"]],
  ["image/png", ["png"]],
  ["image/webp", ["webp"]],
]);

export function validateJobDescriptionImages(files: Array<{ name: string; type: string; size: number }>) {
  if (files.length < 1 || files.length > MAX_IMAGE_COUNT) {
    throw new Error("VALIDATION_ERROR: JD image batch must contain 1 to 4 files");
  }
  return files.map((file) => {
    if (file.size <= 0) throw new Error("VALIDATION_ERROR: JD image is empty");
    if (file.size > MAX_IMAGE_BYTES) throw new Error("VALIDATION_ERROR: JD image exceeds 5MB");
    const extensions = supportedTypes.get(file.type);
    const actualExtension = file.name.toLowerCase().split(".").pop();
    if (!extensions || !actualExtension || !extensions.includes(actualExtension)) {
      throw new Error("VALIDATION_ERROR: JD image must be JPEG, PNG, or WebP");
    }
    return { extension: extensions[0] };
  });
}
