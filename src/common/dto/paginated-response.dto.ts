export class PaginatedMetaDto {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export class PaginatedResponseDto<T> {
  items: T[];
  meta: PaginatedMetaDto;

  constructor(items: T[], page: number, limit: number, total: number) {
    const totalPages = Math.ceil(total / limit);

    this.items = items;
    this.meta = {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    };
  }
}
