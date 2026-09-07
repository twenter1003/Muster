import { Inject } from '@nestjs/common';
import type { EntityTarget, ObjectLiteral } from 'typeorm';
import { getRepositoryToken } from './database.module';

/**
 * `constructor(@InjectRepository(Project) private readonly projects: Repository<Project>)` 형태로 쓴다.
 * @nestjs/typeorm의 동명 데코레이터와 사용법이 같아, 나중에 래퍼로 갈아타도 호출부는 그대로다.
 */
export const InjectRepository = (entity: EntityTarget<ObjectLiteral>) =>
  Inject(getRepositoryToken(entity));
