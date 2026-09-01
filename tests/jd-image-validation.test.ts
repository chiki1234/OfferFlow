import { describe, expect, it } from "vitest";
import { validateJobDescriptionImages } from "@/modules/job-description-assets/validation";

describe("validateJobDescriptionImages", () => {
  it("接受 JPEG、PNG 和 WebP，并返回可靠扩展名", () => {
    expect(validateJobDescriptionImages([
      { name: "岗位-1.jpg", type: "image/jpeg", size: 1024 },
      { name: "岗位-2.png", type: "image/png", size: 2048 },
      { name: "岗位-3.webp", type: "image/webp", size: 4096 },
    ]).map((item) => item.extension)).toEqual(["jpg", "png", "webp"]);
  });

  it("拒绝超过四张、空文件、超限文件和伪装扩展名", () => {
    expect(() => validateJobDescriptionImages(Array.from({ length: 5 }, (_, index) => ({ name: `${index}.png`, type: "image/png", size: 1 })))).toThrow("1 to 4");
    expect(() => validateJobDescriptionImages([{ name: "empty.png", type: "image/png", size: 0 }])).toThrow("empty");
    expect(() => validateJobDescriptionImages([{ name: "large.png", type: "image/png", size: 5 * 1024 * 1024 + 1 }])).toThrow("5MB");
    expect(() => validateJobDescriptionImages([{ name: "fake.pdf", type: "image/png", size: 10 }])).toThrow("JPEG, PNG, or WebP");
  });
});
