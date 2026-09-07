import { Global, Inject, Module, type OnApplicationShutdown, type Provider } from '@nestjs/common';
import { DataSource, type EntityTarget, type ObjectLiteral, Repository } from 'typeorm';
import { ALL_ENTITIES } from './entities';
import { dataSourceOptions } from './data-source';

export const DATA_SOURCE = Symbol('DATA_SOURCE');

/**
 * 엔티티 클래스로부터 리포지토리 주입 토큰을 만든다.
 * `@InjectRepository(Project)`가 이 토큰으로 프로바이더를 찾는다.
 */
export function getRepositoryToken(entity: EntityTarget<ObjectLiteral>): string {
  const name = typeof entity === 'function' ? entity.name : String(entity);
  return `${name}Repository`;
}

/** 엔티티별 Repository 프로바이더. ALL_ENTITIES에 등록된 17개가 자동으로 생성된다. */
const repositoryProviders: Provider[] = ALL_ENTITIES.map((entity) => ({
  provide: getRepositoryToken(entity),
  inject: [DATA_SOURCE],
  useFactory: (dataSource: DataSource): Repository<ObjectLiteral> =>
    dataSource.getRepository(entity),
}));

/**
 * DataSource를 클래스 토큰으로도 주입받을 수 있게 한다.
 * 이게 없으면 `constructor(private ds: DataSource)`가 조용히 실패한다 —
 * @nestjs/typeorm이 제공하던 것과 같은 편의다.
 */
const dataSourceAlias: Provider = { provide: DataSource, useExisting: DATA_SOURCE };

const dataSourceProvider: Provider = {
  provide: DATA_SOURCE,
  useFactory: async (): Promise<DataSource> => {
    const dataSource = new DataSource(dataSourceOptions);
    return dataSource.initialize();
  },
};

/**
 * DB 연결과 리포지토리 주입.
 *
 * @nestjs/typeorm을 쓰지 않는 이유: 최신 TypeORM(1.x)을 지원하는 래퍼 버전이 ESM 전용이라
 * CJS로 빌드되는 이 프로젝트에서 로드되지 않는다. 래퍼가 제공하는 건 forRoot/forFeature와
 * @InjectRepository 정도라, 그만큼을 여기서 직접 구성하고 최신 ORM을 쓴다.
 *
 * 스키마 변경은 마이그레이션으로만 이뤄진다 (synchronize: false).
 */
@Global()
@Module({
  providers: [dataSourceProvider, dataSourceAlias, ...repositoryProviders],
  exports: [DATA_SOURCE, DataSource, ...ALL_ENTITIES.map(getRepositoryToken)],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DATA_SOURCE) private readonly dataSource: DataSource) {}

  /** Cloud Run이 인스턴스를 내릴 때 커넥션을 정리한다. */
  async onApplicationShutdown(): Promise<void> {
    if (this.dataSource?.isInitialized) {
      await this.dataSource.destroy();
    }
  }
}
