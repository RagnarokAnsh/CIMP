import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { HandoffService } from './handoff.service';

@Injectable()
export class HandoffGuard implements CanActivate {
  constructor(private readonly handoff: HandoffService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { handoff?: unknown }>();
    const token = this.extractToken(req);
    req.handoff = await this.handoff.verify(token);
    return true;
  }

  private extractToken(req: Request): string {
    const header = req.header('x-handoff-token');
    if (header) return header;
    const auth = req.header('authorization');
    if (auth?.startsWith('Bearer ')) return auth.slice(7);
    return '';
  }
}
