import { execFileSync } from 'child_process';
import { env } from '../config/env';

let proxyConfigured = false;

const ensureProxyProtocol = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  if (/^[a-z]+:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `http://${trimmed}`;
};

const parseWindowsProxyServer = (rawValue: string) => {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return '';
  }

  const segments = trimmed.split(';').map(item => item.trim()).filter(Boolean);
  const httpsSegment = segments.find(item => /^https=/i.test(item));
  const httpSegment = segments.find(item => /^http=/i.test(item));
  const selected = httpsSegment || httpSegment || segments[0];
  const proxyTarget = selected.includes('=') ? selected.split('=').slice(1).join('=').trim() : selected;
  return ensureProxyProtocol(proxyTarget);
};

const readWindowsInternetProxy = () => {
  if (process.platform !== 'win32') {
    return '';
  }

  try {
    const rawOutput = execFileSync(
      'reg',
      ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings', '/v', 'ProxyServer'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const match = rawOutput.match(/ProxyServer\s+REG_\w+\s+([^\r\n]+)/i);
    return match ? parseWindowsProxyServer(match[1]) : '';
  } catch {
    return '';
  }
};

const resolveProxyUrl = () => {
  const explicitProxy =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    '';

  return ensureProxyProtocol(explicitProxy) || readWindowsInternetProxy();
};

export const configureNetworkProxy = async () => {
  if (proxyConfigured) {
    return;
  }

  const proxyUrl = resolveProxyUrl();
  if (!proxyUrl) {
    proxyConfigured = true;
    return;
  }

  process.env.HTTPS_PROXY = process.env.HTTPS_PROXY || proxyUrl;
  process.env.HTTP_PROXY = process.env.HTTP_PROXY || proxyUrl;
  process.env.NO_PROXY = process.env.NO_PROXY || '127.0.0.1,localhost';

  try {
    const { ProxyAgent, setGlobalDispatcher } = require('undici') as typeof import('undici');
    setGlobalDispatcher(new ProxyAgent(proxyUrl));
    proxyConfigured = true;
    console.info(`[network-proxy] outbound proxy enabled via ${proxyUrl}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[network-proxy] failed to initialize proxy agent: ${message}`);
  }
};

export const getResolvedProxyUrl = () => resolveProxyUrl();
export const getOpenAiBaseUrl = () => process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1';
export const getGoogleBaseUrl = () =>
  process.env.GOOGLE_BASE_URL?.trim() || 'https://generativelanguage.googleapis.com';
export const getConfiguredModelSummary = () => ({
  imageGenerationModel: env.geminiImageModel,
  imageVerificationModel: env.geminiVerificationModel,
  fingerprintAnalysisModel: env.openAiAnalysisModel,
  identityAnalysisModel: env.openAiIdentityModel,
});
