import { Test, TestingModule } from '@nestjs/testing';

import type { AccessTokenPayload } from '../auth/strategies/access-token.strategy.js';
import { BillImportService } from './bill-import.service.js';
import { BillController } from './bill.controller.js';
import { BillService } from './bill.service.js';

describe('BillController', () => {
  const user: AccessTokenPayload = {
    sub: 'user-id',
    email: 'user@example.com',
  };
  const dto = {
    name: 'Dinner',
    payers: [{ memberId: 'membership-id', amount: 100000 }],
    items: [
      {
        name: 'Pizza',
        amount: 100000,
        shares: [{ memberId: 'membership-id', amount: 100000 }],
      },
    ],
  };
  let controller: BillController;
  let billService: {
    createBill: ReturnType<typeof vi.fn>;
    getGroupBills: ReturnType<typeof vi.fn>;
    getBillDetail: ReturnType<typeof vi.fn>;
    updateBill: ReturnType<typeof vi.fn>;
    deleteBill: ReturnType<typeof vi.fn>;
  };
  let billImportService: {
    buildTemplate: ReturnType<typeof vi.fn>;
    parse: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    billService = {
      createBill: vi.fn(),
      getGroupBills: vi.fn(),
      getBillDetail: vi.fn(),
      updateBill: vi.fn(),
      deleteBill: vi.fn(),
    };
    billImportService = {
      buildTemplate: vi.fn(),
      parse: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BillController],
      providers: [
        { provide: BillService, useValue: billService },
        { provide: BillImportService, useValue: billImportService },
      ],
    }).compile();

    controller = module.get(BillController);
  });

  it('creates a bill for the authenticated user and route group', async () => {
    const result = { id: 'bill-id', ...dto };
    billService.createBill.mockResolvedValue(result);

    await expect(controller.createBill('group-id', dto, user)).resolves.toEqual(
      result,
    );
    expect(billService.createBill).toHaveBeenCalledWith(
      user.sub,
      'group-id',
      dto,
    );
  });

  it('passes update identity and payload to the service', async () => {
    billService.updateBill.mockResolvedValue({ id: 'bill-id', name: 'Lunch' });

    await controller.updateBill('group-id', 'bill-id', { name: 'Lunch' }, user);

    expect(billService.updateBill).toHaveBeenCalledWith(
      user.sub,
      'group-id',
      'bill-id',
      { name: 'Lunch' },
    );
  });

  it('deletes through the service without returning a response body', async () => {
    billService.deleteBill.mockResolvedValue(undefined);

    await expect(
      controller.deleteBill('group-id', 'bill-id', user),
    ).resolves.toBeUndefined();
    expect(billService.deleteBill).toHaveBeenCalledWith(
      user.sub,
      'group-id',
      'bill-id',
    );
  });

  it('parses an uploaded excel file through the import service', async () => {
    const draft = {
      name: 'July',
      items: [{ name: 'Pizza', amount: 150000 }],
      totalAmount: 150000,
    };
    const file = {
      originalname: 'July.xlsx',
      buffer: Buffer.from('excel'),
    } as Express.Multer.File;
    billImportService.parse.mockResolvedValue(draft);

    await expect(controller.importBill(file)).resolves.toEqual(draft);
    expect(billImportService.parse).toHaveBeenCalledWith(
      'July.xlsx',
      file.buffer,
    );
  });

  it('rejects a missing upload file', () => {
    expect(() => controller.importBill(undefined)).toThrow(
      'Excel file is required',
    );
  });

  it('streams the excel template as an attachment', async () => {
    const template = Buffer.from('template');
    const response = {
      set: vi.fn(),
      end: vi.fn(),
    };
    billImportService.buildTemplate.mockResolvedValue(template);

    await controller.downloadImportTemplate(
      'group-id',
      response as unknown as import('express').Response,
    );

    expect(billImportService.buildTemplate).toHaveBeenCalledOnce();
    expect(response.set).toHaveBeenCalledWith(
      expect.objectContaining({
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    );
    expect(response.end).toHaveBeenCalledWith(template);
  });
});
