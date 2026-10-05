import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { MemoryStore } from '../domain/memory.store';
import { Role } from '../domain/types';

@Injectable()
export class ExportService {
  constructor(private readonly store: MemoryStore) {}

  private assertAdmin(role: Role, allowSales = false) { if (role !== 'admin' && !(allowSales && role === 'sales')) throw new ForbiddenException('无数据导出权限'); }

  private latestConsent(userId: string) {
    const at = (item: any) => Math.max(...['grantedAt', 'revokedAt', 'createdAt'].map((key) => Date.parse(String(item[key] || ''))).filter(Number.isFinite), 0);
    return this.store.state.healthConsents.map((item: any, index) => ({ item, index })).filter(({ item }) => item.userId === userId)
      .sort((a, b) => at(b.item) - at(a.item) || b.index - a.index)
      .map(({ item }) => item)[0];
  }

  private scopedCustomers(role: Role, actorId: string) {
    if (role === 'admin') return this.store.state.customers;
    const owned = new Set([String(actorId), ...this.store.state.promoters.filter((item: any) => String(item.userId || '') === String(actorId)).map((item: any) => String(item.id))]);
    return this.store.state.customers.filter((customer: any) => owned.has(String(customer.promoter || customer.promoterId || '')) || this.store.state.promoterRelations.some((relation: any) => relation.active !== false && owned.has(String(relation.promoterId)) && String(relation.customerId) === String(customer.id)));
  }

  async customers(role: Role, query: any = {}, actorId = 'admin-export') {
    this.assertAdmin(role);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('客户档案');
    sheet.columns = [{ header: '客户', key: 'name', width: 18 }, { header: '推广人', key: 'promoter', width: 18 }, { header: '就诊人', key: 'patient', width: 18 }, { header: '过敏史', key: 'allergies', width: 24 }, { header: '既往病史', key: 'history', width: 30 }, { header: '处方记录', key: 'prescriptions', width: 30 }, { header: '购买记录', key: 'orders', width: 32 }, { header: '累计金额', key: 'amount', width: 14 }, { header: '标签', key: 'tags', width: 28 }, { header: '健康授权', key: 'consent', width: 14 }];
    const keyword = String(query.keyword || query.q || '').trim().toLowerCase();
    const customers = this.scopedCustomers(role, actorId);
    customers.filter((customer: any) => !keyword || `${customer.id} ${customer.name} ${(customer.tags || []).join(' ')}`.toLowerCase().includes(keyword)).forEach((customer: any) => {
      const patients = this.store.state.patients.filter((item: any) => item.userId === customer.id);
      const prescriptions = this.store.state.prescriptions.filter((item: any) => item.userId === customer.id);
      const orders = this.store.state.orders.filter((item: any) => item.userId === customer.id);
      const consent = this.latestConsent(customer.id)?.granted === true && !this.latestConsent(customer.id)?.revokedAt;
      sheet.addRow({ name: customer.name, promoter: customer.promoter, patient: patients.map((item: any) => `${item.name}(${item.relation || ''})`).join('、'), allergies: consent ? patients.map((item: any) => item.allergies || '').filter(Boolean).join('；') : '', history: consent ? patients.map((item: any) => item.history || '').filter(Boolean).join('；') : '', prescriptions: consent ? prescriptions.map((item: any) => `${item.itemName || '处方'}:${item.status || item.statusText || ''}`).join('、') : '', orders: consent ? (orders.map((item: any) => `${item.orderNo}:${item.statusText || item.status}`).join('、') || customer.lastOrder || '') : '', amount: customer.amountFen !== undefined ? Number(customer.amountFen) / 100 : customer.amount, tags: Array.isArray(customer.tags) ? customer.tags.join('、') : '', consent: consent ? '已授权' : '未授权' });
    });
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F766E' } };
    this.store.addAudit(actorId, role, 'customer.export.xlsx', 'customer', undefined, { count: customers.length, masked: true, scoped: role === 'sales', keyword: query.keyword });
    return workbook.xlsx.writeBuffer();
  }

