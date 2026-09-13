import 'reflect-metadata';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { config as loadDotenv } from 'dotenv';
import { ALL_ENTITIES } from './entities';

loadDotenv({ quiet: true });

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://muster:muster@localhost:5432/muster';

/**
 * 관리형 Postgres의 TLS.
 *
 * Supabase·Neon 같은 곳의 풀러는 **자체 CA로 서명한** 인증서를 쓴다. pg 8.x는
 * `sslmode=require`를 만나면 체인을 검증하는데, 공개 CA가 아니라서
 * `self-signed certificate in certificate chain`으로 연결이 거부된다.
 *
 * 두 갈래가 있고, 여기서는 **둘 다 열어 두되 안전한 쪽을 기본으로 시도한다**:
 *
 * 1. `DATABASE_CA_CERT`에 제공자의 CA 인증서(PEM)를 넣으면 그것으로 **검증한다**.
 *    암호화와 신원 확인이 모두 산다. 제공자 대시보드에서 받을 수 있다.
 * 2. 없으면 검증 없이 암호화만 한다. 트래픽은 보호되지만 **서버가 그 서버인지는 확인하지
 *    않는다** — 경로를 가로챌 수 있는 공격자가 DB를 사칭해 자격증명과 데이터를 받을 수 있다.
 *    실제로 그러려면 Cloud Run과 제공자 사이의 네트워크 경로를 장악해야 해서 문턱이 높지만,
 *    "없는 위험"은 아니다. 그래서 이 경로로 갈 때는 경고를 남긴다 — 조용히 낮아진 보안은
 *    낮아진 줄도 모르게 된다.
 *
 * 로컬 개발(도커 컴포즈)은 평문이라 TLS 자체를 쓰지 않는다.
 */
function sslOptions(): false | { ca: string } | { rejectUnauthorized: false } {
  const isLocal = /@(localhost|127\.0\.0\.1|db):/.test(DATABASE_URL);
  if (isLocal) return false;

  const ca = process.env.DATABASE_CA_CERT;
  if (ca !== undefined && ca.trim().length > 0) return { ca };

  console.warn(
    '[database] DATABASE_CA_CERT가 없어 TLS 인증서를 검증하지 않습니다. ' +
      '연결은 암호화되지만 서버 신원은 확인되지 않습니다. ' +
      '제공자의 CA 인증서를 DATABASE_CA_CERT에 넣으면 검증이 켜집니다.',
  );
  return { rejectUnauthorized: false };
}

/**
 * TypeORM CLI(마이그레이션 생성/실행)와 NestJS 런타임이 공유하는 접속 설정.
 *
 * synchronize는 어떤 환경에서도 켜지 않는다 — 스키마 변경은 전부 마이그레이션 파일로
 * 남아야 리뷰와 롤백이 가능하다.
 */
export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  url: DATABASE_URL,
  ssl: sslOptions(),
  entities: [...ALL_ENTITIES],
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  synchronize: false,
  logging: process.env.TYPEORM_LOGGING === 'true',
};

export default new DataSource(dataSourceOptions);
