import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import {
  EntityManager,
  FindOperator,
  FindOneOptions,
  FindOptionsWhere,
  Repository,
} from 'typeorm';
import { Season } from './entities/season.entity';
import { SeasonService } from './season.service';

type MockRepository<T extends object> = Partial<
  Record<keyof Repository<T>, jest.Mock>
>;

describe('SeasonService', () => {
  let service: SeasonService;
  let seasonRepository: MockRepository<Season>;

  const configureSeasons = (seasons: Season[]): void => {
    seasonRepository.findOne!.mockImplementation(
      async (options: FindOneOptions<Season>): Promise<Season | null> => {
        const where = options.where as FindOptionsWhere<Season>;
        const startDate = (where.startDate as FindOperator<string>).value;
        const endDate = (where.endDate as FindOperator<string>).value;

        return (
          seasons.find(
            (season) =>
              season.isActive === where.isActive &&
              season.startDate <= startDate &&
              season.endDate >= endDate,
          ) ?? null
        );
      },
    );
  };

  beforeEach(async () => {
    jest.useFakeTimers();
    seasonRepository = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeasonService,
        {
          provide: getRepositoryToken(Season),
          useValue: seasonRepository,
        },
      ],
    }).compile();

    service = module.get(SeasonService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each([
    ['inactive season', '2026-03-15', '2026-03-01', '2026-03-31', false, null],
    ['future season', '2026-03-15', '2026-03-16', '2026-03-31', true, null],
    ['expired season', '2026-03-15', '2026-03-01', '2026-03-14', true, null],
    [
      'start date inclusive',
      '2026-03-15',
      '2026-03-15',
      '2026-03-31',
      true,
      'season-1',
    ],
    [
      'end date inclusive',
      '2026-03-15',
      '2026-03-01',
      '2026-03-15',
      true,
      'season-1',
    ],
    [
      'day after end excluded',
      '2026-03-16',
      '2026-03-01',
      '2026-03-15',
      true,
      null,
    ],
  ])(
    'resolves %s by UTC date key',
    async (_caseName, at, startDate, endDate, isActive, expectedSeasonId) => {
      jest.setSystemTime(new Date(`${at}T23:30:00.000Z`));
      configureSeasons([
        {
          id: 'season-1',
          startDate,
          endDate,
          isActive,
        } as Season,
      ]);

      const result = await service.getActiveSeason();

      expect(result?.id ?? null).toBe(expectedSeasonId);
    },
  );

  it('uses the supplied entity manager repository', async () => {
    const managerRepository: MockRepository<Season> = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    const entityManager = {
      getRepository: jest.fn().mockReturnValue(managerRepository),
    } as unknown as EntityManager;

    await service.getActiveSeason(
      new Date('2026-03-15T00:00:00.000Z'),
      entityManager,
    );

    expect(entityManager.getRepository).toHaveBeenCalledWith(Season);
    expect(managerRepository.findOne).toHaveBeenCalled();
    expect(seasonRepository.findOne).not.toHaveBeenCalled();
  });

  it('throws a clear TypeError for an invalid date', () => {
    expect(() => service.getActiveSeason(new Date('invalid'))).toThrow(
      new TypeError('Active season lookup requires a valid date'),
    );
    expect(seasonRepository.findOne).not.toHaveBeenCalled();
  });
});