  async sales(role: Role, query: any = {}, actorId = 'admin-export') {
    this.assertAdmin(role);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('奖励与提现');
    sheet.columns = [{ header: '类型', key: 'type', width: 14 }, { header: '推广人/用户', key: 'userId', width: 22 }, { header: '来源', key: 'source', width: 30 }, { header: '金额', key: 'amount', width: 14 }, { header: '状态', key: 'status', width: 16 }, { header: '时间', key: 'date', width: 24 }];
    const from = query.from ? Date.parse(`${query.from}T00:00:00.000Z`) : undefined; const to = query.to ? Date.parse(`${query.to}T23:59:59.999Z`) : undefined; if ((from !== undefined && !Number.isFinite(from)) || (to !== undefined && !Number.isFinite(to)) || (from !== undefined && to !== undefined && from > to)) throw new BadRequestException('导出日期格式不合法');
    const inRange = (value: unknown) => { const time = Date.parse(String(value || '')); return (from === undefined || time >= from) && (to === undefined || time <= to); };
    const ownedPromoterIds = role === 'admin' ? undefined : new Set([String(actorId), ...this.store.state.promoters.filter((item: any) => String(item.userId || '') === String(actorId)).map((item: any) => String(item.id))]);
    this.store.state.commissions.filter((item: any) => (!ownedPromoterIds || ownedPromoterIds.has(String(item.promoterId))) && (!query.promoterId || (role === 'admin' && item.promoterId === query.promoterId)) && inRange(item.date || item.createdAt)).forEach((item: any) => sheet.addRow({ type: '奖励', userId: item.promoterId, source: item.source, amount: item.amountFen !== undefined ? Number(item.amountFen) / 100 : item.amount, status: item.statusText || item.status, date: item.date || item.createdAt }));
    this.store.state.withdrawals.filter((item: any) => (!ownedPromoterIds || ownedPromoterIds.has(String(item.userId || item.promoterId))) && (!query.promoterId || (role === 'admin' && (item.userId || item.promoterId) === query.promoterId)) && inRange(item.createdAt)).forEach((item: any) => sheet.addRow({ type: '提现', userId: item.userId || item.promoterId, source: '奖励余额提现', amount: item.amountFen !== undefined ? Number(item.amountFen) / 100 : item.amount, status: item.statusText || item.status, date: item.createdAt }));
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F766E' } };
    this.store.addAudit(actorId, role, 'sales.export.xlsx', 'sales', undefined, { rewards: this.store.state.commissions.length, withdrawals: this.store.state.withdrawals.length, from: query.from, to: query.to });
    return workbook.xlsx.writeBuffer();
  }

  async reports(role: Role, query: any = {}, actorId = 'admin-export') {
    this.assertAdmin(role);
    const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('经营报表');
    sheet.columns = [{ header: '日期', key: 'date', width: 16 }, { header: '订单数', key: 'orders', width: 12 }, { header: '销售额(分)', key: 'salesFen', width: 16 }, { header: '销量', key: 'quantity', width: 12 }, { header: '奖励(分)', key: 'commissionFen', width: 16 }];
    const from = query.from ? Date.parse(`${query.from}T00:00:00.000Z`) : Date.now() - 30 * 86400000; const to = query.to ? Date.parse(`${query.to}T23:59:59.999Z`) : Date.now(); if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) throw new BadRequestException('报表日期格式不合法'); const daily = new Map<string, any>();
    const ownedPromoterIds = role === 'admin' ? undefined : new Set([String(actorId), ...this.store.state.promoters.filter((item: any) => String(item.userId || '') === String(actorId)).map((item: any) => String(item.id))]);
    const filteredOrders: any[] = this.store.state.orders.filter((order: any) => { const time = Date.parse(order.createdAt); const category = !query.category || query.category === 'all' || order.items.some((line: any) => line.category === query.category); const product = !query.productId || order.items.some((line: any) => line.productId === query.productId); const promoter = (!query.promoterId || (role === 'admin' && order.promoterId === query.promoterId)) && (!ownedPromoterIds || ownedPromoterIds.has(String(order.promoterId))); return time >= from && time <= to && category && product && promoter && ['paid', 'shipped', 'completed', 'refunding'].includes(order.status); });
    const filteredOrderIds = new Set(filteredOrders.map((order: any) => String(order.id)));
    filteredOrders.forEach((order: any) => { const date = String(order.createdAt).slice(0, 10); const row = daily.get(date) || { date, orders: 0, salesFen: 0, quantity: 0, commissionFen: 0 }; row.orders += 1; row.salesFen += Number(order.totalFen ?? order.totalAmountFen ?? Math.round(Number(order.totalAmount || 0) * 100)); row.quantity += order.items.reduce((sum: number, line: any) => sum + Number(line.quantity || 0), 0); daily.set(date, row); });
    this.store.state.commissions.filter((commission: any) => commission.orderId && filteredOrderIds.has(String(commission.orderId))).forEach((commission: any) => { const date = String(commission.date || commission.createdAt || '').slice(0, 10); const row = daily.get(date); if (row) row.commissionFen += Number(commission.amountFen ?? Math.round(Number(commission.amount || 0) * 100)); });
    Array.from(daily.values()).sort((a, b) => a.date.localeCompare(b.date)).forEach((row) => sheet.addRow(row)); sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }; sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F766E' } };
    this.store.addAudit(actorId, role, 'reports.export.xlsx', 'report', undefined, { from: query.from, to: query.to, category: query.category, productId: query.productId, promoterId: query.promoterId }); return workbook.xlsx.writeBuffer();
  }
}
