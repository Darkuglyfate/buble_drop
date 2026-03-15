import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { createSiweMessage } from 'viem/siwe';
import { base } from 'viem/chains';
import { AuthSessionService } from './auth-session.service';

const verifySiweMessageMock = jest.fn();

jest.mock('viem', () => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const actual = jest.requireActual('viem');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return {
    ...actual,
    createPublicClient: jest.fn(() => ({
      verifySiweMessage: verifySiweMessageMock,
    })),
  };
});

describe('AuthSessionService', () => {
  let service: AuthSessionService;

  beforeEach(async () => {
    verifySiweMessageMock.mockReset();
    verifySiweMessageMock.mockResolvedValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthSessionService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, fallback?: string) => {
              if (key === 'AUTH_SESSION_SECRET') {
                return 'test-auth-session-secret';
              }
              return fallback;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AuthSessionService>(AuthSessionService);
  });

  it('creates a nonce and verifies a SIWE message into a signed auth session', async () => {
    const nonceResult = service.createNonce(
      '0x1111111111111111111111111111111111111111',
      base.id,
    );
    const issuedAt = new Date();
    const message = createSiweMessage({
      address: nonceResult.walletAddress as `0x${string}`,
      chainId: nonceResult.chainId,
      domain: 'localhost:3001',
      nonce: nonceResult.nonce,
      statement: nonceResult.statement,
      uri: 'http://localhost:3001',
      version: '1',
      issuedAt,
    });

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
  });

  it('rejects reused SIWE nonces', async () => {
    const nonceResult = service.createNonce(
      '0x1111111111111111111111111111111111111111',
      base.id,
    );
    const message = createSiweMessage({
      address: nonceResult.walletAddress as `0x${string}`,
      chainId: nonceResult.chainId,
      domain: 'localhost:3001',
      nonce: nonceResult.nonce,
      statement: nonceResult.statement,
      uri: 'http://localhost:3001',
      version: '1',
      issuedAt: new Date(),
    });

    await service.verifySiweMessageAndCreateSession(message, '0x1234');

    await expect(
      service.verifySiweMessageAndCreateSession(message, '0x1234'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
