import { TranslationListener } from './translation.listener';
import { NoopTranslationService } from './noop-translation.service';
import { TranslationService } from './translation.service';
import { ActorType, CommentVisibility } from '../common/enums';

// The listener's contract: never break the request path, never poison the cache
// with a failed "translation", and never translate what nobody will read.
describe('TranslationListener', () => {
  const config = (values: Record<string, unknown>) => ({
    get: (k: string) => values[k],
  }) as any;

  let comments: any;

  beforeEach(() => {
    comments = { findOne: jest.fn(), update: jest.fn().mockResolvedValue(undefined) };
  });

  const evt = { commentId: 'c1' } as any;

  it('does nothing at all when the driver is disabled', async () => {
    const listener = new TranslationListener(
      comments, new NoopTranslationService(), config({ 'translation.staffLocale': 'en' }),
    );
    await listener.onCommentAdded(evt);
    expect(comments.findOne).not.toHaveBeenCalled();
  });

  // A stub provider that reverses text, so "translated" output is distinguishable.
  class FakeTranslator extends TranslationService {
    constructor(private readonly failing = false) { super(); }
    isEnabled() { return true; }
    async translate(text: string) {
      // A real provider returns the INPUT unchanged when it fails.
      return { text: this.failing ? text : `[t]${text}`, detectedSourceLocale: null };
    }
    async detect() { return 'es'; }
  }

  it('translates an inbound reporter message into the staff language', async () => {
    comments.findOne.mockResolvedValue({
      id: 'c1', body: 'hola', authorType: ActorType.REPORTER,
      visibility: CommentVisibility.REPORTER_VISIBLE, sourceLocale: 'es', translations: null,
    });
    const listener = new TranslationListener(
      comments, new FakeTranslator(), config({ 'translation.staffLocale': 'en' }),
    );
    await listener.onCommentAdded(evt);
    expect(comments.update).toHaveBeenCalledWith(
      { id: 'c1' },
      expect.objectContaining({ translations: { en: '[t]hola' } }),
    );
  });

  it('does not cache a failed translation that echoes the original', async () => {
    comments.findOne.mockResolvedValue({
      id: 'c1', body: 'hola', authorType: ActorType.REPORTER,
      visibility: CommentVisibility.REPORTER_VISIBLE, sourceLocale: 'es', translations: null,
    });
    const listener = new TranslationListener(
      comments, new FakeTranslator(true), config({ 'translation.staffLocale': 'en' }),
    );
    await listener.onCommentAdded(evt);
    const payload = comments.update.mock.calls[0]?.[1];
    expect(payload?.translations).toBeUndefined();
  });

  it('skips an internal staff note — no reporter will ever read it', async () => {
    comments.findOne.mockResolvedValue({
      id: 'c1', body: 'internal', authorType: ActorType.STAFF,
      visibility: CommentVisibility.INTERNAL, sourceLocale: 'en', translations: null,
    });
    const listener = new TranslationListener(
      comments,
      new FakeTranslator(),
      config({ 'translation.staffLocale': 'en', 'translation.reporterLocales': ['es'] }),
    );
    await listener.onCommentAdded(evt);
    expect(comments.update).not.toHaveBeenCalled();
  });

  it('pre-warms configured reporter locales for a reporter-visible staff reply', async () => {
    comments.findOne.mockResolvedValue({
      id: 'c1', body: 'fixed', authorType: ActorType.STAFF,
      visibility: CommentVisibility.REPORTER_VISIBLE, sourceLocale: 'en', translations: null,
    });
    const listener = new TranslationListener(
      comments,
      new FakeTranslator(),
      config({ 'translation.staffLocale': 'en', 'translation.reporterLocales': ['es', 'fr'] }),
    );
    await listener.onCommentAdded(evt);
    expect(comments.update).toHaveBeenCalledWith(
      { id: 'c1' },
      expect.objectContaining({ translations: { es: '[t]fixed', fr: '[t]fixed' } }),
    );
  });

  it('swallows a provider explosion so the comment still stands', async () => {
    comments.findOne.mockRejectedValue(new Error('db down'));
    const listener = new TranslationListener(
      comments, new FakeTranslator(), config({ 'translation.staffLocale': 'en' }),
    );
    await expect(listener.onCommentAdded(evt)).resolves.toBeUndefined();
  });
});
