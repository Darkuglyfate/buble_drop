import { AuthSessionController } from './auth-session.controller';
import { AuthSessionService } from './auth-session.service';

describe('AuthSessionController', () => {
  it('validates the auth header through the service for status', () => {
    const sessionStatus = {
      authenticated: true as const,
      walletAddress: '0x1111111111111111111111111111111111111111',
      chainId: 8453,
      issuedAt: '2026-07-16T00:00:00.000Z',
      expiresAt: '2026-07-16T12:00:00.000Z',
    };
    const authSessionService = {
      getSessionStatus: jest.fn(() => sessionStatus),
    };
    const controller = new AuthSessionController(
      authSessionService as unknown as AuthSessionService,
    );

    const result = (
      controller as unknown as {
        getStatus: (token: string | undefined) => typeof sessionStatus;
      }
    ).getStatus('backend-token');

    expect(result).toEqual(sessionStatus);
    expect(authSessionService.getSessionStatus).toHaveBeenCalledWith(
      'backend-token',
    );
  });
});
