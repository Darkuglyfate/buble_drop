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
import { RedisService } from '../../redis/redis.service';

export const AUTH_SESSION_HEADER = 'x-bubbledrop-auth-session';
export const AUTH_SESSION_STATEMENT =
  'Sign in to BubbleDrop with your Base wallet for this browser session.';

interface PendingAuthNonce {
  walletAddress: Address;
  chainId: number;
  statement: string;
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

export interface AuthSessionStatusResult extends AuthSessionTokenPayload {
  authenticated: true;
}

@Injectable()
export class AuthSessionService {
  private readonly nonceTtlMs: number;
  private readonly maxClockSkewMs: number;
  private readonly authSessionTtlMs = 12 * 60 * 60 * 1000;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    this.nonceTtlMs = this.getPositiveIntegerSeconds(
      'AUTH_NONCE_TTL_SECONDS',
      300,
    );
    this.maxClockSkewMs = this.getNonNegativeIntegerSeconds(
      'SIWE_MAX_CLOCK_SKEW_SECONDS',
      60,
    );
  }

  async createNonce(
    walletAddress: string,
    chainId: number,
  ): Promise<AuthSessionNonceResult> {
    const normalizedWalletAddress = this.normalizeAddress(walletAddress);
    this.assertBaseChain(chainId);

    const nonce = generateSiweNonce();
    const expiresAtMs = Date.now() + this.nonceTtlMs;
    const pendingNonce: PendingAuthNonce = {
      walletAddress: normalizedWalletAddress,
      chainId,
      statement: AUTH_SESSION_STATEMENT,
      expiresAtMs,
    };
    const client = this.redisService.getClient();
    const setWithNxPx = client.set.bind(client) as unknown as (
      key: string,
      value: string,
      nx: 'NX',
      px: 'PX',
      ttlMs: number,
    ) => Promise<'OK' | null>;
    const stored = await setWithNxPx(
      this.getNonceKey(nonce),
      JSON.stringify(pendingNonce),
      'NX',
      'PX',
      this.nonceTtlMs,
    );

    if (stored !== 'OK') {
      throw new Error('Unable to reserve a SIWE nonce');
    }

    return {
      walletAddress: normalizedWalletAddress,
      chainId,
      nonce,
      statement: AUTH_SESSION_STATEMENT,
      expiresAt: new Date(expiresAtMs).toISOString(),
    };
  }

  async verifySiweMessageAndCreateSession(
    message: string,
    signature: string,
  ): Promise<VerifiedAuthSessionResult> {
    let parsedMessage: ReturnType<typeof parseSiweMessage>;
    try {
      parsedMessage = parseSiweMessage(message);
    } catch {
      throw new UnauthorizedException('Invalid SIWE message');
    }

    const nonce = this.requireStringField(parsedMessage.nonce, 'nonce');
    const pendingNonce = await this.consumePendingNonce(nonce);
    const now = new Date();

    const walletAddress = this.normalizeAddress(
      this.requireStringField(parsedMessage.address, 'address'),
    );
    const chainId = this.parseChainId(parsedMessage.chainId);
    const issuedAt = this.parseSiweTime(parsedMessage.issuedAt, 'issuedAt');
    const expirationTime = this.parseSiweTime(
      parsedMessage.expirationTime,
      'expirationTime',
    );
    const domain = this.assertApprovedSiweOrigin(
      this.requireStringField(parsedMessage.domain, 'domain'),
      this.requireExactStringField(parsedMessage.uri, 'uri'),
    );
    const statement = this.requireExactStringField(
      parsedMessage.statement,
      'statement',
    );

    if (
      walletAddress !== pendingNonce.walletAddress ||
      chainId !== pendingNonce.chainId
    ) {
      throw new ForbiddenException(
        'SIWE message does not match the requested wallet session',
      );
    }

    if (statement !== pendingNonce.statement) {
      throw new UnauthorizedException('SIWE statement is not approved');
    }

    this.assertSiweMessageTimes(
      issuedAt,
      expirationTime,
      pendingNonce.expiresAtMs,
      now,
    );

    const signatureHex = this.normalizeSignature(signature);
    const publicClient = this.createBasePublicClient();
    const isVerified = await publicClient.verifySiweMessage({
      address: walletAddress,
      domain,
      message,
      nonce,
      signature: signatureHex,
      time: now,
    });

    if (!isVerified) {
      throw new UnauthorizedException(
        'SIWE signature could not be verified by the backend',
      );
    }

    const sessionIssuedAt = new Date();
    const expiresAt = new Date(
      sessionIssuedAt.getTime() + this.authSessionTtlMs,
    );
    const authSessionToken = this.issueAuthSessionToken({
      walletAddress,
      chainId,
      issuedAt: sessionIssuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });

    return {
      walletAddress,
      chainId,
      issuedAt: sessionIssuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      authSessionToken,
    };
  }

