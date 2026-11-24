/** One CSV cell: quoted when it holds a separator, a quote or a line break. */
const cell = (value) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

/** Rows of cells as CSV text (RFC 4180), with a byte-order mark so spreadsheets read UTF-8. */
export function toCsv(rows) {
  return `${BYTE_ORDER_MARK}${rows.map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`;
}

/** Hands a text file to the browser as a download. */
export function downloadText(fileName, text, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
