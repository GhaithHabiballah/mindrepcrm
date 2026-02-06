export function parseClipboard(text: string): string[][] {
  const rows = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n');

  const matrix = rows
    .filter((row) => row.length > 0)
    .map((row) => row.split('\t'));

  return matrix.length > 0 ? matrix : [[]];
}
