import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { IS_PUBLIC } from './public.decorator';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly auth: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()])) return true;
    const request = context.switchToHttp().getRequest();
    const headers = request.headers || {};
    const authorization = headers.authorization;
    if (this.auth.verify(authorization?.replace(/^Bearer\s+/i, ''))) return true;
    // Development headers are an explicit local-test opt-in. They are never
    // accepted in production and are disabled by default in every environment.
    if (process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_HEADERS === 'true'
      && (String(headers['x-user-id'] || '').trim() || String(headers['x-role'] || '').trim())) return true;
    throw new UnauthorizedException('需要有效登录会话');
  }
}
