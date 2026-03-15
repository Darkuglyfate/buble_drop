import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { Address, Hex, createPublicClient, http, isAddress } from 'viem';
import { base } from 'viem/chains';
import { generateSiweNonce, parseSiweMessage } from 'viem/siwe';

export const AUTH_SESSION_HEADER = 'x-bubbledrop-auth-session';

interface PendingAuthNonce {
  walletAddress: Address;
  chainId: number;
  expiresAtMs: number;
}

interface AuthSessionTokenPayload {
  walletAddress: Address;
  chainId: number;
  issuedAt: string;
  expiresAt: string;
}

export interface AuthSessionNonceResult {
  walletAddress: string;
  chainId: number;
  nonce: string;
  statement: string;
  expiresAt: string;
}

export interface VerifiedAuthSessionResult {
  walletAddress: string;
  chainId: number;
  issuedAt: string;
  expiresAt: string;
  authSessionToken: string;
}

@Injectable()
export class AuthSessionService {
  private readonly pendingNonces = new Map<string, PendingAuthNonce>();
  private readonly nonceTtlMs = 5 * 60 * 1000;
  private readonly authSessionTtlMs = 12 * 60 * 60 * 1000;
  private readonly signInStatement =
    'Sign in to BubbleDrop with your Base wallet for this browser session.';

  constructor(private readonly configService: ConfigService) {}

  createNonce(walletAddress: string, chainId: number): AuthSessionNonceResult {
    const normalizedWalletAddress = this.normalizeAddress(walletAddress);
    this.assertBaseChain(chainId);
    this.pruneExpiredNonces();

    const nonce = generateSiweNonce();
    const expiresAtMs = Date.now() + this.nonceTtlMs;
    this.pendingNonces.set(nonce, {
      walletAddress: normalizedWalletAddress,
      chainId,
      expiresAtMs,
    });

    return {
      walletAddress: normalizedWalletAddress,
      chainId,
      nonce,
      statement: this.signInStatement,
      expiresAt: new Date(expiresAtMs).toISOString(),
    };
  }

  async verifySiweMessageAndCreateSession(
    message: string,
    signature: string,
  ): Promise<VerifiedAuthSessionResult> {
    const parsedMessage = parseSiweMessage(message);
    const nonce = this.requireStringField(parsedMessage.nonce, 'nonce');
    const pendingNonce = this.pendingNonces.get(nonce);
    this.pendingNonces.delete(nonce);

    if (!pendingNonce || pendingNonce.expiresAtMs < Date.now()) {
      throw new UnauthorizedException('SIWE nonce is missing or expired');
    }

    const walletAddress = this.normalizeAddress(
      this.requireStringField(parsedMessage.address, 'address'),
    );
    const chainId = this.parseChainId(parsedMessage.chainId);
    const issuedAt = this.parseIssuedAt(parsedMessage.issuedAt);
    const domain = this.requireStringField(parsedMessage.domain, 'domain');

    if (
      walletAddress !== pendingNonce.walletAddress ||
      chainId !== pendingNonce.chainId
    ) {
      throw new ForbiddenException(
        'SIWE message does not match the requested wallet session',
      );
    }

    const signatureHex = this.normalizeSignature(signature);
    const publicClient = this.createBasePublicClient();
    const isVerified = await publicClient.verifySiweMessage({
      address: walletAddress,
      domain,
      message,
      nonce,
      signature: signatureHex,
      time: new Date(),
    });

    if (!isVerified) {
      throw new UnauthorizedException(
        'SIWE signature could not be verified by the backend',
      );
    }

    if (Date.now() - issuedAt.getTime() > this.nonceTtlMs) {
      throw new UnauthorizedException('SIWE message has expired');
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.authSessionTtlMs);
    const authSessionToken = this.issueAuthSessionToken({
      walletAddress,
      chainId,
      issuedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });

    return {
      walletAddress,
      chainId,
      issuedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      authSessionToken,
    };
  }

  getAuthenticatedWalletAddress(
    authSessionHeader: string | undefined,
  ): Address {
    return this.requireAuthenticatedSession(authSessionHeader).walletAddress;
  }

