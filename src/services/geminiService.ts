import { GoogleGenAI, Type } from '@google/genai';
import { GenerationMode, ImageType, TextMode, Language, CommercialTone, SceneStrictness } from '../types';
import { ProductFingerprint } from '../types/product';

const getConfiguredApiKey = (): string | null => {
  const importMetaEnv = (import.meta as any).env || {};
  const processEnv = typeof process !== 'undefined' && process.env ? process.env : undefined;
  const rawValue =
    importMetaEnv.VITE_GEMINI_API_KEY ||
    processEnv?.API_KEY ||
    processEnv?.GEMINI_API_KEY ||
    null;

  if (!rawValue) {
    return null;
  }

  const normalizedValue = String(rawValue).trim().replace(/^['"]|['"]$/g, '');
  return normalizedValue || null;
};

export const hasConfiguredGeminiApiKey = (): boolean => !!getConfiguredApiKey();

export const getCurrentGeminiApiKeyLast4 = (): string | null => {
  const apiKey = getConfiguredApiKey();
  return apiKey ? apiKey.slice(-4) : null;
};

const getMissingApiKeyMessage = () =>
  "API Key is missing. Please set VITE_GEMINI_API_KEY in your .env file.";

const isLocationUnsupportedError = (error: any): boolean => {
  const errorMessage = error?.message?.toLowerCase() || '';

  return (
    errorMessage.includes('user location is not supported for the api use') ||
    (errorMessage.includes('failed_precondition') && errorMessage.includes('location')) ||
    (errorMessage.includes('failed_precondition') && errorMessage.includes('region'))
  );
};

const getLocationUnsupportedMessage = () =>
  'Current network exit region is not supported for Gemini API use. This is a location/IP restriction, not an API key quota issue, so switching to another Gemini key usually will not help. Please check the public IP location of your current network or server. If your network is already in a supported country/region, this may be an IP geolocation mismatch on Google\'s side.';

const withGeminiClient = async <T>(
  _operationName: string,
  executor: (ai: GoogleGenAI) => Promise<T>
): Promise<T> => {
  const apiKey = getConfiguredApiKey();
  if (!apiKey) {
    throw new Error(getMissingApiKeyMessage());
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    return await executor(ai);
  } catch (error: any) {
    if (isLocationUnsupportedError(error)) {
      throw new Error(getLocationUnsupportedMessage());
    }
    throw error;
  }
};

const withRequestTimeout = async <T>(
  timeoutMs: number,
  timeoutMessage: string,
  executor: (signal: AbortSignal) => Promise<T>
): Promise<T> => {
  const controller = new AbortController();

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      executor(controller.signal),
      timeoutPromise,
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

export interface ImageRequestBehavior {
  timeoutMs?: number;
  maxRetries?: number;
}

export const generateStructuredJson = async (
  prompt: string,
  imagesBase64: { data: string, mimeType: string }[],
  schema: any,
  useFlash: boolean = false
): Promise<any> => {
  const parts: any[] = [];
  imagesBase64.forEach((img, index) => {
    parts.push({ text: `Image ${index + 1}:` });
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
  });
  parts.push({ text: prompt });

  const modelName = useFlash ? "gemini-3-flash-preview" : "gemini-3.1-pro-preview";
  const timeoutMs = useFlash ? 30000 : 60000;

  const response = await withGeminiClient(`Structured JSON (${modelName})`, async (ai) => {
    return withRequestTimeout(
      timeoutMs,
      `Structured analysis timed out after ${timeoutMs / 1000} seconds. Please try again.`,
      (signal) => ai.models.generateContent({
        model: modelName,
        contents: { parts },
        config: {
          responseMimeType: "application/json",
          responseSchema: schema,
          httpOptions: {
            signal,
          } as any,
        },
      })
    );
  });

  const jsonStr = response.text?.trim() || '{}';
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error("Failed to parse JSON response:", jsonStr);
    throw new Error("Failed to parse structured JSON from Gemini");
  }
};

export const fetchImageAsBase64 = async (rawUrl: string): Promise<{ data: string, mimeType: string }> => {
  if (!rawUrl) throw new Error("URL is empty");

  let url = rawUrl.trim();

  // Handle data URLs directly
  if (url.startsWith('data:')) {
    const commaIndex = url.indexOf(',');
    if (commaIndex === -1) {
      throw new Error("Failed to process data URL");
    }

    const header = url.slice(0, commaIndex);
    const data = url.slice(commaIndex + 1);
    const mimeMatch = header.match(/^data:([^;]+)(;base64)?$/i);

    if (!mimeMatch || !data) {
      throw new Error("Failed to process data URL");
    }

    return {
      data,
      mimeType: mimeMatch[1],
    };
  }

  // Auto-prepend https:// if missing protocol (e.g., starts with www. or //)
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = url.startsWith('//') ? 'https:' + url : 'https://' + url;
  }

  try {
    new URL(url);
  } catch {
    throw new Error("Invalid URL format");
  }

  // Strictly encode URL to handle special characters like !, *, &, = in QQ URLs
  const strictEncodeURIComponent = (str: string) => {
    return encodeURIComponent(str).replace(/[!'()*]/g, function(c) {
      return '%' + c.charCodeAt(0).toString(16).toUpperCase();
    });
  };

  const encodedUrl = strictEncodeURIComponent(url);

  const fetchWithRetry = async (targetUrl: string, retries = 2): Promise<Blob> => {
    for (let i = 0; i <= retries; i++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000 + i * 2000);
      try {
        const response = await fetch(targetUrl, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        if (!blob.type.startsWith('image/')) throw new Error('Not an image');
        return blob;
      } catch (e) {
        clearTimeout(timeoutId);
        if (i === retries) throw e;
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i))); // exponential backoff
      }
    }
    throw new Error('Unreachable');
  };

  try {
    // Try direct fetch first
    const blob = await fetchWithRetry(url, 2);
    return await blobToBase64(blob);
  } catch (directError) {
    console.warn("Direct fetch failed, trying proxies...", directError);
    // Fallback to proxies
    const endpoints = [
      `https://wsrv.nl/?url=${encodedUrl}`,
      `https://api.allorigins.win/raw?url=${encodedUrl}`
    ];
    
    try {
      const blob = await Promise.any(endpoints.map(ep => fetchWithRetry(ep, 1)));
      return await blobToBase64(blob);
    } catch (proxyError) {
      throw new Error(`Failed to load image. Ensure the URL is publicly accessible and is a valid image.`);
    }
  }
};

