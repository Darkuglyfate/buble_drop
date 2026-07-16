import { buildPostgresConnectionOptions } from './postgres-options';

describe('PostgreSQL connection options', () => {
  it('verifies certificates by default for DATABASE_URL', () => {
    const options = buildPostgresConnectionOptions({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://user:password@db.example.com:5432/bubbledrop',
    });

    expect(options.ssl).toEqual({ rejectUnauthorized: true });
  });

  it('removes URL parameters that can override the explicit TLS policy', () => {
    const options = buildPostgresConnectionOptions({
      NODE_ENV: 'production',
      DATABASE_URL:
        'postgres://user:password@db.example.com/bubbledrop?sslmode=no-verify&ssl=0&uselibpqcompat=true&application_name=bubbledrop',
    });
    const sanitizedUrl = new URL(options.url as string);

    expect(sanitizedUrl.searchParams.get('application_name')).toBe(
      'bubbledrop',
    );
    expect(sanitizedUrl.searchParams.has('sslmode')).toBe(false);
    expect(sanitizedUrl.searchParams.has('ssl')).toBe(false);
    expect(sanitizedUrl.searchParams.has('uselibpqcompat')).toBe(false);
    expect(options.ssl).toEqual({ rejectUnauthorized: true });
  });

  it('verifies certificates for production host configuration', () => {
    const options = buildPostgresConnectionOptions({
      NODE_ENV: 'production',
      DB_HOST: 'db.example.com',
      DB_PORT: '5433',
      DB_USER: 'bubble',
      DB_PASSWORD: 'secret',
      DB_NAME: 'drop',
    });

    expect(options).toMatchObject({
      host: 'db.example.com',
      port: 5433,
      username: 'bubble',
      password: 'secret',
      database: 'drop',
      ssl: { rejectUnauthorized: true },
    });
  });

  it('allows self-signed TLS only through an explicit non-production override', () => {
    const options = buildPostgresConnectionOptions({
      NODE_ENV: 'test',
      DB_HOST: '127.0.0.1',
      DB_SSL: 'true',
      DB_SSL_ALLOW_SELF_SIGNED: 'true',
    });

    expect(options.ssl).toEqual({ rejectUnauthorized: false });
  });

  it('rejects the self-signed override in production', () => {
    expect(() =>
      buildPostgresConnectionOptions({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://user:password@db.example.com/bubbledrop',
        DB_SSL_ALLOW_SELF_SIGNED: 'true',
      }),
    ).toThrow('DB_SSL_ALLOW_SELF_SIGNED');
  });

  it('rejects plaintext PostgreSQL in production', () => {
    expect(() =>
      buildPostgresConnectionOptions({
        NODE_ENV: 'production',
        DB_HOST: 'db.example.com',
        DB_SSL: 'false',
      }),
    ).toThrow('DB_SSL');
  });

  it('keeps local host connections plaintext unless TLS is requested', () => {
    const options = buildPostgresConnectionOptions({ NODE_ENV: 'development' });

    expect(options.ssl).toBeUndefined();
  });
});
