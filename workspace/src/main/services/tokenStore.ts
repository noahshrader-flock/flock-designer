import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { StoredToken } from './github';

/**
 * Where the GitHub token lives.
 *
 * Encrypted with Electron's `safeStorage`, which uses the OS keychain for the
 * key, and written under the app's own user-data directory -- never into a
 * repository, and never into a file the renderer can read. The renderer has no
 * method that returns a token; it only ever learns whether someone is signed in.
 *
 * If the platform has no encryption available, nothing is written at all. A
 * token in plaintext on disk is worse than asking the person to sign in again.
 */

export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export class TokenStore {
  constructor(
    private readonly file: string,
    private readonly safeStorage: SafeStorageLike,
  ) {}

  static defaultPath(userDataDir: string): string {
    return join(userDataDir, 'github-token.enc');
  }

  readonly available = (): boolean => this.safeStorage.isEncryptionAvailable();

  read(): StoredToken | null {
    if (!existsSync(this.file) || !this.available()) {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(this.safeStorage.decryptString(readFileSync(this.file)));
      if (typeof parsed !== 'object' || parsed === null) {
        return null;
      }
      const token = parsed as StoredToken;
      return typeof token.accessToken === 'string' && typeof token.expiresAt === 'number' ? token : null;
    } catch {
      // A token we cannot decrypt is a token we do not have. Say so by returning
      // null; the person signs in again, which is the correct outcome.
      return null;
    }
  }

  write(token: StoredToken): void {
    if (!this.available()) {
      return;
    }
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, this.safeStorage.encryptString(JSON.stringify(token)), { mode: 0o600 });
  }

  clear(): void {
    rmSync(this.file, { force: true });
  }
}
