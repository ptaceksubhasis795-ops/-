import { Controller, Get, Headers, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { ExportService } from './export.service';
import { Role } from '../domain/types';
import { AuthService } from '../security/auth.service';

@Controller('v1/admin')
export class ExportController {
  constructor(private readonly exports: ExportService, private readonly auth: AuthService) {}
  private actor(headers: Record<string, string>): { id: string; role: Role } { const token = this.auth.verify(headers.authorization?.replace(/^Bearer\s+/i, '')); return token ? { id: token.id, role: token.role as Role } : { id: headers['x-user-id'] || 'admin-export', role: (headers['x-role'] || 'consumer') as Role }; }

  @Get('customers/export.xlsx') async customers(@Query() query: any, @Headers() headers: Record<string, string>, @Res() response: Response) { const actor = this.actor(headers); const buffer = await this.exports.customers(actor.role, query, actor.id); response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); response.setHeader('Content-Disposition', 'attachment; filename="customers.xlsx"'); response.send(buffer); }
  @Get('sales/export.xlsx') async sales(@Query() query: any, @Headers() headers: Record<string, string>, @Res() response: Response) { const actor = this.actor(headers); const buffer = await this.exports.sales(actor.role, query, actor.id); response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); response.setHeader('Content-Disposition', 'attachment; filename="sales.xlsx"'); response.send(buffer); }
  @Get('reports/export.xlsx') async reports(@Query() query: any, @Headers() headers: Record<string, string>, @Res() response: Response) { const actor = this.actor(headers); const buffer = await this.exports.reports(actor.role, query, actor.id); response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); response.setHeader('Content-Disposition', 'attachment; filename="reports.xlsx"'); response.send(buffer); }
}
