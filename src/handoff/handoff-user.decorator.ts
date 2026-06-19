import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { HandoffContext } from './handoff.types';

// Injects the verified hand-off context into a controller method.
export const Handoff = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): HandoffContext => {
    const req = ctx.switchToHttp().getRequest();
    return req.handoff as HandoffContext;
  },
);
