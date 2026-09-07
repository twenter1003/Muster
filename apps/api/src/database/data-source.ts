import 'reflect-metadata';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { config as loadDotenv } from 'dotenv';
import { ALL_ENTITIES } from './entities';

loadDotenv({ quiet: true });

/**
 * TypeORM CLI(마이그레이션 생성/실행)와 NestJS 런타임이 공유하는 접속 설정.
 *
 * synchronize는 어떤 환경에서도 켜지 않는다 — 스키마 변경은 전부 마이그레이션 파일로
 * 남아야 리뷰와 롤백이 가능하다.
 */
export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL ?? 'postgresql://agentops:agentops@localhost:5432/agentops',
  entities: [...ALL_ENTITIES],
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  synchronize: false,
  logging: process.env.TYPEORM_LOGGING === 'true',
};

export default new DataSource(dataSourceOptions);