export const blobToBase64 = (blob: Blob): Promise<{ data: string, mimeType: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    const timeoutId = setTimeout(() => {
      reader.abort();
      reject(new Error("FileReader timeout"));
    }, 15000);

    reader.onload = () => {
      clearTimeout(timeoutId);
      try {
        const base64data = reader.result as string;
        if (!base64data) {
          throw new Error("Failed to read blob as base64");
        }
        const [header, data] = base64data.split(',');
        const mimeType = header.split(':')[1].split(';')[0];
        resolve({ data, mimeType });
      } catch (e) {
        reject(e);
      }
    };
    
    reader.onerror = () => {
      clearTimeout(timeoutId);
      reject(reader.error || new Error("FileReader error"));
    };
    
    reader.onabort = () => {
      clearTimeout(timeoutId);
      reject(new Error("FileReader aborted"));
    };
    
    try {
      reader.readAsDataURL(blob);
    } catch (e) {
      clearTimeout(timeoutId);
      reject(e);
    }
  });
};

export const generateProductImage = async (
  productBase64: { data: string, mimeType: string },
  refBase64: { data: string, mimeType: string } | null,
  supplementalProductBase64: { data: string, mimeType: string }[] = [],
  prompt: string,
  aspectRatio: string = "1:1",
  imageSize: string = "1K",
  imageIndex?: number,
  totalImages?: number,
  textMode?: TextMode,
  requestBehavior?: ImageRequestBehavior
): Promise<{ url: string, prompt: string }> => {
  const parts: any[] = [];
  const systemInstruction = "ROLE: You are a high-precision commercial product image generation system, specializing in faithful product reproduction and realistic environment placement. Your primary goal is to preserve the subject product's identity perfectly while placing it in a clean, believable context. This is a STRICT PRODUCT-FAITHFULNESS task, not a creative redesign task.\n\n";

  let indexInstruction = "";
  if (imageIndex !== undefined && totalImages !== undefined && totalImages > 1) {
    indexInstruction = `\n\nCRITICAL VARIATION INSTRUCTION: The user has requested a total of ${totalImages} images. YOU ARE CURRENTLY GENERATING IMAGE NUMBER ${imageIndex}. If the user's instructions specify different designs, backgrounds, or styles for each image (e.g., "Image 1 should be X, Image 2 should be Y"), you MUST strictly follow the specific instructions for IMAGE ${imageIndex}. If they did not specify distinct instructions per image, please provide a unique variation for image ${imageIndex}.`;
  }

  parts.push({ text: "--- SUBJECT PRODUCT (MAIN VIEW) ---\n" });
  parts.push({ inlineData: { mimeType: productBase64.mimeType, data: productBase64.data } });

  if (supplementalProductBase64.length > 0) {
    parts.push({ text: "\n--- SUBJECT PRODUCT (ADDITIONAL VIEWS) ---\n" });
    supplementalProductBase64.forEach((img, i) => {
      parts.push({ text: `View ${i + 1}:` });
      parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
    });
  }

  if (refBase64) {
    parts.push({ text: "\n--- REFERENCE IMAGE (SCENE & COMPOSITION) ---\n" });
    parts.push({ inlineData: { mimeType: refBase64.mimeType, data: refBase64.data } });
  }
  
  parts.push({ text: `\n--- INSTRUCTIONS ---\n${prompt}${indexInstruction}` });

  const imageModelName = 'gemini-3-pro-image-preview';
  const maxRetries = requestBehavior?.maxRetries ?? 1;

  return withGeminiClient(`Image generation (${imageModelName})`, async (ai) => {
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      let timeoutMs = requestBehavior?.timeoutMs;
      if (!timeoutMs) {
        timeoutMs = 60000;
        if (imageSize === '2K') {
          timeoutMs = 90000;
        } else if (imageSize === '4K') {
          timeoutMs = 120000;
        }
      }

      try {
        // Keep all retries on the higher-fidelity Pro image model.
        const modelName = imageModelName;
        
        // Pro image model does not support 512px, so normalize it to 1K.
        let effectiveImageSize = imageSize;
        if (imageSize === '512px') {
          effectiveImageSize = '1K';
        }

        const config: any = {
          systemInstruction,
          imageConfig: {
            aspectRatio: aspectRatio as any,
            imageSize: effectiveImageSize as any
          }
        };

        console.log(`Generating image (Attempt ${attempt + 1}) using ${modelName}...`);
        
        const response = await withRequestTimeout(
          timeoutMs,
          `Image generation timed out after ${timeoutMs / 1000} seconds. The server might be overloaded. Please try again.`,
          (signal) => ai.models.generateContent({
            model: modelName,
            contents: {
              parts
            },
            config: {
              ...config,
              httpOptions: {
                signal
              }
            }
          })
        );

          let textResponse = '';
          for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
              return {
                url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
                prompt: prompt + indexInstruction
              };
            } else if (part.text) {
              textResponse += part.text;
            }
          }
          
          const finishReason = response.candidates?.[0]?.finishReason;
          if (finishReason === 'SAFETY') {
            throw new Error("生成失败：触发了安全策略 (SAFETY)。请检查提示词或参考图是否包含违规内容。");
          } else if (textResponse) {
            if (textMode === 'render_text') {
              throw new Error(`TEXT_RENDER_FAILED: ${textResponse}`);
            }
            throw new Error(`生成失败：模型返回了文本而非图片 - "${textResponse}"`);
          }
          
          if (response.promptFeedback?.blockReason) {
             throw new Error(`生成失败：请求被拦截 - 原因: ${response.promptFeedback.blockReason}`);
          }
          
          console.error("No image generated. Full response:", JSON.stringify(response, null, 2));
          throw new Error("No image generated");
    } catch (error: any) {
      lastError = error;
      const errorMessage = error.message?.toLowerCase() || '';
      
      if (error.message?.includes('TEXT_RENDER_FAILED') && textMode === 'render_text') {
        console.warn(`Attempt ${attempt + 1} failed to render text.`);
      }
      
      const isTimeout = errorMessage.includes('timed out') || errorMessage.includes('timeout');
      const is429 = errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('rate limit');
      const isQuota429 = is429 && (
        errorMessage.includes('quota') ||
        errorMessage.includes('insufficient_quota') ||
        errorMessage.includes('quota exceeded') ||
        errorMessage.includes('exceeded your current quota') ||
        errorMessage.includes('resource_exhausted') ||
        errorMessage.includes('billing') ||
        errorMessage.includes('daily limit') ||
        errorMessage.includes('per day')
      );
      const isRateLimited429 = is429 && !isQuota429 && (
        errorMessage.includes('rate limit') ||
        errorMessage.includes('too many requests') ||
        errorMessage.includes('requests per minute') ||
        errorMessage.includes('per minute') ||
        errorMessage.includes('per second')
      );
      const is503 = errorMessage.includes('503') || errorMessage.includes('504') || errorMessage.includes('overloaded');
      const is500 = errorMessage.includes('500') || errorMessage.includes('internal server error');
      const isNetwork =
        errorMessage.includes('failed to fetch') ||
        errorMessage.includes('fetch failed') ||
        errorMessage.includes('network error') ||
        errorMessage.includes('econnreset');
      
      const isRetryable = isTimeout || is429 || is503 || is500 || isNetwork;

      if (isRetryable && attempt < maxRetries) {
        console.warn(`Attempt ${attempt + 1} failed with a temporary error. Retrying with ${imageModelName}...`, error.message);
        await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
      } else {
        let finalMessage = error.message || '生成图片失败';
        
        if (isTimeout) {
          finalMessage = `图片生成超过 ${timeoutMs / 1000} 秒仍未返回，可能是当前请求较复杂、网络较慢或服务繁忙。建议先改用『预留加字位置』、降低图片复杂度，或稍后重试。`;
        } else if (isQuota429) {
          finalMessage = '当前 API Key 已达到配额上限或额度已用尽 (429)。请检查配额/账单设置，或更换可用的 Key 后再试。';
        } else if (isRateLimited429) {
          finalMessage = '当前请求触发了限流 (429)。请稍等片刻后再试，避免短时间内连续重试。';
        } else if (is429) {
          finalMessage = '当前请求被 Gemini 拒绝并返回 429。可能是限流，也可能是配额不足；请稍后再试，若持续出现请检查当前 Key 的配额。';
        } else if (is503) {
          finalMessage = '当前服务繁忙或过载 (503/504)。请稍后重试。';
        } else if (is500) {
          finalMessage = '服务器内部错误 (500)。这通常是暂时性的，请稍后再试。';
        } else if (isNetwork) {
          finalMessage = '网络连接异常，请检查您的网络设置后重试。';
        }

        if (textMode === 'render_text') {
          finalMessage += '\n提示：图片文案会直接尝试渲染到图中；如果持续失败，建议缩短文案或稍后重试。';
        }

        console.error(`Attempt ${attempt + 1} failed with error:`, finalMessage);
        throw new Error(finalMessage);
      }
    }

    }

    throw lastError;
  });
};

