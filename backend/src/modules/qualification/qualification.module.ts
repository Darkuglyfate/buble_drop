import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BubbleSession } from '../bubble-session/entities/bubble-session.entity';
import { CheckInRecord } from '../check-in/entities/check-in-record.entity';
import { Profile } from '../profile/entities/profile.entity';
import { RewardEvent } from '../rewards/entities/reward-event.entity';
import { QualificationState } from './entities/qualification-state.entity';
import { QualificationService } from './qualification.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      QualificationState,
      Profile,
      BubbleSession,
      RewardEvent,
      CheckInRecord,
    ]),
  ],
  providers: [QualificationService],
  exports: [QualificationService],
})
export class QualificationModule {}
