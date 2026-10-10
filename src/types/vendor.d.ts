declare module "pdf-parse" {
  const parse: (data: Buffer) => Promise<{ text: string }>;
  export default parse;
}

declare module "mammoth" {
  export function extractRawText(options: { buffer: Buffer }): Promise<{ value: string }>;
}
