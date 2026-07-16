import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  EntityManager,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { Season } from './entities/season.entity';

@Injectable()
export class SeasonService {
  constructor(
    @InjectRepository(Season)
    private readonly seasonRepository: Repository<Season>,
  ) {}

  getActiveSeason(
    at = new Date(),
    entityManager?: EntityManager,
  ): Promise<Season | null> {
    if (Number.isNaN(at.getTime())) {
      throw new TypeError('Active season lookup requires a valid date');
    }

    const repository = entityManager
      ? entityManager.getRepository(Season)
      : this.seasonRepository;
    const utcDateKey = at.toISOString().slice(0, 10);

    return repository.findOne({
      where: {
        isActive: true,
        startDate: LessThanOrEqual(utcDateKey),
        endDate: MoreThanOrEqual(utcDateKey),
      },
      order: { startDate: 'DESC' },
    });
  }
}
