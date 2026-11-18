/* eslint-disable @typescript-eslint/no-require-imports -- Vendored CommonJS QR encoder, used only on server. */
import "server-only";

// MIT-licensed QR encoding by Kazuhiko Arase, vendored from qrcode-terminal.
// Codes are generated on CampusClass servers: no third-party QR service gets
// access to students' or lecturers' attendance check-in links.
type QRInstance = { addData(value: string): void; make(): void; getModuleCount(): number; isDark(row: number, col: number): boolean };
const QRCode = require("./vendor/QRCode") as new (type: number, level: number) => QRInstance;
const ErrorLevel = require("./vendor/QRCode/QRErrorCorrectLevel") as { M: number };

export function attendanceQrSvg(value: string) {
  if (value.length > 1500) throw new Error("Check-in link is too long.");
  const qr = new QRCode(-1, ErrorLevel.M);
  qr.addData(value);
  qr.make();
  const n = qr.getModuleCount();
  const border = 4;
  const paths: string[] = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (qr.isDark(y, x)) paths.push("M" + (x + border) + " " + (y + border) + "h1v1h-1z");
    }
  }
  const size = n + border * 2;
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + ' ' + size + '" role="img" aria-label="Attendance QR code" shape-rendering="crispEdges"><path fill="#fff" d="M0 0h' + size + 'v' + size + 'H0z"/><path fill="#163a2a" d="' + paths.join("") + '"/></svg>';
}