export const editGeneratedImageLocally = async (
  baseImageBase64: { data: string, mimeType: string },
  productBase64: { data: string, mimeType: string },
  supplementalProductBase64: { data: string, mimeType: string }[] = [],
  prompt: string,
  aspectRatio: string = "1:1",
  imageSize: string = "1K",
  requestBehavior?: ImageRequestBehavior
): Promise<{ url: string, prompt: string }> => {
  const limitedSupplementalProductBase64 = supplementalProductBase64.slice(0, 1);
  const parts: any[] = [];
  const systemInstruction = [
    "ROLE: You are a commercial product image editor.",
    "The first image is the current base image to edit.",
    "The user's local edit request is the highest-priority instruction for this task.",
    "The final image must visibly reflect the requested edit. Returning an unchanged or nearly unchanged image is a failed edit.",
    "Keep the same product identity and keep the overall scene, framing, and composition close to the current image.",
    "Prefer the smallest local adjustment that satisfies the user's request while leaving the rest of the image naturally consistent.",
    "Do not turn the result into a brand-new concept, a different product, or a full scene redesign unless the user explicitly asks for that.",
  ].join(' ') + "\n\n";

  parts.push({ text: "--- BASE IMAGE TO EDIT (LOCK THIS IMAGE) ---\n" });
  parts.push({ inlineData: { mimeType: baseImageBase64.mimeType, data: baseImageBase64.data } });

  parts.push({ text: "\n--- ORIGINAL PRODUCT REFERENCE (MUST STILL MATCH) ---\n" });
  parts.push({ inlineData: { mimeType: productBase64.mimeType, data: productBase64.data } });

  if (limitedSupplementalProductBase64.length > 0) {
    parts.push({ text: "\n--- OPTIONAL SUPPLEMENTAL PRODUCT REFERENCE VIEW ---\n" });
    limitedSupplementalProductBase64.forEach((img, i) => {
      parts.push({ text: `Reference View ${i + 1}:` });
      parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
    });
  }

  parts.push({ text: `\n--- LOCAL EDIT INSTRUCTIONS ---\n${prompt}` });

  const imageModelName = 'gemini-3-pro-image-preview';
  const maxRetries = requestBehavior?.maxRetries ?? 1;
  const effectiveImageSize = '1K';
  const timeoutMs = requestBehavior?.timeoutMs ?? 45000;
  const logPrefix = '[local-edit-service]';

  return withGeminiClient(`Local image edit (${imageModelName})`, async (ai) => {
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const attemptNumber = attempt + 1;
      const requestStartedAt = Date.now();

      try {
        const config: any = {
          systemInstruction,
          imageConfig: {
            aspectRatio: aspectRatio as any,
            imageSize: effectiveImageSize as any
          },
        };

        console.log(`${logPrefix} attempt ${attemptNumber}/${maxRetries + 1} start`, {
          aspectRatio,
          requestedImageSize: imageSize,
          effectiveImageSize,
          supplementalReferenceCount: limitedSupplementalProductBase64.length,
          promptLength: prompt.length,
        });

        const response = await withRequestTimeout(
          timeoutMs,
          `Local image edit exceeded ${timeoutMs / 1000} seconds without a response. Please simplify the adjustment and try again.`,
          (signal) => ai.models.generateContent({
            model: imageModelName,
            contents: {
              parts
            },
            config: {
              ...config,
              httpOptions: {
                signal
              }
            }
          })
        );

        console.log(`${logPrefix} attempt ${attemptNumber}/${maxRetries + 1} response received`, {
          durationMs: Date.now() - requestStartedAt,
          candidateCount: response.candidates?.length || 0,
          blockReason: response.promptFeedback?.blockReason || null,
        });

        if (response.promptFeedback?.blockReason) {
          throw new Error(`Local edit request was blocked by Gemini: ${response.promptFeedback.blockReason}.`);
        }

        const primaryCandidate = response.candidates?.[0];
        const finishReason = primaryCandidate?.finishReason;
        if (finishReason === 'SAFETY') {
          throw new Error('Local edit was blocked by Gemini safety filtering. Please simplify the request and try again.');
        }

        console.log(`${logPrefix} attempt ${attemptNumber}/${maxRetries + 1} response parsing start`);

        let textResponse = '';
        for (const part of primaryCandidate?.content?.parts || []) {
          if (part.inlineData) {
            console.log(`${logPrefix} attempt ${attemptNumber}/${maxRetries + 1} response parsing end`, {
              durationMs: Date.now() - requestStartedAt,
              result: 'image',
            });
            return {
              url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
              prompt
            };
          }

          if (part.text) {
            textResponse += part.text;
          }
        }

        if (textResponse.trim()) {
          const previewText = textResponse.trim().slice(0, 300);
          throw new Error(`Local edit returned text instead of an image. Model text: "${previewText}"`);
        }

        throw new Error(`Local edit finished without returning an edited image${finishReason ? ` (finishReason: ${finishReason})` : ''}.`);
      } catch (error: any) {
        lastError = error;
        const errorMessage = error.message?.toLowerCase() || '';

        const isTimeout = errorMessage.includes('timed out') || errorMessage.includes('timeout');
        const is429 = errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('rate limit');
        const isQuota429 = is429 && (
          errorMessage.includes('quota') ||
          errorMessage.includes('insufficient_quota') ||
          errorMessage.includes('quota exceeded') ||
          errorMessage.includes('exceeded your current quota') ||
          errorMessage.includes('resource_exhausted') ||
          errorMessage.includes('billing') ||
          errorMessage.includes('daily limit') ||
          errorMessage.includes('per day')
        );
        const isRateLimited429 = is429 && !isQuota429 && (
          errorMessage.includes('rate limit') ||
          errorMessage.includes('too many requests') ||
          errorMessage.includes('requests per minute') ||
          errorMessage.includes('per minute') ||
          errorMessage.includes('per second')
        );
        const is503 = errorMessage.includes('503') || errorMessage.includes('504') || errorMessage.includes('overloaded');
        const is500 = errorMessage.includes('500') || errorMessage.includes('internal server error');
        const isNetwork =
          errorMessage.includes('failed to fetch') ||
          errorMessage.includes('fetch failed') ||
          errorMessage.includes('network error') ||
          errorMessage.includes('econnreset') ||
          errorMessage.includes('network connection') ||
          errorMessage.includes('load failed');
        const isRetryable = isTimeout || is429 || is503 || is500 || isNetwork;

        if (isRetryable && attempt < maxRetries) {
          console.warn(`${logPrefix} attempt ${attemptNumber}/${maxRetries + 1} retrying`, {
            reason: error.message || String(error),
            durationMs: Date.now() - requestStartedAt,
          });
          await new Promise(resolve => setTimeout(resolve, 2000 * attemptNumber));
          continue;
        }

        let finalMessage = error.message || 'Failed to edit image locally';

        if (isTimeout) {
          finalMessage = `Local image edit exceeded ${timeoutMs / 1000} seconds without a response. Please simplify the adjustment and try again later.`;
        } else if (isQuota429) {
          finalMessage = 'Current API Key has reached its quota limit for image editing/generation (429). Please check quota or switch to another key.';
        } else if (isRateLimited429) {
          finalMessage = 'The local image edit request hit a rate limit (429). Please wait a moment before trying again.';
        } else if (is429) {
          finalMessage = 'The local image edit request was rejected with 429. This may be rate limiting or insufficient quota.';
        } else if (is503) {
          finalMessage = 'The image editing service is currently busy (503/504). Please try again shortly.';
        } else if (is500) {
          finalMessage = 'The image editing service returned an internal error (500). Please try again later.';
        } else if (isNetwork) {
          finalMessage = 'A network error occurred while editing the image. Please check your connection and try again.';
        }

        console.error(`${logPrefix} final error`, {
          attempt: attemptNumber,
          durationMs: Date.now() - requestStartedAt,
          reason: finalMessage,
        });
        throw new Error(finalMessage);
      }
    }

    throw lastError;
  });
};

