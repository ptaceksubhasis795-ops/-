import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { OperationsService } from './domain/operations.service';
import { Role } from './domain/types';
import { AuthService } from './security/auth.service';

@Controller('v1')
export class OperationsController {
  constructor(private readonly operations: OperationsService, private readonly auth: AuthService) {}
  private actor(headers: Record<string, string>, fallbackRole: Role = 'consumer') {
    const tokenActor = this.auth.verify(headers.authorization?.replace(/^Bearer\s+/i, ''));
    if (tokenActor) return tokenActor as { id: string; role: Role };
    if (process.env.NODE_ENV === 'production') return { id: 'anonymous', role: 'consumer' as Role };
    return { id: headers['x-user-id'] || 'u-demo', role: (headers['x-role'] || fallbackRole) as Role };
  }

  @Get('me') me(@Headers() headers: Record<string, string>) { return { data: this.operations.profile(this.actor(headers)) }; }
  @Post('me') saveMe(@Body() input: any, @Headers() headers: Record<string, string>) { return { data: this.operations.saveProfile(input, this.actor(headers)) }; }
  @Post('consents/health') healthConsent(@Body() input: any, @Headers() headers: Record<string, string>) { return { data: this.operations.saveHealthConsent(input, this.actor(headers)) }; }
  @Post('consents/health/revoke') revokeHealthConsent(@Body() input: any, @Headers() headers: Record<string, string>) { return { data: this.operations.saveHealthConsent({ ...input, granted: false }, this.actor(headers)) }; }
  @Get('patients') patients(@Headers() headers: Record<string, string>) { return { data: this.operations.patients(this.actor(headers)) }; }
  @Post('patients') savePatient(@Body() input: any, @Headers() headers: Record<string, string>) { return { data: this.operations.savePatient(input, this.actor(headers)) }; }
  @Post('patients/:id/delete') deletePatient(@Param('id') id: string, @Headers() headers: Record<string, string>) { return { data: this.operations.deletePatient(id, this.actor(headers)) }; }
  @Get('addresses') addresses(@Headers() headers: Record<string, string>) { return { data: this.operations.addresses(this.actor(headers)) }; }
  @Post('addresses') saveAddress(@Body() input: any, @Headers() headers: Record<string, string>) { return { data: this.operations.saveAddress(input, this.actor(headers)) }; }
  @Post('addresses/:id/delete') deleteAddress(@Param('id') id: string, @Headers() headers: Record<string, string>) { return { data: this.operations.deleteAddress(id, this.actor(headers)) }; }
  @Get('members/application') memberApplication(@Headers() headers: Record<string, string>) { const actor = this.actor(headers); return { data: this.operations.memberApplication(actor) }; }
  @Get('members/promotion-application') promotionApplication(@Headers() headers: Record<string, string>) { return { data: this.operations.promotionApplication(this.actor(headers)) }; }
  @Post('members/promotion-application') async applyPromotion(@Headers() headers: Record<string, string>) { return { data: await this.operations.applyPromotion(this.actor(headers, 'member')) }; }
  @Get('sales/eligibility') promotionEligibility(@Headers() headers: Record<string, string>) { return { data: this.operations.promotionEligibility(this.actor(headers, 'member')) }; }
  @Get('sales/network') salesNetwork(@Headers() headers: Record<string, string>) { return { data: this.operations.network(this.actor(headers, 'member')) }; }
  @Get('withdrawals') myWithdrawals(@Headers() headers: Record<string, string>) { return { data: this.operations.myWithdrawals(this.actor(headers, 'member')) }; }
  @Post('prescriptions/consultations') consultation(@Body() input: any, @Headers() headers: Record<string, string>) { return { data: this.operations.consultation(input, this.actor(headers)) }; }
  @Post('aftersales') aftersale(@Body() input: any, @Headers() headers: Record<string, string>) { return { data: this.operations.createAftersale(input, this.actor(headers)) }; }
  @Get('aftersales') myAftersales(@Query() query: any, @Headers() headers: Record<string, string>) { return { data: this.operations.myAftersales(this.actor(headers), query) }; }
  @Post('invoices') invoice(@Body() input: any, @Headers() headers: Record<string, string>) { return { data: this.operations.createInvoice(input, this.actor(headers)) }; }
  @Get('invoices') myInvoices(@Query() query: any, @Headers() headers: Record<string, string>) { return { data: this.operations.myInvoices(this.actor(headers), query) }; }
  @Post('admin/invoices/:id/file') uploadInvoice(@Param('id') id: string, @Body() input: any, @Headers() headers: Record<string, string>) { return { data: this.operations.uploadInvoice(id, input, this.actor(headers, 'admin')) }; }
  @Post('admin/rewards/settle') settle(@Headers() headers: Record<string, string>) { return { data: this.operations.settleRewards(this.actor(headers, 'admin')) }; }
  @Get('admin/customers/export') exportCustomers(@Headers() headers: Record<string, string>) { return { data: this.operations.exportCustomers(this.actor(headers, 'admin')) }; }
  @Get('admin/customers') customers(@Query() query: any, @Headers() headers: Record<string, string>) { return { data: this.operations.customers(query, this.actor(headers, 'admin')) }; }
  @Post('admin/customers') saveCustomer(@Body() input: any, @Headers() headers: Record<string, string>) { return { data: this.operations.createCustomer(input, this.actor(headers, 'admin')) }; }
  @Get('admin/health-service/export') healthServiceExport(@Headers() headers: Record<string, string>) { return { data: this.operations.healthServiceExport(this.actor(headers, 'admin')) }; }
  @Post('admin/customers/:id/health-service/push') pushHealthService(@Param('id') id: string, @Headers() headers: Record<string, string>) { return { data: this.operations.queueHealthServicePush(id, this.actor(headers, 'admin')) }; }
  @Get('admin/articles') adminArticles(@Query() query: any, @Headers() headers: Record<string, string>) { return { data: this.operations.articles(this.actor(headers, 'admin'), query) }; }
  @Get('admin/articles/:id') adminArticleDetail(@Param('id') id: string, @Headers() headers: Record<string, string>) { return { data: this.operations.articleDetail(id, this.actor(headers, 'admin')) }; }
  @Get('admin/member-applications') memberApplications(@Query() query: any, @Headers() headers: Record<string, string>) { return { data: this.operations.memberApplications(this.actor(headers, 'admin'), query) }; }
  @Get('admin/member-applications/:id') memberApplicationDetail(@Param('id') id: string, @Headers() headers: Record<string, string>) { return { data: this.operations.memberApplicationDetail(id, this.actor(headers, 'admin')) }; }
  @Get('admin/promotion-applications') promotionApplications(@Query() query: any, @Headers() headers: Record<string, string>) { return { data: this.operations.promotionApplications(this.actor(headers, 'admin'), query) }; }
  @Get('admin/promotion-applications/:id') promotionApplicationDetail(@Param('id') id: string, @Headers() headers: Record<string, string>) { return { data: this.operations.promotionApplicationDetail(id, this.actor(headers, 'admin')) }; }
  @Post('admin/promotion-applications/:id/review') async reviewPromotionApplication(@Param('id') id: string, @Body() input: any, @Headers() headers: Record<string, string>) { return { data: await this.operations.reviewPromotionApplication(id, input, this.actor(headers, 'admin')) }; }
  @Get('admin/analytics') analytics(@Query() query: any, @Headers() headers: Record<string, string>) { return { data: this.operations.analytics(query, this.actor(headers, 'admin')) }; }
  @Get('admin/customers/:id/profile') customerProfile(@Param('id') id: string, @Query() query: any, @Headers() headers: Record<string, string>) { return { data: this.operations.customerProfile(id, this.actor(headers, 'admin'), query) }; }
  @Get('admin/settings') settings(@Headers() headers: Record<string, string>) { return { data: this.operations.settings(this.actor(headers, 'admin')) }; }
  @Get('admin/staff') staff(@Headers() headers: Record<string, string>) { return { data: this.operations.staffAccounts(this.actor(headers, 'admin')) }; }
  @Post('admin/settings') saveSettings(@Body() input: any, @Headers() headers: Record<string, string>) { return { data: this.operations.saveSettings(input, this.actor(headers, 'admin')) }; }
  @Get('admin/integrations/outbox') outbox(@Headers() headers: Record<string, string>) { return { data: this.operations.outbox(this.actor(headers, 'admin')) }; }
  @Get('admin/integrations/status') integrationStatus(@Headers() headers: Record<string, string>) { return { data: this.operations.integrationStatus(this.actor(headers, 'admin')) }; }
  @Get('admin/integrations/manual-tasks') manualTasks(@Query() query: any, @Headers() headers: Record<string, string>) { return { data: this.operations.manualTasks(this.actor(headers, 'admin'), query) }; }
  @Post('admin/integrations/manual-task') manualTask(@Body() input: any, @Headers() headers: Record<string, string>) { return { data: this.operations.queueManualTask(input, this.actor(headers, 'admin')) }; }
  @Post('admin/integrations/manual-tasks/:id/process') processManualTask(@Param('id') id: string, @Body() input: any, @Headers() headers: Record<string, string>) { return { data: this.operations.processManualTask(id, input, this.actor(headers, 'admin')) }; }
  @Post('admin/integrations/manual-tasks/:id/retry') retryManualTask(@Param('id') id: string, @Headers() headers: Record<string, string>) { return { data: this.operations.retryManualTask(id, this.actor(headers, 'admin')) }; }
  @Post('admin/members/:id/review') async reviewMember(@Param('id') id: string, @Body() input: any, @Headers() headers: Record<string, string>) { return { data: await this.operations.reviewMember(id, input, this.actor(headers, 'admin')) }; }
  @Post('admin/withdrawals/:id/review') reviewWithdrawal(@Param('id') id: string, @Body() input: any, @Headers() headers: Record<string, string>) { return { data: this.operations.reviewWithdrawal(id, input, this.actor(headers, 'admin')) }; }
  @Get('admin/aftersales') aftersales(@Query() query: any, @Headers() headers: Record<string, string>) { return { data: this.operations.aftersales(this.actor(headers, 'admin'), query) }; }
  @Get('admin/aftersales/:id') aftersaleDetail(@Param('id') id: string, @Headers() headers: Record<string, string>) { return { data: this.operations.aftersaleDetail(id, this.actor(headers, 'admin')) }; }
  @Post('admin/aftersales/:id/review') reviewAftersale(@Param('id') id: string, @Body() input: any, @Headers() headers: Record<string, string>) { return { data: this.operations.reviewAftersale(id, input, this.actor(headers, 'admin')) }; }
  @Get('admin/invoices') invoices(@Query() query: any, @Headers() headers: Record<string, string>) { return { data: this.operations.invoices(this.actor(headers, 'admin'), query) }; }
  @Post('admin/invoices/:id/review') reviewInvoice(@Param('id') id: string, @Body() input: any, @Headers() headers: Record<string, string>) { return { data: this.operations.reviewInvoice(id, input, this.actor(headers, 'admin')) }; }
  @Get('admin/withdrawals') withdrawals(@Query() query: any, @Headers() headers: Record<string, string>) { return { data: this.operations.withdrawals(this.actor(headers, 'admin'), query) }; }
  @Post('admin/withdrawals/:id/transfer') transferWithdrawal(@Param('id') id: string, @Body() input: any, @Headers() headers: Record<string, string>) { return { data: this.operations.transferWithdrawal(id, input, this.actor(headers, 'admin')) }; }
  @Post('admin/withdrawals/:id/confirm') confirmWithdrawal(@Param('id') id: string, @Body() input: any, @Headers() headers: Record<string, string>) { return { data: this.operations.confirmWithdrawal(id, input, this.actor(headers, 'admin')) }; }
  @Get('admin/commissions') commissions(@Query() query: any, @Headers() headers: Record<string, string>) { return { data: this.operations.commissions(this.actor(headers, 'admin'), query) }; }
  @Get('admin/rewards/settlements') settlements(@Query() query: any, @Headers() headers: Record<string, string>) { return { data: this.operations.settlements(this.actor(headers, 'admin'), query) }; }
  @Get('admin/commission-rules') commissionRules(@Headers() headers: Record<string, string>) { return { data: this.operations.commissionRules(this.actor(headers, 'admin')) }; }
  @Post('admin/commission-rules') async saveCommissionRule(@Body() input: any, @Headers() headers: Record<string, string>) { return { data: await this.operations.saveCommissionRule(input, this.actor(headers, 'admin')) }; }
  @Get('admin/reward-rule-sets') rewardRuleSets(@Query() query: any, @Headers() headers: Record<string, string>) { return { data: this.operations.rewardRuleSets(this.actor(headers, 'admin'), query) }; }
  @Get('admin/reward-rule-sets/:productId') rewardRuleSet(@Param('productId') productId: string, @Headers() headers: Record<string, string>) { return { data: this.operations.rewardRuleSet(productId, this.actor(headers, 'admin')) }; }
  @Post('admin/reward-rule-sets') async saveRewardRuleSet(@Body() input: any, @Headers() headers: Record<string, string>) { return { data: await this.operations.saveRewardRuleSet(input, this.actor(headers, 'admin')) }; }
  @Post('admin/products') createProduct(@Body() input: any, @Headers() headers: Record<string, string>) { return { data: this.operations.createProduct(input, this.actor(headers, 'admin')) }; }
  @Get('admin/products') products(@Query() query: any, @Headers() headers: Record<string, string>) { return { data: this.operations.products(query, this.actor(headers, 'admin')) }; }
  @Get('admin/products/:id') productDetail(@Param('id') id: string, @Headers() headers: Record<string, string>) { return { data: this.operations.productDetail(id, this.actor(headers, 'admin')) }; }
  @Post('admin/products/:id/delete') deleteProduct(@Param('id') id: string, @Headers() headers: Record<string, string>) { return { data: this.operations.deleteProduct(id, this.actor(headers, 'admin')) }; }
  @Get('admin/products/:id/skus') skus(@Param('id') id: string, @Headers() headers: Record<string, string>) { return { data: this.operations.skus(id, this.actor(headers, 'admin')) }; }
  @Post('admin/products/:id/skus') saveSku(@Param('id') id: string, @Body() input: any, @Headers() headers: Record<string, string>) { return { data: this.operations.saveSku(id, input, this.actor(headers, 'admin')) }; }
  @Post('admin/products/:id/skus/:skuId/delete') deleteSku(@Param('id') id: string, @Param('skuId') skuId: string, @Headers() headers: Record<string, string>) { return { data: this.operations.deleteSku(id, skuId, this.actor(headers, 'admin')) }; }
  @Get('admin/inventory/batches') inventoryBatches(@Query() query: any, @Headers() headers: Record<string, string>) { return { data: this.operations.inventoryBatches(query, this.actor(headers, 'admin')) }; }
  @Post('admin/inventory/batches') saveInventoryBatch(@Body() input: any, @Headers() headers: Record<string, string>) { return { data: this.operations.saveInventoryBatch(input, this.actor(headers, 'admin')) }; }
  @Post('admin/inventory/batches/:id/adjust') adjustInventoryBatch(@Param('id') id: string, @Body() input: any, @Headers() headers: Record<string, string>) { return { data: this.operations.adjustInventoryBatch(id, input, this.actor(headers, 'admin')) }; }
  @Post('admin/inventory/batches/:id/delete') deleteInventoryBatch(@Param('id') id: string, @Headers() headers: Record<string, string>) { return { data: this.operations.deleteInventoryBatch(id, this.actor(headers, 'admin')) }; }
  @Post('admin/products/:id/inventory') updateProduct(@Param('id') id: string, @Body() input: any, @Headers() headers: Record<string, string>) { return { data: this.operations.updateProductStock(id, input, this.actor(headers, 'admin')) }; }
  @Post('admin/prescriptions/manual') manualPrescription(@Body() input: any, @Headers() headers: Record<string, string>) { return { data: this.operations.manualPrescription(input, this.actor(headers, 'admin')) }; }
  @Get('admin/promoters') promoters(@Query() query: any, @Headers() headers: Record<string, string>) { return { data: this.operations.promoters(this.actor(headers, 'admin'), query) }; }
  @Post('admin/promoters') async createPromoter(@Body() input: any, @Headers() headers: Record<string, string>) { return { data: await this.operations.createPromoter(input, this.actor(headers, 'admin')) }; }
  @Post('admin/promoters/batch-delete') async batchDeletePromoters(@Body() input: any, @Headers() headers: Record<string, string>) { return { data: await this.operations.batchDeletePromoters(input, this.actor(headers, 'admin')) }; }
  @Post('admin/promoters/reconcile') reconcilePromoters(@Headers() headers: Record<string, string>) { return { data: this.operations.reconcilePromoters(this.actor(headers, 'admin')) }; }
  @Post('admin/promoters/:id') async updatePromoter(@Param('id') id: string, @Body() input: any, @Headers() headers: Record<string, string>) { return { data: await this.operations.updatePromoter(id, input, this.actor(headers, 'admin')) }; }
  @Post('admin/promoters/:id/delete') async deletePromoter(@Param('id') id: string, @Body() input: any, @Headers() headers: Record<string, string>) { return { data: await this.operations.deletePromoter(id, input, this.actor(headers, 'admin')) }; }
  @Get('admin/promoters/:id/history') promoterHistory(@Param('id') id: string, @Query() query: any, @Headers() headers: Record<string, string>) { return { data: this.operations.promoterHistory(id, this.actor(headers, 'admin'), query) }; }
  @Get('admin/promoter-archives') promoterArchives(@Query() query: any, @Headers() headers: Record<string, string>) { return { data: this.operations.promoterArchives(this.actor(headers, 'admin'), query) }; }
  @Get('sales/promo-assets') promoAssets(@Headers() headers: Record<string, string>) { return { data: this.operations.promoAssets(this.actor(headers, 'member')) }; }
  @Get('admin/promoter-relations') relationships(@Query() query: any, @Headers() headers: Record<string, string>) { return { data: this.operations.relationships(this.actor(headers, 'admin'), query) }; }
  @Post('admin/promoter-relations') assignRelationship(@Body() input: any, @Headers() headers: Record<string, string>) { return { data: this.operations.assignRelationship(input, this.actor(headers, 'admin')) }; }
  @Get('admin/sales/relations/sales') salesRelationList(@Query() query: any, @Headers() headers: Record<string, string>) { return { data: this.operations.salesRelationList(this.actor(headers, 'admin'), query) }; }
  @Get('admin/sales/relations/:salesId/tree') salesRelationTree(@Param('salesId') salesId: string, @Query() query: any, @Headers() headers: Record<string, string>) { return { data: this.operations.salesRelationTree(salesId, this.actor(headers, 'admin'), query) }; }
  @Post('admin/sales/relations/batch-assign') async batchAssignRelations(@Body() input: any, @Headers() headers: Record<string, string>) { return { data: await this.operations.batchAssignRelations(input, this.actor(headers, 'admin')) }; }
  @Post('admin/sales/relations/unbind') async unbindRelation(@Body() input: any, @Headers() headers: Record<string, string>) { return { data: await this.operations.unbindRelation(input, this.actor(headers, 'admin')) }; }
  @Get('admin/sales/tree') salesTree(@Headers() headers: Record<string, string>) { return { data: this.operations.relationTree(this.actor(headers, 'admin')) }; }
  @Get('admin/sales/performance') salesPerformance(@Query() query: any, @Headers() headers: Record<string, string>) { return { data: this.operations.salesPerformance(query, this.actor(headers, 'admin')) }; }
  @Get('admin/sales/rewards') salesRewards(@Query() query: any, @Headers() headers: Record<string, string>) { return { data: this.operations.rewardLedger(query, this.actor(headers, 'admin')) }; }
  @Get('admin/sales/order-drafts') agentOrderDrafts(@Query() query: any, @Headers() headers: Record<string, string>) { return { data: this.operations.agentOrderDrafts(query, this.actor(headers, 'admin')) }; }
  @Get('sales/summary') salesSummary(@Headers() headers: Record<string, string>) { return { data: this.operations.salesSummary(this.actor(headers, 'member')) }; }
  @Get('sales/performance') mySalesPerformance(@Query() query: any, @Headers() headers: Record<string, string>) { return { data: this.operations.salesPerformance(query, this.actor(headers, 'member')) }; }
  @Get('sales/rewards') mySalesRewards(@Query() query: any, @Headers() headers: Record<string, string>) { return { data: this.operations.rewardLedger(query, this.actor(headers, 'member')) }; }
  @Post('sales/order-drafts') createAgentOrderDraft(@Body() input: any, @Headers() headers: Record<string, string>) { return { data: this.operations.createAgentOrderDraft(input, this.actor(headers, 'sales')) }; }
  @Get('order-drafts/:token') agentOrderDraft(@Param('token') token: string, @Headers() headers: Record<string, string>) { return { data: this.operations.agentOrderDraft(token, this.actor(headers)) }; }
  @Post('order-drafts/:token/confirm') confirmAgentOrderDraft(@Param('token') token: string, @Body() input: any, @Headers() headers: Record<string, string>) { return { data: this.operations.confirmAgentOrderDraft(token, input, this.actor(headers)) }; }
  @Post('admin/articles') saveArticle(@Body() input: any, @Headers() headers: Record<string, string>) { return { data: this.operations.saveArticle(input, this.actor(headers, 'admin')) }; }
  @Post('admin/articles/batch-delete') deleteArticles(@Body() input: { ids?: string[] }, @Headers() headers: Record<string, string>) { return { data: this.operations.deleteArticles(input?.ids, this.actor(headers, 'admin')) }; }
  @Post('admin/articles/:id/delete') deleteArticle(@Param('id') id: string, @Headers() headers: Record<string, string>) { return { data: this.operations.deleteArticle(id, this.actor(headers, 'admin')) }; }
  @Get('admin/banners') banners(@Query() query: any, @Headers() headers: Record<string, string>) { const active = query.active === undefined ? undefined : !['false', '0', 'off'].includes(String(query.active).toLowerCase()); return { data: this.operations.banners(this.actor(headers, 'admin')).filter((item: any) => (active === undefined || item.active === active)) }; }
  @Post('admin/banners') saveBanner(@Body() input: any, @Headers() headers: Record<string, string>) { return { data: this.operations.saveBanner(input, this.actor(headers, 'admin')) }; }
  @Post('admin/banners/:id/delete') deleteBanner(@Param('id') id: string, @Headers() headers: Record<string, string>) { return { data: this.operations.deleteBanner(id, this.actor(headers, 'admin')) }; }
  @Get('admin/customers/:id/tags') customerTags(@Param('id') id: string, @Headers() headers: Record<string, string>) { return { data: this.operations.customerTags(id, this.actor(headers, 'admin')) }; }
  @Post('admin/customers/:id/tags') saveCustomerTag(@Param('id') id: string, @Body() input: any, @Headers() headers: Record<string, string>) { return { data: this.operations.saveCustomerTag(id, input, this.actor(headers, 'admin')) }; }
}
