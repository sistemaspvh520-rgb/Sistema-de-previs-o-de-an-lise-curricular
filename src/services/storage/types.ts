/**
 * StorageService — abstração de armazenamento de documentos.
 * Implementações: sistema de arquivos local (dev) e Supabase Storage (produção).
 */
export interface StorageService {
  save(bytes: Buffer, opts: { extension: string; prefix?: string }): Promise<{ key: string; sizeBytes: number }>;
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