export const normalizeCopyText = async (text: string, targetLanguage?: Language): Promise<string> => {
  if (!text) return text;

  const trimmedText = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n');

  if (!trimmedText) return '';

  const shouldTranslate = !!targetLanguage && targetLanguage !== 'auto' && targetLanguage !== 'multi';
  const prompt = shouldTranslate
    ? `
    Translate the following marketing copy into the target language, then lightly format it for clean product-image typography.
    Preserve the original meaning and keep the wording concise.
    You may normalize spacing, punctuation, capitalization, and line breaks.
    If the copy contains multiple clauses, you may split it into 1-3 short lines.
    Target Language: ${targetLanguage === 'en' ? 'English' : targetLanguage === 'zh' ? 'Chinese' : targetLanguage}
    
    Original Copy:
    "${trimmedText}"
    
    Return ONLY the final text, without quotes, explanations, or markdown.
  `
    : `
    Format the following marketing copy for direct rendering inside a product image.
    Keep the EXACT same language as the original text. Do NOT translate.
    Preserve the original meaning and keep the wording concise.
    You may normalize spacing, punctuation, capitalization, and line breaks.
    If the copy contains multiple clauses, you may split it into 1-3 short lines for better typography.
    
    Original Copy:
    "${trimmedText}"
    
    Return ONLY the final text, without quotes, explanations, or markdown.
  `;

  const response = await withGeminiClient('Copy normalization (gemini-3-flash-preview)', async (ai) => {
    return withRequestTimeout(
      20000,
      'Copy normalization timed out. Please try again.',
      (signal) => ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          httpOptions: {
            signal,
          } as any,
        },
      })
    );
  });
  
  return response.text?.trim() || trimmedText;
};

