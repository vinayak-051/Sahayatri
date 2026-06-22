import { describe, it, expect } from "vitest";
import { validateImageFile } from "@/lib/validateImage";

function makeFile(name: string, type: string, sizeBytes: number): File {
  const file = new File([new Uint8Array(sizeBytes)], name, { type });
  return file;
}

describe("validateImageFile", () => {
  it("accepts a small JPEG", () => {
    const file = makeFile("photo.jpg", "image/jpeg", 1024);
    expect(validateImageFile(file)).toBeNull();
  });

  it("rejects a disallowed file type", () => {
    const file = makeFile("doc.pdf", "application/pdf", 1024);
    expect(validateImageFile(file)).toMatch(/JPEG, PNG, or WebP/);
  });

  it("rejects a file over 5MB", () => {
    const file = makeFile("huge.png", "image/png", 6 * 1024 * 1024);
    expect(validateImageFile(file)).toMatch(/under 5MB/);
  });
});
