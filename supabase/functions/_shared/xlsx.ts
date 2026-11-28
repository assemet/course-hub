// Minimal .xlsx writer: enough for plain reports (text, numbers, dates,
// percentages), with a styled header row, frozen header, filters, column
// widths and right-to-left sheets. No formulas: text cells are stored as
// inline strings, so a value like "=cmd" is never evaluated.
import { zipSync, strToU8 } from "npm:fflate@0.8.2";

/** A cell: text, number, date, percentage (0..1), or empty. */
export type Cell = string | number | Date | { percent: number } | null | undefined;

export interface Sheet {
  name: string;
  /** First row is the header. */
  rows: Cell[][];
  /** Column widths in characters. */
  widths?: number[];
  /** Header row styled, frozen and filterable (default true). */
  header?: boolean;
  /** Bold first column (for label/value sheets). */
  boldFirstColumn?: boolean;
}

export interface WorkbookOptions {
  rtl?: boolean;
  /** Minutes to add to UTC when writing dates (Excel dates have no time zone). */
  tzOffsetMinutes?: number;
}

const STYLE = { normal: 0, header: 1, date: 2, percent: 3, bold: 4, wrap: 5, number: 6 } as const;

function esc(s: string): string {
  return s
    // Characters XML 1.0 does not allow.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function colName(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Sheet names: max 31 characters, none of []:*?/\ */
function sheetName(name: string): string {
  return name.replace(/[[\]:*?/\\]/g, " ").slice(0, 31) || "Sheet";
}

function cellXml(ref: string, value: Cell, style: number, tz: number): string {
  if (value === null || value === undefined || value === "") {
    return style ? `<c r="${ref}" s="${style}"/>` : "";
  }
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return "";
    const serial = (value.getTime() + tz * 60_000) / 86_400_000 + 25569;
    return `<c r="${ref}" s="${STYLE.date}"><v>${serial}</v></c>`;
  }
  if (typeof value === "object") {
    return `<c r="${ref}" s="${STYLE.percent}"><v>${Number.isFinite(value.percent) ? value.percent : 0}</v></c>`;
  }
  if (typeof value === "number") {
    return `<c r="${ref}" s="${style || STYLE.number}"><v>${Number.isFinite(value) ? value : 0}</v></c>`;
  }
  const text = esc(String(value).slice(0, 32_000));
  return `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ""}><is><t xml:space="preserve">${text}</t></is></c>`;
}

function sheetXml(sheet: Sheet, rtl: boolean, tz: number): { xml: string; filterRef: string | null } {
  const header = sheet.header !== false && sheet.rows.length > 0;
  const cols = Math.max(1, ...sheet.rows.map((r) => r.length));
  const lastRef = `${colName(cols - 1)}${Math.max(sheet.rows.length, 1)}`;
  const filterRef = header && sheet.rows.length > 1 ? `A1:${lastRef}` : null;

  const pane = header
    ? `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/>`
    : "";
  const view = `<sheetViews><sheetView workbookViewId="0"${rtl ? ' rightToLeft="1"' : ""}>${pane}</sheetView></sheetViews>`;
  const widths = sheet.widths?.length
    ? `<cols>${sheet.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
    : "";

  const rows = sheet.rows
    .map((row, r) => {
      const cells = row
        .map((value, c) => {
          const style = header && r === 0 ? STYLE.header : sheet.boldFirstColumn && c === 0 ? STYLE.bold : STYLE.normal;
          return cellXml(`${colName(c)}${r + 1}`, value, style, tz);
        })
        .join("");
      const height = header && r === 0 ? ' ht="30" customHeight="1"' : "";
      return `<row r="${r + 1}"${height}>${cells}</row>`;
    })
    .join("");

  const xml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<dimension ref="A1:${lastRef}"/>${view}<sheetFormatPr defaultRowHeight="20"/>${widths}<sheetData>${rows}</sheetData>` +
    (filterRef ? `<autoFilter ref="${filterRef}"/>` : "") +
    `<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>` +
    `<pageSetup orientation="landscape"/>` +
    `</worksheet>`;
  return { xml, filterRef };
}

const STYLES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm"/></numFmts>` +
  `<fonts count="3">` +
  `<font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>` +
  `<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>` +
  `<font><b/><sz val="11"/><color rgb="FF0B2463"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>` +
  `</fonts>` +
  `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FF0B2463"/><bgColor indexed="64"/></patternFill></fill></fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="7">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment vertical="center"/></xf>` +
  `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>` +
  `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>` +
  `<xf numFmtId="9" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>` +
  `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"><alignment vertical="center"/></xf>` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>` +
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

/** Builds an .xlsx file. */
export function buildXlsx(sheets: Sheet[], options: WorkbookOptions = {}): Uint8Array {
  const rtl = options.rtl ?? false;
  const tz = Math.max(-14 * 60, Math.min(14 * 60, options.tzOffsetMinutes ?? 0));
  const names: string[] = [];
  for (const s of sheets) {
    let name = sheetName(s.name);
    for (let i = 2; names.includes(name); i++) name = `${sheetName(s.name).slice(0, 28)} ${i}`;
    names.push(name);
  }

  const files: Record<string, Uint8Array> = {};
  const defined: string[] = [];
  sheets.forEach((sheet, i) => {
    const { xml, filterRef } = sheetXml(sheet, rtl, tz);
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(xml);
    if (filterRef) {
      const abs = filterRef.replace(/([A-Z]+)(\d+)/g, "$$$1$$$2");
      defined.push(`<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${esc(names[i].replace(/'/g, "''"))}'!${abs}</definedName>`);
    }
  });

  files["[Content_Types].xml"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
      `</Types>`,
  );
  files["_rels/.rels"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
      `</Relationships>`,
  );
  files["xl/workbook.xml"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<bookViews><workbookView activeTab="0"/></bookViews>` +
      `<sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>` +
      (defined.length ? `<definedNames>${defined.join("")}</definedNames>` : "") +
      `</workbook>`,
  );
  files["xl/_rels/workbook.xml.rels"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
      `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      `</Relationships>`,
  );
  files["xl/styles.xml"] = strToU8(STYLES_XML);

  return zipSync(files, { level: 6 });
}
