import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActorType, CommentVisibility } from '../common/enums';
import { Comment } from '../entities';
import { CommentAddedEvent, IssueEvents } from '../events/issue-events';
import { TranslationService, baseLocale } from './translation.service';

// Fills the translation cache off the domain-event bus — never in the request
// path, exactly like the notifications and Jira listeners. A failure here is
// logged and dropped: `body` always holds the original, so the worst outcome of
// a provider outage is that a reader sees the untranslated message.
@Injectable()
export class TranslationListener {
  private readonly logger = new Logger(TranslationListener.name);

  constructor(
    @InjectRepository(Comment) private readonly comments: Repository<Comment>,
    private readonly translation: TranslationService,
    private readonly config: ConfigService,
  ) {}

  @OnEvent(IssueEvents.COMMENT_ADDED, { async: true })
  async onCommentAdded(evt: CommentAddedEvent): Promise<void> {
    if (!this.translation.isEnabled()) return;
    try {
      await this.translateComment(evt.commentId);
    } catch (err) {
      this.logger.warn(`comment translation failed: ${(err as Error).message}`);
    }
  }

  private async translateComment(commentId: string): Promise<void> {
    const comment = await this.comments.findOne({ where: { id: commentId } });
    if (!comment?.body?.trim()) return;

    const staffLocale = baseLocale(this.config.get<string>('translation.staffLocale')) ?? 'en';
    const fromReporter = comment.authorType === ActorType.REPORTER;

    // An INTERNAL note is staff-to-staff and never reaches a reporter, so it
    // only needs the staff language (and usually already is it).
    const targets = new Set<string>();
    if (fromReporter) {
      // Inbound: the support team has to be able to read it.
      targets.add(staffLocale);
    } else if (comment.visibility === CommentVisibility.REPORTER_VISIBLE) {
      // Outbound: pre-warm the reporter languages this deployment serves. The
      // reporter's own locale is served from this cache at read time.
      for (const l of this.config.get<string[]>('translation.reporterLocales') ?? []) {
        const base = baseLocale(l);
        if (base) targets.add(base);
      }
    }
    if (targets.size === 0) return;

    const source = comment.sourceLocale ?? (await this.translation.detect(comment.body));
    const cache: Record<string, string> = { ...(comment.translations ?? {}) };
    let changed = false;

    for (const target of targets) {
      // Already cached, or the text is already in that language — skip.
      if (cache[target] || (source && source === target)) continue;
      const res = await this.translation.translate(comment.body, target, source ?? undefined);
      // Providers return the input unchanged on failure; storing that would
      // poison the cache with a "translation" that is just the original.
      if (res.text && res.text !== comment.body) {
        cache[target] = res.text;
        changed = true;
      }
    }

    const resolvedSource = source ?? null;
    if (!changed && resolvedSource === comment.sourceLocale) return;

    // Targeted UPDATE rather than save(entity): a comment edit racing this
    // listener must not have its new body overwritten by our stale copy.
    await this.comments.update(
      { id: commentId },
      {
        sourceLocale: resolvedSource,
        ...(changed ? { translations: cache } : {}),
      },
    );
  }
}
