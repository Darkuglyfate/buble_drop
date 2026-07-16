import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CompleteBubbleSessionDto } from './complete-bubble-session.dto';

const POSTGRES_INT_MAX = 2_147_483_647;

describe('CompleteBubbleSessionDto', () => {
  const basePayload = {
    profileId: '11111111-1111-4111-8111-111111111111',
    sessionId: '22222222-2222-4222-8222-222222222222',
    activeSeconds: 0,
  };

  it('defaults optional untrusted telemetry to zero', async () => {
    const dto = plainToInstance(CompleteBubbleSessionDto, basePayload);

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.finalScore).toBe(0);
    expect(dto.bestCombo).toBe(0);
  });

  it.each(['finalScore', 'bestCombo'] as const)(
    'rejects %s above the PostgreSQL integer range',
    async (field) => {
      const dto = plainToInstance(CompleteBubbleSessionDto, {
        ...basePayload,
        [field]: POSTGRES_INT_MAX + 1,
      });

      const errors = await validate(dto);

      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            property: field,
            constraints: expect.objectContaining({ max: expect.any(String) }),
          }),
        ]),
      );
    },
  );
});
