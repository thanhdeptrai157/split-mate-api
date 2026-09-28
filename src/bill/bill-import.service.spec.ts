import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';

import { BillImportService } from './bill-import.service.js';

const buildWorkbook = async (
  rows: (string | number | null)[][],
  headers: (string | number | null)[] = ['Tên món', 'Giá tiền'],
): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Sheet1');

  worksheet.addRow(headers);
  for (const row of rows) {
    worksheet.addRow(row);
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
};

describe('BillImportService', () => {
  let service: BillImportService;

  beforeEach(() => {
    service = new BillImportService();
  });

  it('builds a downloadable xlsx template', async () => {
    const template = await service.buildTemplate();

    expect(Buffer.isBuffer(template)).toBe(true);
    expect(template.subarray(0, 2).toString()).toBe('PK');

    await expect(service.parse('template.xlsx', template)).resolves.toEqual({
      name: 'template',
      items: [{ name: 'Pizza', amount: 150000 }],
      totalAmount: 150000,
    });
  });

  it('parses items and derives the bill name from the file name', async () => {
    const file = await buildWorkbook([
      ['Pizza', 150000],
      ['Coke', 30000],
    ]);

    await expect(service.parse('Friday dinner.xlsx', file)).resolves.toEqual({
      name: 'Friday dinner',
      items: [
        { name: 'Pizza', amount: 150000 },
        { name: 'Coke', amount: 30000 },
      ],
      totalAmount: 180000,
    });
  });

  it('ignores empty rows and normalizes formatted amounts', async () => {
    const file = await buildWorkbook([
      ['Pizza', '150,000'],
      [null, null],
      ['Coke', '30.000'],
      ['', ''],
    ]);

    await expect(service.parse('Bill.xlsx', file)).resolves.toMatchObject({
      items: [
        { name: 'Pizza', amount: 150000 },
        { name: 'Coke', amount: 30000 },
      ],
      totalAmount: 180000,
    });
  });

  it('accepts headers without accents and extra columns', async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sheet1');

    worksheet.addRow(['Ghi chú', 'Ten mon', 'Gia tien']);
    worksheet.addRow(['lunch', 'Pho', 45000]);
    const file = Buffer.from(await workbook.xlsx.writeBuffer());

    await expect(service.parse('Meals.xlsx', file)).resolves.toMatchObject({
      items: [{ name: 'Pho', amount: 45000 }],
      totalAmount: 45000,
    });
  });

  it('rejects unsupported file extensions', async () => {
    const file = await buildWorkbook([['Pizza', 150000]]);

    await expect(service.parse('Bill.xls', file)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects a workbook without the expected columns', async () => {
    const file = await buildWorkbook([['Pizza', 150000]], ['A', 'B']);

    await expect(service.parse('Bill.xlsx', file)).rejects.toThrow(
      'The Excel file must contain the columns',
    );
  });

  it('rejects a workbook without any item', async () => {
    const file = await buildWorkbook([]);

    await expect(service.parse('Bill.xlsx', file)).rejects.toThrow(
      'does not contain any bill item',
    );
  });

  it('rejects an item with a missing name', async () => {
    const file = await buildWorkbook([[null, 150000]]);

    await expect(service.parse('Bill.xlsx', file)).rejects.toThrow(
      'Item name is required at row 2',
    );
  });

  it('rejects an item with an invalid amount', async () => {
    const file = await buildWorkbook([['Pizza', 'abc']]);

    await expect(service.parse('Bill.xlsx', file)).rejects.toThrow(
      'Invalid amount at row 2',
    );
  });

  it('rejects an amount above the safe integer range', async () => {
    const file = await buildWorkbook([['Pizza', Number.MAX_SAFE_INTEGER + 1]]);

    await expect(service.parse('Bill.xlsx', file)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects a file that is not a valid workbook', async () => {
    await expect(
      service.parse('Bill.xlsx', Buffer.from('not an excel file')),
    ).rejects.toThrow('not a valid Excel workbook');
  });
});
