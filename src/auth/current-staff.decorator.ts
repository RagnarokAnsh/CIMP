import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedStaff } from './auth.types';

// Injects the authenticated staff member (with role grants) into a handler.
export const CurrentStaff = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedStaff => {
    const req = ctx.switchToHttp().getRequest();
    return req.user as AuthenticatedStaff;
  },
);
