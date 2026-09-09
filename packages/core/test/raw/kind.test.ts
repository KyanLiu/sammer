import { describe, it, expect } from "vitest";
import { classifyFile } from "../../src/raw/kind.js";

describe("classifyFile", () => {
  it("reads the kind and extension from the path", () => {
    expect(classifyFile("/tmp/report.pdf")).toEqual({ ext: ".pdf", kind: "pdf" });
    expect(classifyFile("/tmp/photo.png")).toEqual({ ext: ".png", kind: "image" });
    expect(classifyFile("/tmp/talk.mp3")).toEqual({ ext: ".mp3", kind: "audio" });
    expect(classifyFile("/tmp/clip.mp4")).toEqual({ ext: ".mp4", kind: "video" });
    expect(classifyFile("/tmp/notes.md")).toEqual({ ext: ".md", kind: "text" });
  });

  it("is case insensitive and stores the lowercased extension", () => {
    expect(classifyFile("/tmp/SCAN.PDF")).toEqual({ ext: ".pdf", kind: "pdf" });
  });

  it("calls an unknown extension text, keeping the extension as found", () => {
    expect(classifyFile("/tmp/data.weird")).toEqual({ ext: ".weird", kind: "text" });
  });

  it("falls back to .txt for a file with no extension", () => {
    expect(classifyFile("/tmp/LICENSE")).toEqual({ ext: ".txt", kind: "text" });
  });
});
