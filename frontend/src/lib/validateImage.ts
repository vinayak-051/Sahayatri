const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

export function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return "Please upload a JPEG, PNG, or WebP image.";
  }
  if (file.size > MAX_IMAGE_SIZE) {
    return "Image must be under 5MB.";
  }
  return null;
}