  getAuthenticatedWalletAddress(
    authSessionHeader: string | undefined,
  ): Address {
    return this.requireAuthenticatedSession(authSessionHeader).walletAddress;
  }

  getSessionStatus(
    authSessionHeader: string | undefined,
  ): AuthSessionStatusResult {
    return {
      authenticated: true,
      ...this.requireAuthenticatedSession(authSessionHeader),
    };
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
    const configuredSecret =
      this.configService.get<string>('AUTH_SESSION_SECRET')?.trim() ?? '';

    if (configuredSecret) {
      if (
        process.env.NODE_ENV === 'production' &&
        configuredSecret === 'replace-with-a-long-random-string'
      ) {
        throw new Error(
          'AUTH_SESSION_SECRET must be replaced before running BubbleDrop in production',
        );
      }

      return configuredSecret;
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'AUTH_SESSION_SECRET must be configured for BubbleDrop production auth sessions',
      );
    }

    return 'bubbledrop-dev-auth-session-secret';
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

  private parseSiweTime(
    value: Date | string | undefined,
    fieldName: string,
  ): Date {
    if (!value) {
      throw new UnauthorizedException(`Missing SIWE ${fieldName}`);
    }

    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new UnauthorizedException(`Invalid SIWE ${fieldName}`);
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

  private requireExactStringField(
    value: string | undefined,
    fieldName: string,
  ): string {
    if (!value?.trim()) {
      throw new BadRequestException(`Missing SIWE ${fieldName}`);
    }

    return value;
  }

  private assertBaseChain(chainId: number): void {
    if (chainId !== base.id) {
      throw new BadRequestException('BubbleDrop auth is limited to Base chain');
    }
  }

  private async consumePendingNonce(nonce: string): Promise<PendingAuthNonce> {
    const serializedNonce = await this.redisService
      .getClient()
      .getdel(this.getNonceKey(nonce));

    if (!serializedNonce) {
      throw new UnauthorizedException('SIWE nonce is missing or expired');
    }

    let pendingNonce: PendingAuthNonce;
    try {
      const parsedPayload = JSON.parse(
        serializedNonce,
      ) as Partial<PendingAuthNonce>;
      const { walletAddress, chainId, statement, expiresAtMs } = parsedPayload;
      if (
        typeof walletAddress !== 'string' ||
        !isAddress(walletAddress) ||
        typeof chainId !== 'number' ||
        chainId !== base.id ||
        statement !== AUTH_SESSION_STATEMENT ||
        typeof expiresAtMs !== 'number' ||
        !Number.isSafeInteger(expiresAtMs)
      ) {
        throw new Error('Invalid pending SIWE nonce payload');
      }

      pendingNonce = {
        walletAddress: walletAddress.toLowerCase() as Address,
        chainId,
        statement,
        expiresAtMs,
      };
    } catch {
      throw new UnauthorizedException('SIWE nonce payload is invalid');
    }

    if (pendingNonce.expiresAtMs <= Date.now()) {
      throw new UnauthorizedException('SIWE nonce is missing or expired');
    }

    return pendingNonce;
  }

  private assertSiweMessageTimes(
    issuedAt: Date,
    expirationTime: Date,
    nonceExpiresAtMs: number,
    now: Date,
  ): void {
    const nowMs = now.getTime();
    if (
      issuedAt.getTime() > nowMs + this.maxClockSkewMs ||
      nowMs - issuedAt.getTime() > this.nonceTtlMs ||
      expirationTime.getTime() <= nowMs ||
      expirationTime.getTime() > nonceExpiresAtMs ||
      expirationTime.getTime() < issuedAt.getTime()
    ) {
      throw new UnauthorizedException('SIWE message time is not approved');
    }
  }

  private assertApprovedSiweOrigin(
    domainValue: string,
    uriValue: string,
  ): string {
    const domain = this.normalizeDomain(domainValue);
    const uri = this.parseHttpUrl(uriValue);
    const allowlist = this.getSiweAllowlist();

    if (
      domain !== uri.host ||
      !allowlist.domains.has(domain) ||
      !allowlist.uris.has(uriValue)
    ) {
      throw new UnauthorizedException('SIWE origin is not approved');
    }

    return domain;
  }

  private getSiweAllowlist(): {
    domains: Set<string>;
    uris: Set<string>;
  } {
    const configuredDomains = this.splitCsv(
      this.configService.get<string>('SIWE_ALLOWED_DOMAINS'),
    );
    const configuredUris = this.splitCsv(
      this.configService.get<string>('SIWE_ALLOWED_URIS'),
    );
    const allowsLocalFallback =
      process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
    const fallbackOrigins = allowsLocalFallback
      ? this.splitCsv(
          this.configService.get<string>('FRONTEND_ORIGIN') ??
            'http://localhost:3001',
        )
      : [];
    const allowedUris =
      configuredUris.length > 0 ? configuredUris : fallbackOrigins;
    const allowedDomains =
      configuredDomains.length > 0
        ? configuredDomains
        : fallbackOrigins.map((origin) => this.parseHttpUrl(origin).host);

    if (allowedDomains.length === 0 || allowedUris.length === 0) {
      throw new UnauthorizedException('SIWE allowlist is not configured');
    }

    return {
      domains: new Set(
        allowedDomains.map((domain) => this.normalizeDomain(domain)),
      ),
      uris: new Set(
        allowedUris.map((uri) => {
          this.parseHttpUrl(uri);
          return uri;
        }),
      ),
    };
  }

  private getNonceKey(nonce: string): string {
    return `bubbledrop:auth-nonce:${nonce}`;
  }

  private getPositiveIntegerSeconds(key: string, defaultValue: number): number {
    const value = this.getIntegerConfigValue(key, defaultValue);
    if (value <= 0) {
      throw new Error(`${key} must be a positive integer`);
    }

    return value * 1_000;
  }

  private getNonNegativeIntegerSeconds(
    key: string,
    defaultValue: number,
  ): number {
    const value = this.getIntegerConfigValue(key, defaultValue);
    if (value < 0) {
      throw new Error(`${key} must be a non-negative integer`);
    }

    return value * 1_000;
  }

  private getIntegerConfigValue(key: string, defaultValue: number): number {
    const configuredValue = this.configService.get<string | number>(key);
    const normalizedValue = String(configuredValue ?? '').trim();
    if (!normalizedValue) {
      return defaultValue;
    }

    if (!/^\d+$/.test(normalizedValue)) {
      throw new Error(`${key} must be an integer`);
    }

    const value = Number(normalizedValue);
    if (!Number.isSafeInteger(value)) {
      throw new Error(`${key} must be an integer`);
    }

    return value;
  }

  private splitCsv(value: string | undefined): string[] {
    return (
      value
        ?.split(',')
        .map((item) => item.trim())
        .filter(Boolean) ?? []
    );
  }

  private normalizeDomain(value: string): string {
    const domain = value.trim().toLowerCase();
    if (!domain || /[/?#@]/.test(domain) || domain.includes('://')) {
      throw new UnauthorizedException('Invalid SIWE domain');
    }

    let parsedDomain: URL;
    try {
      parsedDomain = new URL(`http://${domain}`);
    } catch {
      throw new UnauthorizedException('Invalid SIWE domain');
    }

    if (parsedDomain.host !== domain) {
      throw new UnauthorizedException('Invalid SIWE domain');
    }

    return parsedDomain.host;
  }

  private parseHttpUrl(value: string): URL {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new UnauthorizedException('Invalid SIWE URI');
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new UnauthorizedException('Invalid SIWE URI');
    }

    return url;
  }
}
