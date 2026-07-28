import { BOOLEAN_ENV_FLAGS, InvalidEnvFlagError, envFlag, parseEnvFlag } from './env-flag';

describe('parseEnvFlag', () => {
  it('falls back only when unset or blank', () => {
    expect(parseEnvFlag('X', undefined, true)).toBe(true);
    expect(parseEnvFlag('X', undefined, false)).toBe(false);
    expect(parseEnvFlag('X', '', true)).toBe(true);
    expect(parseEnvFlag('X', '   ', false)).toBe(false);
  });

  it('accepts the documented spellings, case- and whitespace-insensitively', () => {
    for (const v of ['true', 'TRUE', ' True ', '1', 'yes', 'on']) {
      expect(parseEnvFlag('X', v, false)).toBe(true);
    }
    for (const v of ['false', 'FALSE', ' False ', '0', 'no', 'off']) {
      expect(parseEnvFlag('X', v, true)).toBe(false);
    }
  });

  // The regression this module exists for: `=== 'false'` treated every one of
  // these as "not false", i.e. left the switch ON while reading as off.
  it('no longer silently leaves a switch on for a near-miss spelling', () => {
    for (const v of ['False', 'FALSE', '0', 'no', 'off']) {
      expect(parseEnvFlag('SLA_SWEEP_ENABLED', v, true)).toBe(false);
    }
  });

  it('throws on a value it cannot interpret rather than guessing', () => {
    expect(() => parseEnvFlag('SLA_SWEEP_ENABLED', 'flase', true))
      .toThrow(InvalidEnvFlagError);
    expect(() => parseEnvFlag('SLA_SWEEP_ENABLED', 'disabled', true))
      .toThrow(/must be a boolean/);
  });
});

describe('envFlag', () => {
  const original = process.env.SLA_SWEEP_ENABLED;
  afterEach(() => {
    if (original === undefined) delete process.env.SLA_SWEEP_ENABLED;
    else process.env.SLA_SWEEP_ENABLED = original;
  });

  it('reads process.env and honours the fallback when unset', () => {
    delete process.env.SLA_SWEEP_ENABLED;
    expect(envFlag('SLA_SWEEP_ENABLED', true)).toBe(true);
    process.env.SLA_SWEEP_ENABLED = 'off';
    expect(envFlag('SLA_SWEEP_ENABLED', true)).toBe(false);
  });
});

describe('BOOLEAN_ENV_FLAGS', () => {
  it('lists every switch the boot validator must check', () => {
    expect([...BOOLEAN_ENV_FLAGS].sort()).toEqual(
      ['DIGEST_ENABLED', 'SCAN_RETRY_ENABLED', 'SLA_SWEEP_ENABLED'],
    );
  });
});
