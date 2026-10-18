import fs from "node:fs/promises";
import path from "node:path";
import { PDFParse } from "pdf-parse";

const inputDir = process.argv[2] || "C:/Users/jonat/Downloads";
const outputDir = process.argv[3] || "tmp/pdfs/biology-extracted";
const files = (await fs.readdir(inputDir)).filter((name) => name.toLowerCase().endsWith(".pdf") && /biology/i.test(name)).sort();
await fs.mkdir(outputDir, { recursive: true });

const results = [];
for (const name of files) {
  const fullPath = path.join(inputDir, name);
  const buffer = await fs.readFile(fullPath);
  const parser = new PDFParse({ data: buffer });
  const parsed = await parser.getText();
  const info = await parser.getInfo({ parsePageInfo: true });
  await parser.destroy();
  const pages = (parsed.pages || []).map((page, index) => ({ page: Number(page.num || index + 1), text: String(page.text || "").trim() })).filter((page) => page.text);
  const safe = name.replace(/[^a-z0-9._-]+/gi, "_").replace(/_+/g, "_");
  await fs.writeFile(path.join(outputDir, `${safe}.json`), JSON.stringify({ name, path: fullPath, pages }, null, 2));
  results.push({ name, pages: info.total || pages.length, extractedPages: pages.length, characters: parsed.text?.length || 0, words: (parsed.text || "").split(/\s+/).filter(Boolean).length });
  console.log(JSON.stringify(results.at(-1)));
}
await fs.writeFile(path.join(outputDir, "index.json"), JSON.stringify(results, null, 2));
