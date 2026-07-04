import {
  CanActivate, ExecutionContext, Injectable, UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTokensService } from './api-tokens.service';

// Authenticates an integration request by its API token (Authorization: Bearer
// <token>, or X-Api-Token). Attaches { platformId } so read handlers can scope.
@Injectable()
export class ApiTokenGuard implements CanActivate {
  constructor(private readonly tokens: ApiTokensService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { apiToken?: { id: string; platformId: string } }>();
    const header = req.header('authorization');
    const bearer = header?.startsWith('Bearer ') ? header.slice(7) : '';
    const raw = bearer || req.header('x-api-token') || '';
    const token = raw ? await this.tokens.authenticate(raw) : null;
    if (!token) throw new UnauthorizedException('Invalid or revoked API token.');
    req.apiToken = { id: token.id, platformId: token.platform.id };
    return true;
  }
}