export interface BuildPromptOptions {
  productTitle?: string;
  copyText?: string;
  sizeInstruction?: string;
  hasRefImage?: boolean;
  customPrompt?: string;
  fingerprint?: ProductFingerprint;
  
  // 新增的结构化参数
  mode?: GenerationMode;
  imageType?: ImageType;
  textMode?: TextMode;
  language?: Language;
  preserveProductText?: boolean;
  commercialTone?: CommercialTone;
  sceneStrictness?: SceneStrictness;
}

const getCategorySignalText = (options: BuildPromptOptions): string => {
  return [
    options.fingerprint?.category,
    options.fingerprint?.productSummary,
    options.productTitle
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
};

const signalIncludesAny = (signal: string, keywords: string[]): boolean => {
  return keywords.some(keyword => signal.includes(keyword));
};

const isVacuumCategory = (options: BuildPromptOptions): boolean => {
  const signal = getCategorySignalText(options);
  return signalIncludesAny(signal, [
    'vacuum',
    'vacuum cleaner',
    'stick vacuum',
    'cordless vacuum',
    'upright vacuum',
    'handheld vacuum'
  ]);
};

const isProjectorCategory = (options: BuildPromptOptions): boolean => {
  const signal = getCategorySignalText(options);
  return signalIncludesAny(signal, [
    'projector',
    'portable projector',
    'mini projector',
    'smart projector',
    'home projector',
    'beam projector'
  ]);
};

const getCategorySpecificConstraintLines = (options: BuildPromptOptions): string[] => {
  const lines: string[] = [];

  if (isVacuumCategory(options)) {
    lines.push(
      "\n=== 1.5 VACUUM CATEGORY HARD CONSTRAINTS ===",
      "- CATEGORY-SPECIFIC LOCK: This product is a vacuum cleaner / stick vacuum. Preserve the exact motor housing, dust bin or dust cup, handle geometry, wand/tube proportions, connector joints, floor head shape, wheel layout, brush housing, and visible buttons.",
      "- Do NOT convert the product into a different vacuum family, brand language, or generic stick-vacuum silhouette.",
      "- Do NOT redesign the top unit, cyclone housing, rear body, trigger area, battery area, or floor brush head to look slimmer, more premium, or more futuristic.",
      "- If the product is shown standing in a room, it must still be the exact uploaded vacuum. Do NOT invent a dock, wall mount, support frame, balancing mechanism, or self-standing geometry unless it is already visible in the uploaded product views.",
      "- Show exactly ONE complete vacuum unit only, unless this is an explicit comparison request.",
      "- PEOPLE AND PETS ARE ALLOWED as lifestyle context, but they must remain supporting elements. They must not block the vacuum, overlap key product structure, or visually compete with the product as the hero subject."
    );
  }

  if (isProjectorCategory(options)) {
    lines.push(
      "\n=== 1.5 PROJECTOR CATEGORY HARD CONSTRAINTS ===",
      "- CATEGORY-SPECIFIC LOCK: This product is a projector. Preserve the exact chassis proportions, corner shape, lens position and size, vent layout, button placement, feet or stand geometry, color blocking, and all visible ports or openings.",
      "- Do NOT redesign the projector into a different form factor such as a cube projector, cylindrical projector, ultra-short-throw projector, or a generic minimalist box if that is not what was uploaded.",
      "- Do NOT invent a new kickstand, gimbal, tripod mount, carrying handle, fabric wrap, speaker grille pattern, or side panel structure unless those elements are clearly visible in the uploaded product views.",
      "- If a projected image or screen is shown, it is only environmental context. The projector body itself must remain the exact uploaded product and must not be altered to better fit the room scene.",
      "- Show exactly ONE complete projector unit only, unless this is an explicit comparison request.",
      "- PEOPLE ARE ALLOWED in the lifestyle scene, but they must stay secondary to the product. Keep the projector unobstructed and structurally unchanged."
    );
  }

  return lines;
};

export const buildPrompt = (options: BuildPromptOptions): string => {
  const promptLines: string[] = [];

  // 1. 核心约束：商品忠实度 (Highest Priority - Product Faithfulness)
  promptLines.push(
    "=== 1. STRICT PRODUCT-FAITHFULNESS TASK (HIGHEST PRIORITY) ===",
    "- This is a STRICT PRODUCT-FAITHFULNESS task, NOT a creative redesign task.",
    "- The final image MUST look like the exact same uploaded product placed into a new but believable commercial context.",
    "- Only change the background, lighting, framing, and surrounding environment.",
    "- STRICT PROHIBITION: DO NOT redesign, reinterpret, enhance, restyle, or reconstruct the product itself.",
    "- DO NOT change the product's body design, structure, proportions, materials, colors, controls, screen, attachments, buttons, or visible physical details.",
    "- DO NOT add a second subject. Do NOT create a collage or split-view layout.",
    "- CRITICAL: You MUST preserve the exact identity of the subject product provided in the reference image.",
    "- The main product image and all supplemental product images describe the same exact physical product.",
    "- All visible details across all product views must be preserved.",
    "- Supplemental views must resolve ambiguity from the main image.",
    "- Do not invent, simplify, or replace product structure when supplemental views already define it."
  );

  // 1.1 商品指纹数据 (Product Fingerprint Data)
  if (options.fingerprint) {
    const fp = options.fingerprint;
    promptLines.push("\n=== 1.1 PRODUCT FINGERPRINT DATA (MUST EXACTLY MATCH) ===");
    
    if (fp.category) promptLines.push(`- Category: ${fp.category}`);
    if (fp.productSummary) promptLines.push(`- Product Summary: ${fp.productSummary}`);

    // Colors
    const primaryColors = fp.colors.filter(c => c.area === 'primary' && c.mustPreserve).map(c => c.name).join(', ');
    const secondaryColors = fp.colors.filter(c => c.area === 'secondary' && c.mustPreserve).map(c => c.name).join(', ');
    const accentColors = fp.colors.filter(c => c.area === 'accent' && c.mustPreserve).map(c => c.name).join(', ');
    
    if (primaryColors) promptLines.push(`- Primary Colors: ${primaryColors}`);
    if (secondaryColors) promptLines.push(`- Secondary Colors: ${secondaryColors}`);
    if (accentColors) promptLines.push(`- Accent Colors: ${accentColors}`);

    // Materials
    const materials = fp.materials.filter(m => m.mustPreserve).map(m => `${m.name}${m.finish ? ` (${m.finish} finish)` : ''} at ${m.location}`).join(', ');
    if (materials) promptLines.push(`- Materials & Finishes: ${materials}`);

    // Structure
    promptLines.push(`- Overall Shape: ${fp.structure.overallShape}`);
    if (fp.structure.proportions) promptLines.push(`- Proportions: ${fp.structure.proportions}`);
    if (fp.structure.keyParts && fp.structure.keyParts.length > 0) {
      promptLines.push(`- Key Parts: ${fp.structure.keyParts.join(', ')}`);
    }
    if (fp.structure.visibleControls && fp.structure.visibleControls.length > 0) {
      promptLines.push(`- Visible Controls/Interfaces: ${fp.structure.visibleControls.join(', ')}`);
    }
    if (fp.structure.openings && fp.structure.openings.length > 0) {
      promptLines.push(`- Openings/Ports: ${fp.structure.openings.join(', ')}`);
    }
    if (fp.structure.distinctiveFeatures && fp.structure.distinctiveFeatures.length > 0) {
      promptLines.push(`- Distinctive Features: ${fp.structure.distinctiveFeatures.join(', ')}`);
    }

    // Logo
    if (fp.logo.hasLogo && fp.logo.mustPreserve) {
      promptLines.push(`- Logo: Positioned at ${fp.logo.position}, text: "${fp.logo.text || 'N/A'}", color: ${fp.logo.color || 'N/A'}, shape: ${fp.logo.shape || 'N/A'}`);
    }

    // Accessories
    const accessories = fp.accessories.filter(a => a.mustPreserve).map(a => `${a.count}x ${a.name} at ${a.position} (${a.attached ? 'attached' : 'detached'})`).join(', ');
    if (accessories) promptLines.push(`- Accessories: ${accessories}`);

    // Forbidden Changes
    if (fp.forbiddenChanges && fp.forbiddenChanges.length > 0) {
      promptLines.push("- FORBIDDEN CHANGES:");
      fp.forbiddenChanges.forEach(change => promptLines.push(`  * DO NOT ${change}`));
    }
  }

  // 1.2 单主体构图约束 (Single-Subject Composition)
  const allowComparisonLayout = options.imageType === 'comparison';

  if (allowComparisonLayout) {
    promptLines.push(
      "\n=== 1.2 COMPARISON COMPOSITION LOCK ===",
      "- Comparison layouts are allowed for this request.",
      "- If you use split views or side-by-side panels, every visible product depiction MUST still represent the same uploaded product faithfully.",
      "- Do NOT introduce unrelated product variants, competitor products, or invented alternates.",
      "- Keep the comparison layout clean, intentional, and easy to understand.",
      "- Do NOT add extra inset panels or duplicate product fragments unless they directly support the requested comparison."
    );
  } else {
    promptLines.push(
      "\n=== 1.2 SINGLE-SUBJECT COMPOSITION LOCK ===",
      "- Show exactly ONE complete product unit only.",
      "- Do NOT create a second copy of the product.",
      "- Do NOT create alternate-angle duplicates.",
      "- Do NOT add inset close-up panels.",
      "- Do NOT create collage layouts or split-view compositions.",
      "- Do NOT add floating feature panels that contain duplicate product parts.",
      "- Do NOT add extra hand-held demo views or secondary product views."
    );
  }

  if (options.preserveProductText) {
    promptLines.push(
      "\n=== 1.3 TEXT PRESERVATION ===",
      "- TEXT PRESERVATION: DO NOT alter, translate, or remove any logos, labels, or printed text already present on the product itself."
    );
  } else {
    promptLines.push(
      "\n=== 1.3 TEXT MODIFICATION ===",
      "- TEXT MODIFICATION: You are allowed to creatively modify or integrate text on the product if it suits the commercial scene."
    );
  }

  // 1.4 用户指定的商品保留指令 (User-Specified Product Preservation)
  if (options.customPrompt) {
    const preservationKeywords = ['must preserve', 'do not change', 'structure', 'material', 'logo', 'accessory', 'button', 'handle', 'port', 'wheel', 'frame', '保留', '不要改变', '结构', '材质', '配件', '按钮', '把手', '接口', '轮子', '框架', '细节', 'detail'];
    const hasPreservation = preservationKeywords.some(k => options.customPrompt!.toLowerCase().includes(k));
    if (hasPreservation) {
      promptLines.push(
        "\n=== 1.4 USER-SPECIFIED PRODUCT PRESERVATION ===",
        `- CRITICAL USER PRESERVATION INSTRUCTION: "${options.customPrompt}"`,
        "- The user has explicitly requested to preserve specific product features. These instructions are HARD CONSTRAINTS.",
        "- Promote these instructions to the highest priority product-faithfulness level."
      );
    }
  }

  const categorySpecificConstraintLines = getCategorySpecificConstraintLines(options);
  if (categorySpecificConstraintLines.length > 0) {
    promptLines.push(...categorySpecificConstraintLines);
  }

  // 2. 任务与场景指令 (Task & Scene Instructions)
  promptLines.push("\n=== 2. TASK & SCENE INSTRUCTIONS ===");
  promptLines.push(
    "- REAL-WORLD GROUNDING: The final scene must feel commercially useful, concrete, and immediately understandable.",
    "- Avoid abstract conceptual art, surreal props, symbolic floating geometry, fantasy architecture, smoke-only atmospheres, empty luxury voids, or decorative podium scenes unless the user explicitly asks for them.",
    "- Prefer believable environments, grounded surfaces, realistic contact shadows, and props that directly support the product's real use case.",
    "- If the intended use scene is unclear, default to a practical e-commerce composition that a customer could plausibly imagine in real life."
  );
  if (options.fingerprint?.productSummary || options.fingerprint?.category) {
    promptLines.push(
      `- CATEGORY FIT: Any scene, prop, and environment must clearly fit this product: ${options.fingerprint?.productSummary || options.fingerprint?.category}.`
    );
  }
  
  if (options.productTitle) {
    promptLines.push(
      "[SELLING POINT & SCENE INTENT]",
      `- SCENE INTENT: The scene must clearly express the following selling point: "${options.productTitle}"`,
      "- Ensure the composition, lighting, and props highlight this specific feature or use case in a direct, concrete, non-symbolic way.",
      "- Show a believable usage context or environment that helps a shopper immediately understand where and how the product is used.",
      "- CRITICAL: This selling point is for INTERNAL GUIDANCE ONLY. DO NOT render this text on the image.",
      "- This input may affect composition, scene, layout, product emphasis, camera angle, lighting, props, or text placement strategy, but it MUST NEVER be rendered as visible text."
    );
  }
  
  // Reference Image Logic (Scene Transfer) - WEAKENED SCENE PRIORITY
  if (options.hasRefImage) {
    promptLines.push(
      "[REFERENCE IMAGE INSTRUCTIONS - SCENE & STYLE TRANSFER]",
      "- Use the reference image as the source for: ENVIRONMENT, BACKGROUND, LIGHTING MOOD, and GENERAL CAMERA STYLE.",
      "- COMPOSITION: Adapt the composition to fit the true product structure. Do NOT force an exact placeholder replacement if it distorts the product.",
      "- HARD RULE: If reference composition conflicts with product identity, product faithfulness MUST win. Prioritize preserving the exact uploaded product over matching the placeholder object in the reference scene.",
      "- LIGHTING: Replicate the light direction, intensity, shadows, and reflections from the reference image onto the SUBJECT PRODUCT.",
      "- ATMOSPHERE: Match the color temperature, depth of field (bokeh), and overall visual mood of the reference image.",
      "- STRICT PROHIBITION: The product/object in the reference image is a placeholder ONLY. DO NOT use any of its physical features, brand, or design details.",
      "- GOAL: The final result must look like the SUBJECT PRODUCT was physically present in the general location and lighting of the reference image."
    );
  }

  // Mode handling
  const mode = options.mode || (options.hasRefImage ? 'background_transfer' : 'infographic_listing');
  switch (mode) {
    case 'background_transfer':
      if (options.hasRefImage) {
        promptLines.push("- TASK: Precise Scene Transfer. Seamlessly integrate the subject product into the environment shown in the reference image.");
      } else {
        promptLines.push("- TASK: Background Transfer. Create a realistic, grounded commercial environment for the product, not an abstract backdrop.");
      }
      break;
    case 'style_inspiration':
      promptLines.push("- TASK: Style Inspiration. Use the reference image ONLY for color palette and lighting mood. Create a realistic, restrained, retail-ready scene layout.");
      break;
    case 'strict_layout_match':
      promptLines.push("- TASK: Strict Layout Match. Replicate the composition and camera angle of the reference image, replacing the original subject with our SUBJECT PRODUCT without altering the product.");
      break;
    case 'lifestyle_listing':
      promptLines.push("- TASK: Realistic Lifestyle Listing. Create a clean, restrained, believable real-world use-case context that directly matches how a customer would use the product.");
      break;
    case 'infographic_listing':
      promptLines.push("- TASK: Infographic/Detail Scene. Create a clean, structured, but still grounded product-demo scene. Use believable surfaces or environments that explain the product clearly; avoid surreal podiums or abstract luxury staging.");
      break;
    default:
      promptLines.push("- TASK: Clean Product Photography. Create a high-quality, realistic, and commercially believable scene.");
  }

  // Image Type
  promptLines.push("\n=== IMAGE TYPE & LAYOUT ===");
  switch (options.imageType) {
    case 'detail':
      promptLines.push("- SCENE TYPE: Macro / close-up product photography.");
      promptLines.push("- FOCUS: Highlight the texture, structure, materials, and fine details of the product in a realistic close-up, not a stylized abstract crop.");
      break;
    case 'comparison':
      promptLines.push("- SCENE TYPE: Comparison layout.");
      promptLines.push("- LAYOUT: Side-by-side layout showing clear differentiation.");
      promptLines.push("- NOTE: This is the ONLY mode where multiple subjects or split views are allowed.");
      break;
    case 'banner':
      promptLines.push("- SCENE TYPE: Wide commercial banner.");
      promptLines.push("- LAYOUT: Horizontal layout emphasis with significant negative space for text placement.");
      break;
    case 'main':
      promptLines.push("- SCENE TYPE: Clean white or studio background.");
      promptLines.push("- LAYOUT: Centered product, highly professional e-commerce main image with grounded shadows and realistic lighting.");
      break;
    case 'lifestyle':
    default:
      promptLines.push("- SCENE TYPE: Realistic lifestyle photography with natural lighting and depth of field.");
      break;
  }

  // Scene Strictness
  if (options.sceneStrictness === 'strict') {
    promptLines.push("- SCENE STRICTNESS: High. Minimalist but realistic background, no distracting props, focus entirely on the product.");
  } else if (options.sceneStrictness === 'loose') {
    promptLines.push("- SCENE STRICTNESS: Loose. You may add logical, clean, and complementary props that support a believable usage scenario without distracting from the product.");
  }

  // Size instruction
  if (options.sizeInstruction) {
    promptLines.push(`- COMPOSITION: ${options.sizeInstruction}`);
  }

  // 3. 商业摄影与克制 (Commercial Photography & Restraint)
  promptLines.push(
    "\n=== 3. COMMERCIAL PHOTOGRAPHY & RESTRAINT ===",
    "- STYLE: High-end commercial photography.",
    "- LIGHTING: Professional studio lighting (e.g., softbox, rim lighting, key light).",
    "- RESTRAINT: Avoid chaotic, messy, or overly busy backgrounds.",
    "- REALISM: Favor believable retail-ready photography over artistic interpretation.",
    "- QUALITY: Photorealistic, 8k resolution, sharp focus on the product, clean textures.",
    "- FAILURE PROTECTION: If uncertain about a product detail, preserve the original subject exactly as it appears instead of inventing details."
  );

  if (options.commercialTone === 'premium' || options.commercialTone === 'luxury') {
    promptLines.push("- TONE: Premium, luxury, minimalist, sophisticated, but still physically believable and commercially practical.");
  } else if (options.commercialTone === 'clean' || options.commercialTone === 'tech') {
    promptLines.push("- TONE: Clean, technical, high-precision, modern, and grounded in real product use.");
  } else if (options.commercialTone === 'natural') {
    promptLines.push("- TONE: Natural, organic, soft, approachable, and realistic rather than dreamy or symbolic.");
  }

  // 4. 文字与排版 (Text & Typography)
  promptLines.push("\n=== 4. TEXT & TYPOGRAPHY (CRITICAL) ===");
  promptLines.push("- CRITICAL RULE: The ONLY text allowed to be rendered on the image is the exact text specified in the 'TEXT CONTENT' field below (if any).");
  promptLines.push("- DO NOT render any other instruction, explanation, note, prompt, selling point, or supplemental text onto the image.");
  promptLines.push("- Ignore the language of internal instructions; they are guidance only, not display text.");
  promptLines.push("- If internal instructions are written in Chinese, do NOT place Chinese text onto the image unless that exact Chinese text is provided in the 'TEXT CONTENT' field.");

  const textMode = options.textMode || (options.copyText?.trim() ? 'render_text' : 'none');
  if (textMode === 'render_text' && options.copyText) {
    promptLines.push(
      "- TASK: RENDER TEXT ON IMAGE.",
      `- TEXT CONTENT: "${options.copyText.trim()}"`,
      "- Render the text exactly as provided above, preserving its language and line breaks.",
      "- PLACEMENT: Integrate the text clearly into the layout.",
      "- LEGIBILITY: Ensure the text is legible."
    );
    if (options.language && options.language !== 'auto' && options.language !== 'multi') {
      promptLines.push(`- LANGUAGE: Render the text in [${options.language.toUpperCase()}].`);
    }
  } else {
    promptLines.push("- Do NOT add any promotional text, slogans, labels, or watermarks to the background.");
  }

  // 5. 其他用户指令 (Additional User Instructions)
  if (options.customPrompt) {
    promptLines.push("\n=== 5. ADDITIONAL USER INSTRUCTIONS (INTERNAL GUIDANCE ONLY) ===");
    promptLines.push("- INTERPRETATION RULE: Follow the user's custom request below according to its actual meaning.");
    promptLines.push("- Do NOT assume this request always means 'change the scene'. It could be about lighting, tone, composition, or specific product features.");
    promptLines.push(`- USER REQUEST: "${options.customPrompt}"`);
    promptLines.push("- CRITICAL: This request is an ADDITION. It MUST NOT override the CORE PRODUCT FAITHFULNESS (Rule 1). Do NOT change the product's body design or details.");
    promptLines.push("- CRITICAL: This request is for INTERNAL GUIDANCE ONLY. DO NOT render this text on the image.");
    promptLines.push("- These instructions may affect composition, scene, layout, product emphasis, camera angle, lighting, props, or text placement strategy, but they MUST NEVER be rendered as visible text.");
  }

  return promptLines.join('\n');
};

export const parseAspectRatio = (sizeStr: string): string => {
  const normalizedSize = sizeStr.replace(/\*/g, 'x').replace(/:/g, 'x').replace(/\s+/g, '').trim().toLowerCase();
  
  // Check if it's a direct match for supported ratios
  const supportedRatios = ['16:9', '9:16', '4:3', '3:4', '1:4', '4:1', '1:8', '8:1', '1:1'];
  const formattedAsRatio = normalizedSize.replace('x', ':');
  if (supportedRatios.includes(formattedAsRatio)) {
    return formattedAsRatio;
  }

  // Check if it's a resolution like 1000x1500
  const match = normalizedSize.match(/^(\d+)x(\d+)$/);
  if (match) {
    const w = parseInt(match[1], 10);
    const h = parseInt(match[2], 10);
    if (w > 0 && h > 0) {
      const ratio = w / h;
      // Map to closest supported ratio
      const ratioMap = [
        { val: 16/9, str: '16:9' },
        { val: 9/16, str: '9:16' },
        { val: 4/3, str: '4:3' },
        { val: 3/4, str: '3:4' },
        { val: 1/4, str: '1:4' },
        { val: 4/1, str: '4:1' },
        { val: 1/8, str: '1:8' },
        { val: 8/1, str: '8:1' },
        { val: 1, str: '1:1' }
      ];
      
      let closest = ratioMap[0];
      let minDiff = Math.abs(ratio - closest.val);
      for (let i = 1; i < ratioMap.length; i++) {
        const diff = Math.abs(ratio - ratioMap[i].val);
        if (diff < minDiff) {
          minDiff = diff;
          closest = ratioMap[i];
        }
      }
      return closest.str;
    }
  }
  
  return '1:1';
};

export const getSizeInstruction = (sizeStr: string): string => {
  const normalizedSize = sizeStr.replace(/\*/g, 'x').replace(/\s+/g, '').trim();
  if (/^\d+x\d+$/i.test(normalizedSize)) {
    return `Target image size: ${normalizedSize}.`;
  } else if (normalizedSize) {
    return `Target aspect/size requirement: ${normalizedSize}.`;
  } else {
    return 'Target image should use a square 1:1 layout.';
  }
};
