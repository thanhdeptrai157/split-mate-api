import { BadRequestException, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';

export const BILL_IMPORT_TEMPLATE_FILE_NAME = 'splitmate-bill-template.xlsx';
export const BILL_IMPORT_TEMPLATE_SHEET_NAME = 'Hóa đơn';

const NAME_HEADER = 'Tên món';
const AMOUNT_HEADER = 'Giá tiền';
const NAME_HEADERS = [NAME_HEADER, 'Tên món ăn', 'Tên', 'Món'];
const AMOUNT_HEADERS = [AMOUNT_HEADER, 'Đơn giá', 'Số tiền', 'Thành tiền'];
const MAX_ITEMS = 1000;
const MAX_NAME_LENGTH = 200;
const MAX_BILL_NAME_LENGTH = 200;
const MAX_AMOUNT = Number.MAX_SAFE_INTEGER;
const EXAMPLE_ROW = ['Pizza', 150000];

export interface ImportedBillItem {
  name: string;
  amount: number;
}

export interface ImportedBill {
  name: string;
  items: ImportedBillItem[];
  totalAmount: number;
}

@Injectable()
export class BillImportService {
  async buildTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(BILL_IMPORT_TEMPLATE_SHEET_NAME);

    worksheet.columns = [
      { header: NAME_HEADER, key: 'name', width: 40 },
      { header: AMOUNT_HEADER, key: 'amount', width: 20 },
    ];
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).alignment = { vertical: 'middle' };
    worksheet.addRow(EXAMPLE_ROW);
    worksheet.getColumn('amount').numFmt = '#,##0';

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async parse(fileName: string, file: Buffer): Promise<ImportedBill> {
    if (!fileName.toLowerCase().endsWith('.xlsx')) {
      throw new BadRequestException('Only .xlsx files are supported');
    }

    const workbook = new ExcelJS.Workbook();

    try {
      await workbook.xlsx.load(this.toArrayBuffer(file));
    } catch {
      throw new BadRequestException(
        'The uploaded file is not a valid Excel workbook',
      );
    }

    const worksheet = workbook.worksheets[0];

    if (!worksheet) {
      throw new BadRequestException(
        'The Excel file does not contain any worksheet',
      );
    }

    const headerRow = worksheet.getRow(1);
    const nameColumn = this.findColumn(
      headerRow,
      NAME_HEADERS,
      worksheet.columnCount,
    );
    const amountColumn = this.findColumn(
      headerRow,
      AMOUNT_HEADERS,
      worksheet.columnCount,
    );

    if (!nameColumn || !amountColumn) {
      throw new BadRequestException(
        `The Excel file must contain the columns "${NAME_HEADER}" and "${AMOUNT_HEADER}"`,
      );
    }

    const items: ImportedBillItem[] = [];
    let totalAmount = 0;

    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const rawName = row.getCell(nameColumn).value;
      const rawAmount = row.getCell(amountColumn).value;

      if (this.isEmpty(rawName) && this.isEmpty(rawAmount)) {
        continue;
      }

      if (items.length >= MAX_ITEMS) {
        throw new BadRequestException(
          `A bill can import at most ${MAX_ITEMS} items`,
        );
      }

      const name = this.parseName(rawName, rowNumber);
      const amount = this.parseAmount(rawAmount, rowNumber);

      if (totalAmount + amount > MAX_AMOUNT) {
        throw new BadRequestException(
          'Total bill amount exceeds the supported range',
        );
      }

      totalAmount += amount;
      items.push({ name, amount });
    }

    if (items.length === 0) {
      throw new BadRequestException(
        'The Excel file does not contain any bill item',
      );
    }

    return {
      name: this.buildBillName(fileName),
      items,
      totalAmount,
    };
  }

  private parseName(value: unknown, rowNumber: number): string {
    const name = this.toText(value);

    if (!name) {
      throw new BadRequestException(
        `Item name is required at row ${rowNumber}`,
      );
    }

    if (name.length > MAX_NAME_LENGTH) {
      throw new BadRequestException(
        `Item name at row ${rowNumber} must be at most ${MAX_NAME_LENGTH} characters`,
      );
    }

    return name;
  }

  private parseAmount(value: unknown, rowNumber: number): number {
    const raw = this.unwrapValue(value);

    let amount: number;

    if (typeof raw === 'number') {
      amount = raw;
    } else {
      const normalized = this.toText(raw).replace(/[\s.,]/g, '');

      if (!/^\d+$/.test(normalized)) {
        throw new BadRequestException(
          `Invalid amount at row ${rowNumber}: amount must be a positive integer`,
        );
      }

      amount = Number(normalized);
    }

    if (!Number.isInteger(amount) || amount < 1 || amount > MAX_AMOUNT) {
      throw new BadRequestException(
        `Invalid amount at row ${rowNumber}: amount must be an integer between 1 and ${MAX_AMOUNT}`,
      );
    }

    return amount;
  }

  private findColumn(
    row: ExcelJS.Row,
    headers: string[],
    columnCount: number,
  ): number | null {
    const wanted = headers.map((header) => this.normalize(header));

    for (let column = 1; column <= Math.max(columnCount, 1); column += 1) {
      const value = this.normalize(this.toText(row.getCell(column).value));

      if (value && wanted.includes(value)) {
        return column;
      }
    }

    return null;
  }

  private normalize(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  private buildBillName(fileName: string): string {
    const base = fileName
      .replace(/\.[^.]+$/, '')
      .trim()
      .slice(0, MAX_BILL_NAME_LENGTH);

    return base || 'Imported bill';
  }

  private toArrayBuffer(file: Buffer): ArrayBuffer {
    return Uint8Array.from(file).buffer;
  }

  private isEmpty(value: unknown): boolean {
    const raw = this.unwrapValue(value);

    return raw === null || raw === undefined || this.toText(raw) === '';
  }

  private unwrapValue(value: unknown): unknown {
    if (value !== null && typeof value === 'object' && 'result' in value) {
      return this.unwrapValue((value as { result: unknown }).result);
    }

    return value;
  }

  private toText(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'string') {
      return value.trim();
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;

      if (Array.isArray(record.richText)) {
        return (record.richText as { text?: string }[])
          .map((part) => part.text ?? '')
          .join('')
          .trim();
      }

      if (typeof record.text === 'string') {
        return record.text.trim();
      }

      if (record.result !== undefined) {
        return this.toText(record.result);
      }

      if (typeof record.hyperlink === 'string') {
        return record.hyperlink.trim();
      }
    }

    return String(value).trim();
  }
}
