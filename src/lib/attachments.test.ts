import { describe, expect, it } from "vitest";
import {
  attachmentLabel,
  attachmentPath,
  attachmentProblem,
  kindOf,
  pathBelongs,
  safeFileName,
} from "./attachments";

describe("attachments", () => {
  it("classifies media", () => {
    expect(kindOf("image/jpeg")).toBe("image");
    expect(kindOf("audio/ogg; codecs=opus")).toBe("audio");
    expect(kindOf("application/pdf")).toBe("file");
  });
  it("validates uploads", () => {
    expect(attachmentProblem({ name: "a.jpg", size: 10, type: "image/jpeg" })).toBeNull();
    expect(
      attachmentProblem({ name: "a.exe", size: 10, type: "application/x-msdownload" }),
    ).toMatch(/isn't supported/);
    expect(
      attachmentProblem({ name: "big.mp4", size: 16 * 1024 * 1024, type: "video/mp4" }),
    ).toMatch(/15 MB/);
    expect(attachmentProblem({ name: "e.txt", size: 0, type: "text/plain" })).toMatch(/empty/);
  });
  it("builds safe paths and checks ownership", () => {
    expect(safeFileName("../../Fátura final (1).pdf")).toBe("Fatura_final_1_.pdf");
    const p = attachmentPath("ws", "cv", "My photo.jpg", "id1");
    expect(p).toBe("ws/cv/id1-My_photo.jpg");
    expect(pathBelongs(p, "ws", "cv")).toBe(true);
    expect(pathBelongs(p, "other", "cv")).toBe(false);
    expect(pathBelongs("ws/cv/../x", "ws", "cv")).toBe(false);
  });
  it("labels attachments for previews", () => {
    expect(attachmentLabel("image", "a.jpg")).toBe("📷 Photo: a.jpg");
  });
});
