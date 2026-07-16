import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { createSiweMessage } from 'viem/siwe';
import { base } from 'viem/chains';
import { RedisService } from '../../redis/redis.service';
import {
  AUTH_SESSION_STATEMENT,
  AuthSessionNonceResult,
  AuthSessionService,
} from './auth-session.service';

const verifySiweMessageMock = jest.fn();

jest.mock('viem', () => {
  const actual = jest.requireActual('viem');
  return {
    ...actual,
    createPublicClient: jest.fn(() => ({
      verifySiweMessage: verifySiweMessageMock,
    })),
  };
});

describe('AuthSessionService', () => {
  let service: AuthSessionService;
  let configValues: Record<string, string | undefined>;
  let redisClient: {
    set: jest.Mock;
    getdel: jest.Mock;
  };
  let originalNodeEnv: string | undefined;

  beforeEach(async () => {
    originalNodeEnv = process.env.NODE_ENV;
    verifySiweMessageMock.mockReset();
    verifySiweMessageMock.mockResolvedValue(true);
    configValues = {
      AUTH_SESSION_SECRET: 'test-auth-session-secret',
      SIWE_ALLOWED_DOMAINS: 'localhost:3001',
      SIWE_ALLOWED_URIS: 'http://localhost:3001',
    };
    const redisValues = new Map<string, string>();
    redisClient = {
      set: jest.fn(async (key: string, value: string) => {
        redisValues.set(key, value);
        return 'OK';
      }),
      getdel: jest.fn(async (key: string) => {
        const value = redisValues.get(key) ?? null;
        redisValues.delete(key);
        return value;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthSessionService,
        {
          provide: RedisService,
          useValue: {
            getClient: jest.fn(() => redisClient),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(
              (key: string, fallback?: string) => configValues[key] ?? fallback,
            ),
          },
        },
      ],
    }).compile();

    service = module.get<AuthSessionService>(AuthSessionService);
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
      return;
    }
    process.env.NODE_ENV = originalNodeEnv;
  });

  function createMessage(
    nonceResult: AuthSessionNonceResult,
    overrides: Partial<{
      domain: string;
      statement: string;
      uri: string;
      issuedAt: Date;
      expirationTime: Date;
    }> = {},
  ): string {
    return createSiweMessage({
      address: nonceResult.walletAddress as `0x${string}`,
      chainId: nonceResult.chainId,
      domain: overrides.domain ?? 'localhost:3001',
      nonce: nonceResult.nonce,
      statement: overrides.statement ?? AUTH_SESSION_STATEMENT,
      uri: overrides.uri ?? 'http://localhost:3001',
      version: '1',
      issuedAt: overrides.issuedAt ?? new Date(),
      expirationTime:
        overrides.expirationTime ?? new Date(nonceResult.expiresAt),
    });
  }

  async function createNonce(): Promise<AuthSessionNonceResult> {
    return service.createNonce(
      '0x1111111111111111111111111111111111111111',
      base.id,
    );
  }

  it('accepts the exact canonical statement and nonce expiry', async () => {
    const nonceResult = await createNonce();
    const message = createMessage(nonceResult);

    const result = await service.verifySiweMessageAndCreateSession(
      message,
      '0x1234',
    );

    expect(result.walletAddress).toBe(
      '0x1111111111111111111111111111111111111111',
    );
    expect(result.chainId).toBe(base.id);
    expect(result.authSessionToken).toContain('.');
    expect(service.getAuthenticatedWalletAddress(result.authSessionToken)).toBe(
      '0x1111111111111111111111111111111111111111',
    );
    expect(verifySiweMessageMock).toHaveBeenCalled();
    expect(redisClient.set).toHaveBeenCalledWith(
      `bubbledrop:auth-nonce:${nonceResult.nonce}`,
      expect.any(String),
      'NX',
      'PX',
      300_000,
    );
    expect(redisClient.getdel).toHaveBeenCalledWith(
      `bubbledrop:auth-nonce:${nonceResult.nonce}`,
    );
  });

  it('rejects an unapproved SIWE domain', async () => {
    const nonceResult = await createNonce();

    await expect(
      service.verifySiweMessageAndCreateSession(
        createMessage(nonceResult, {
          domain: 'attacker.example',
          uri: 'https://attacker.example',
        }),
        '0x1234',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an unapproved SIWE URI', async () => {
    const nonceResult = await createNonce();

    await expect(
      service.verifySiweMessageAndCreateSession(
        createMessage(nonceResult, {
          uri: 'https://localhost:3001',
        }),
        '0x1234',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a normalized-but-not-exact SIWE URI', async () => {
    const nonceResult = await createNonce();

    await expect(
      service.verifySiweMessageAndCreateSession(
        createMessage(nonceResult, {
          uri: 'http://localhost:3001/',
        }),
        '0x1234',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it.each([
    ['development', true],
    ['test', true],
    ['staging', false],
    ['production', false],
    [undefined, false],
  ])(
    'uses FRONTEND_ORIGIN fallback only in %s',
    async (nodeEnv, shouldAcceptFallback) => {
      if (nodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = nodeEnv;
      }
      delete configValues.SIWE_ALLOWED_DOMAINS;
      delete configValues.SIWE_ALLOWED_URIS;
      configValues.FRONTEND_ORIGIN = 'http://localhost:3001';
      const nonceResult = await createNonce();

      const verification = service.verifySiweMessageAndCreateSession(
        createMessage(nonceResult),
        '0x1234',
      );

      if (shouldAcceptFallback) {
        await expect(verification).resolves.toMatchObject({
          walletAddress: nonceResult.walletAddress,
        });
      } else {
        await expect(verification).rejects.toBeInstanceOf(
          UnauthorizedException,
        );
      }
    },
  );

  it('rejects a SIWE message with a different statement', async () => {
    const nonceResult = await createNonce();

    await expect(
      service.verifySiweMessageAndCreateSession(
        createMessage(nonceResult, {
          statement: 'Sign in to a different application.',
        }),
        '0x1234',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a SIWE statement with signed surrounding whitespace', async () => {
    const nonceResult = await createNonce();

    await expect(
      service.verifySiweMessageAndCreateSession(
        createMessage(nonceResult, {
          statement: ` ${AUTH_SESSION_STATEMENT} `,
        }),
        '0x1234',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an expired SIWE expiration time', async () => {
    const nonceResult = await createNonce();

    await expect(
      service.verifySiweMessageAndCreateSession(
        createMessage(nonceResult, {
          expirationTime: new Date(Date.now() - 1_000),
        }),
        '0x1234',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects reused SIWE nonces', async () => {
    const nonceResult = await createNonce();
    const message = createMessage(nonceResult);

    await service.verifySiweMessageAndCreateSession(message, '0x1234');

    await expect(
      service.verifySiweMessageAndCreateSession(message, '0x1234'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns authenticated session status for a valid token', async () => {
    const nonceResult = await createNonce();
    const verifiedSession = await service.verifySiweMessageAndCreateSession(
      createMessage(nonceResult),
      '0x1234',
    );

    const status = (
      service as unknown as {
        getSessionStatus: (token: string | undefined) => {
          authenticated: true;
          walletAddress: string;
          chainId: number;
          issuedAt: string;
          expiresAt: string;
        };
      }
    ).getSessionStatus(verifiedSession.authSessionToken);

    expect(status).toEqual({
      authenticated: true,
      walletAddress: verifiedSession.walletAddress,
      chainId: verifiedSession.chainId,
      issuedAt: verifiedSession.issuedAt,
      expiresAt: verifiedSession.expiresAt,
    });
    expect(status).not.toHaveProperty('authSessionToken');
  });

  it('rejects session status after the token expires', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-16T00:00:00.000Z'));

    try {
      const nonceResult = await createNonce();
      const verifiedSession = await service.verifySiweMessageAndCreateSession(
        createMessage(nonceResult),
        '0x1234',
      );
      jest.advanceTimersByTime(12 * 60 * 60 * 1_000 + 1);

      expect(() =>
        (
          service as unknown as {
            getSessionStatus: (token: string | undefined) => unknown;
          }
        ).getSessionStatus(verifiedSession.authSessionToken),
      ).toThrow(UnauthorizedException);
    } finally {
      jest.useRealTimers();
    }
  });
});
