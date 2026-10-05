import { Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './security/auth.service';
import { Public } from './security/public.decorator';

@Controller('v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Public() @Post('wechat/login') async login(@Body() body: { code?: string; phone?: string }) { return { data: await this.auth.login(body) }; }
  @Post('wechat/phone') async bindPhone(@Body() body: { phone?: string; code?: string }, @Headers() headers: Record<string, string>) {
    const actor = this.auth.verify(headers.authorization?.replace(/^Bearer\s+/i, ''));
    if (!actor) throw new UnauthorizedException('需要有效登录会话');
    return { data: await this.auth.bindPhone(body, actor) };
  }
  @Public() @Post('staff/login') staffLogin(@Body() body: { username?: string; password?: string }) { return { data: this.auth.staffLogin(body) }; }
}