  requireAuthenticatedSession(
    authSessionHeader: string | undefined,
  ): AuthSessionTokenPayload {
    const token = authSessionHeader?.trim();
    if (!token) {
      throw new UnauthorizedException(`Missing ${AUTH_SESSION_HEADER} header`);
    }

    const [encodedPayload, encodedSignature] = token.split('.');
    if (!encodedPayload || !encodedSignature) {
      throw new UnauthorizedException('Invalid auth session token format');
    }

    const expectedSignature = this.signEncodedPayload(encodedPayload);
    const actualSignature = Buffer.from(encodedSignature, 'base64url');
    if (
      expectedSignature.length !== actualSignature.length ||
      !timingSafeEqual(expectedSignature, actualSignature)
    ) {
      throw new UnauthorizedException('Invalid auth session token signature');
    }

    let parsedPayload: AuthSessionTokenPayload;
    try {
      parsedPayload = JSON.parse(
        Buffer.from(encodedPayload, 'base64url').toString('utf8'),
      ) as AuthSessionTokenPayload;
    } catch {
      throw new UnauthorizedException('Invalid auth session token payload');
    }

    const walletAddress = this.normalizeAddress(parsedPayload.walletAddress);
    const chainId = this.parseChainId(parsedPayload.chainId);
    const expiresAt = this.parseIssuedAt(parsedPayload.expiresAt);
    const issuedAt = this.parseIssuedAt(parsedPayload.issuedAt);

    this.assertBaseChain(chainId);
    if (expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Auth session token has expired');
    }

    return {
      walletAddress,
      chainId,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
  }

  private issueAuthSessionToken(payload: AuthSessionTokenPayload): string {
    const encodedPayload = Buffer.from(
      JSON.stringify(payload),
      'utf8',
    ).toString('base64url');
    const signature =
      this.signEncodedPayload(encodedPayload).toString('base64url');
    return `${encodedPayload}.${signature}`;
  }

  private signEncodedPayload(encodedPayload: string): Buffer {
    return createHmac('sha256', this.getAuthSessionSecret())
      .update(encodedPayload)
      .digest();
  }

  private getAuthSessionSecret(): string {
    return this.configService.get<string>(
      'AUTH_SESSION_SECRET',
      'bubbledrop-dev-auth-session-secret',
    );
  }

  private createBasePublicClient() {
    const rpcUrl = this.configService.get<string>('BASE_RPC_URL');
    return createPublicClient({
      chain: base,
      transport: rpcUrl?.trim() ? http(rpcUrl.trim()) : http(),
    });
  }

  private normalizeAddress(value: string): Address {
    const normalized = value.trim();
    if (!isAddress(normalized)) {
      throw new BadRequestException('Invalid wallet address format');
    }

    return normalized.toLowerCase() as Address;
  }

  private normalizeSignature(value: string): Hex {
    const normalized = value.trim();
    if (!/^0x[0-9a-fA-F]+$/.test(normalized)) {
      throw new BadRequestException('Invalid SIWE signature format');
    }

    return normalized as Hex;
  }

  private parseChainId(value: number | string | undefined): number {
    const parsed =
      typeof value === 'number' ? value : value ? Number(value) : Number.NaN;
    if (!Number.isInteger(parsed)) {
      throw new BadRequestException('Invalid SIWE chainId');
    }

    return parsed;
  }

  private parseIssuedAt(value: Date | string | undefined): Date {
    const parsed =
      value instanceof Date ? value : value ? new Date(value) : new Date('');
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Invalid SIWE time field');
    }

    return parsed;
  }

  private requireStringField(
    value: string | undefined,
    fieldName: string,
  ): string {
    if (!value?.trim()) {
      throw new BadRequestException(`Missing SIWE ${fieldName}`);
    }

    return value.trim();
  }

  private assertBaseChain(chainId: number): void {
    if (chainId !== base.id) {
      throw new BadRequestException('BubbleDrop auth is limited to Base chain');
    }
  }

  private pruneExpiredNonces(): void {
    const now = Date.now();
    for (const [nonce, pendingNonce] of this.pendingNonces.entries()) {
      if (pendingNonce.expiresAtMs <= now) {
        this.pendingNonces.delete(nonce);
      }
    }
  }
}
