import "server-only";
import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";
import { decryptString, encryptString, parseMasterKey, type EncryptedPayload } from "@/services/crypto/aes-gcm";
import { OpenAIIntegrationError, OPENAI_ERROR_MESSAGES } from "@/services/openai/errors";

const AAD = "openai-integration:v1";

export const API_KEY_PATTERN = /^sk-[A-Za-z0-9_\-]{20,}$/;

function masterKey() {
  const env = getEnv();
  return parseMasterKey(env.APP_ENCRYPTION_KEY, env.APP_ENCRYPTION_KEY_VERSION);
}

export function isStructurallyValidApiKey(key: string): boolean {
  return API_KEY_PATTERN.test(key.trim());
}

export function lastFour(key: string): string {
  return key.trim().slice(-4);
}

/**
 * OpenAISecretService — único ponto de contato com a API Key.
 * Não existe (e não deve existir) nenhuma função que devolva a chave ao navegador.
 */
export const OpenAISecretService = {
  encryptApiKey(plain: string): EncryptedPayload {
    return encryptString(plain.trim(), masterKey(), AAD);
  },

  decryptApiKey(payload: EncryptedPayload): string {
    return decryptString(payload, masterKey(), AAD);
  },

  /** Persiste uma chave (primeira conexão). */
  async saveApiKey(plain: string, userId: string, labels?: { projectLabel?: string; serviceAccountLabel?: string }) {
    const enc = this.encryptApiKey(plain);
    await prisma.openAIIntegration.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        status: "CONNECTED",
        encryptedApiKey: enc.ciphertext,
        encryptionIv: enc.iv,
        encryptionAuthTag: enc.authTag,
        keyVersion: enc.keyVersion,
        apiKeyLastFour: lastFour(plain),
        projectLabel: labels?.projectLabel,
        serviceAccountLabel: labels?.serviceAccountLabel,
        lastTestedAt: new Date(),
        lastConnectionStatus: "OK",
        lastErrorCode: null,
        createdById: userId,
        updatedById: userId,
      },
      update: {
        status: "CONNECTED",
        encryptedApiKey: enc.ciphertext,
        encryptionIv: enc.iv,
        encryptionAuthTag: enc.authTag,
        keyVersion: enc.keyVersion,
        apiKeyLastFour: lastFour(plain),
        ...(labels?.projectLabel !== undefined ? { projectLabel: labels.projectLabel } : {}),
        ...(labels?.serviceAccountLabel !== undefined ? { serviceAccountLabel: labels.serviceAccountLabel } : {}),
        lastTestedAt: new Date(),
        lastConnectionStatus: "OK",
        lastErrorCode: null,
        updatedById: userId,
      },
    });
  },

  /** Substitui a chave atual por uma nova já validada. */
  async replaceApiKey(plain: string, userId: string) {
    await this.saveApiKey(plain, userId);
  },

  /** Remove a chave do sistema (não revoga na OpenAI). */
  async deleteApiKey(userId: string) {
    await prisma.openAIIntegration.update({
      where: { id: "default" },
      data: {
        status: "DISCONNECTED",
        encryptedApiKey: null,
        encryptionIv: null,
        encryptionAuthTag: null,
        keyVersion: null,
        apiKeyLastFour: null,
        lastConnectionStatus: null,
        lastErrorCode: null,
        updatedById: userId,
      },
    });
  },

  /** Devolve a chave em texto puro SOMENTE para uso no servidor, em memória. */
  async getApiKeyForServer(): Promise<string> {
    const integration = await prisma.openAIIntegration.findUnique({ where: { id: "default" } });
    if (
      !integration ||
      integration.status === "DISCONNECTED" ||
      !integration.encryptedApiKey ||
      !integration.encryptionIv ||
      !integration.encryptionAuthTag ||
      integration.keyVersion === null
    ) {
      throw new OpenAIIntegrationError("NOT_CONFIGURED", OPENAI_ERROR_MESSAGES.NOT_CONFIGURED);
    }
    return this.decryptApiKey({
      ciphertext: integration.encryptedApiKey,
      iv: integration.encryptionIv,
      authTag: integration.encryptionAuthTag,
      keyVersion: integration.keyVersion,
    });
  },
};
