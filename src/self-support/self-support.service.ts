import {
  BadRequestException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import { Platform } from '../entities';
import { PlatformStatus } from '../common/enums';
import { AuthenticatedStaff } from '../auth/auth.types';

// Mints a hand-off token so a signed-in staff member can file an issue about
// THIS platform (CIMP) into itself — i.e. CIMP registered as one of its own
// reporter portals. Same trust model as any portal: we sign server-side with
// the platform's per-portal secret, and the staff user becomes a reporter keyed
// by `staff:<id>` under that platform. HandoffService.verify() checks it exactly
// as it would a token from an external portal.
@Injectable()
export class SelfSupportService {
  constructor(
    @InjectRepository(Platform) private readonly platforms: Repository<Platform>,
    private readonly config: ConfigService,
  ) {}

  async mintForStaff(staff: AuthenticatedStaff): Promise<{ token: string; platformKey: string }> {
    const key = this.config.get<string>('selfSupport.platformKey') ?? 'cimp';
    const platform = await this.platforms.findOne({ where: { key } });
    if (!platform) {
      throw new NotFoundException(
        `Self-support platform "${key}" not found. Create it in Admin → Platforms, `
        + 'or set SELF_SUPPORT_PLATFORM_KEY to an existing platform key.',
      );
    }
    if (platform.status !== PlatformStatus.ACTIVE) {
      throw new BadRequestException(`Self-support platform "${key}" is not active.`);
    }

    const token = jwt.sign(
      {
        platformKey: platform.key,
        portalUserId: `staff:${staff.id}`,
        name: staff.name,
        email: staff.email,
      },
      platform.handoffSecret,
      { algorithm: 'HS256', expiresIn: '10m' },
    );
    return { token, platformKey: platform.key };
  }
}
