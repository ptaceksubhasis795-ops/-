import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, Param, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { BusinessService } from './domain/business.service';
import { Role } from './domain/types';
import { AuthService } from './security/auth.service';
import { Public } from './security/public.decorator';

const allowedPurposes = new Set(['prescription', 'banner', 'product', 'article-cover', 'invoice', 'aftersale']);
const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

@Controller('v1')
export class FilesController {
  constructor(private readonly business: BusinessService, private readonly auth: AuthService) {}

  private actor(headers: Record<string, string | undefined>) {
    const tokenActor = this.auth.verify(headers.authorization?.replace(/^Bearer\s+/i, ''));
    if (tokenActor) return tokenActor as { id: string; role: Role };
    if (process.env.NODE_ENV === 'production') return { id: 'anonymous', role: 'consumer' as Role };
    return { id: headers['x-user-id'] || 'u-demo', role: (headers['x-role'] || 'consumer') as Role };
  }

  @Post('files')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  upload(@UploadedFile() file: any, @Body() body: any, @Headers() headers: Record<string, string>) {
    const actor = this.actor(headers);
    if (!file) throw new BadRequestException('请选择要上传的文件');
    const purpose = String(body?.purpose || '');
    if (!allowedPurposes.has(purpose)) throw new BadRequestException('文件用途不正确');
    const originalName = String(file.originalname || '上传文件');
    const extension = originalName.toLowerCase().split('.').pop() || '';
    const extensionMime: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' };
    const mimeType = allowedMimeTypes.has(String(file.mimetype)) ? String(file.mimetype) : extensionMime[extension];
    if (!mimeType) throw new BadRequestException('仅支持图片或PDF文件');
    if (['banner', 'product', 'article-cover'].includes(purpose) && actor.role !== 'admin') throw new ForbiddenException('只有管理员可以上传运营图片');
    if (purpose === 'invoice' && !['admin', 'fulfillment'].includes(actor.role)) throw new ForbiddenException('无发票文件上传权限');
    const ownerId = purpose === 'prescription' && ['admin', 'pharmacist'].includes(actor.role) && body?.ownerId
      ? String(body.ownerId)
      : actor.id;
    const saved = this.business.store.saveFile({
      ownerId,
      purpose,
      originalName,
      mimeType,
      size: Number(file.size || file.buffer?.length || 0),
      data: Buffer.from(file.buffer).toString('base64')
    });
    this.business.store.addAudit(actor.id, actor.role, 'file.upload', 'file', String(saved.id), { purpose, ownerId, size: saved.size });
    return { data: { id: saved.id, fileKey: saved.id, purpose, originalName: saved.originalName, mimeType: saved.mimeType, size: saved.size, createdAt: saved.createdAt } };
  }

  @Get('files/:id')
  download(@Param('id') id: string, @Headers() headers: Record<string, string>, @Res() response: Response) {
    const actor = this.actor(headers);
    const file: any = this.business.store.findFile(id);
    if (!file) throw new BadRequestException('文件不存在');
    const owner = String(file.ownerId) === actor.id;
    const invoiceOwner = file.purpose === 'invoice' && this.business.store.state.invoices.some((invoice: any) => String(invoice.fileKey) === id && this.business.store.findOrder(String(invoice.orderId))?.userId === actor.id);
    const privileged = file.purpose === 'prescription'
      ? ['admin', 'pharmacist'].includes(actor.role)
      : actor.role === 'admin';
    if (!owner && !invoiceOwner && !privileged) throw new ForbiddenException('无文件查看权限');
    this.business.store.addAudit(actor.id, actor.role, 'file.download', 'file', id, { purpose: file.purpose });
    response.setHeader('Content-Type', String(file.mimeType));
    response.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(String(file.originalName || '文件'))}"`);
    response.send(Buffer.from(String(file.data), 'base64'));
  }

  @Public()
  @Get('content/banners/:id/image')
  bannerImage(@Param('id') id: string, @Res() response: Response) {
    const file: any = this.business.store.findFile(id);
    if (!file || file.purpose !== 'banner') throw new BadRequestException('轮播图片不存在');
    response.setHeader('Content-Type', String(file.mimeType));
    response.setHeader('Cache-Control', 'public, max-age=300');
    response.send(Buffer.from(String(file.data), 'base64'));
  }

  @Public()
  @Get('content/articles/:id/cover')
  articleCover(@Param('id') id: string, @Res() response: Response) {
    const article: any = this.business.store.state.articles.find((item: any) => item.id === id);
    if (!article || article.coverMode !== 'custom') throw new BadRequestException('文章封面不存在');
    const file: any = this.business.store.findFile(String(article.coverKey || ''));
    if (!file || file.purpose !== 'article-cover') throw new BadRequestException('文章封面文件不存在');
    response.setHeader('Content-Type', String(file.mimeType));
    response.setHeader('Cache-Control', 'public, max-age=300');
    response.send(Buffer.from(String(file.data), 'base64'));
  }
}
