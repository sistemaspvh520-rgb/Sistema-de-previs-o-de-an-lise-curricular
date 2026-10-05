/**
 * StorageService — abstração de armazenamento de documentos.
 * Implementações: sistema de arquivos local (dev) e Supabase Storage (produção).
 */
export interface StorageService {
  save(bytes: Buffer, opts: { extension: string; prefix?: string }): Promise<{ key: string; sizeBytes: number }>;
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  /** Lista os arquivos de um prefixo (um nível), com a data de criação — usado para localizar arquivos órfãos. */
  list(prefix: string): Promise<Array<{ key: string; createdAt: Date }>>;
}
