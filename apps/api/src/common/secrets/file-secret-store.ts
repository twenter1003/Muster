import { Injectable, Logger } from '@nestjs/common';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import type { SecretStore } from './secret-store';

/**
 * 로컬 개발용 시크릿 저장소. 파일 하나당 시크릿 하나를 0600 권한으로 둔다.
 *
 * 프로덕션에서는 GCP Secret Manager 구현으로 교체한다 — 이 클래스는 배포 대상이 아니다.
 * 참조 형식을 `file://<name>`으로 두어, DB에 남은 참조만 봐도 어느 저장소에서 온 것인지 구분된다.
 */
@Injectable()
export class FileSecretStore implements SecretStore {
  private readonly logger = new Logger(FileSecretStore.name);
  private readonly dir: string;

  constructor(dir: string) {
    this.dir = resolve(dir);
  }

  async put(name: string, value: string): Promise<string> {
    const key = safeKey(name);
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    await writeFile(join(this.dir, key), value, { mode: 0o600 });
    return `file://${key}`;
  }

  async get(ref: string): Promise<string | null> {
    const key = this.keyFromRef(ref);
    if (!key) return null;

    try {
      return await readFile(join(this.dir, key), 'utf8');
    } catch {
      return null;
    }
  }

  async delete(ref: string): Promise<void> {
    const key = this.keyFromRef(ref);
    if (!key) return;
    await rm(join(this.dir, key), { force: true });
  }

  private keyFromRef(ref: string): string | null {
    if (!ref.startsWith('file://')) {
      this.logger.warn(`이 저장소가 발급하지 않은 참조입니다: ${ref}`);
      return null;
    }
    // 참조가 DB에서 오므로 경로 조작을 막기 위해 다시 정규화한다.
    return safeKey(ref.slice('file://'.length));
  }
}

/** 파일명에 쓸 수 없는 문자와 경로 구분자를 제거한다. */
function safeKey(name: string): string {
  return /^[A-Za-z0-9._-]+$/.test(name) && !name.includes('..')
    ? name
    : createHash('sha256').update(name).digest('hex');
}
