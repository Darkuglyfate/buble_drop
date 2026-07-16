import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Season } from './entities/season.entity';
import { SeasonService } from './season.service';

@Module({
  imports: [TypeOrmModule.forFeature([Season])],
  providers: [SeasonService],
  exports: [SeasonService],
})
export class SeasonModule {}
