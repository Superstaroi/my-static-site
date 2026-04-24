import { ProductFingerprint, VerificationResult } from '../types/product';
import { ImageType } from '../types';
import { apiPost } from './api';
import { assertClientImagePayload, normalizeClientImageArray } from './geminiService';

export interface VerificationOptions {
  targetOutputLanguage?: string;
  imageType?: ImageType;
  expectedCopyText?: string;
  mustContain?: string[];
  mustNotContain?: string[];
}

export const verifyGeneratedImage = async (
  generatedImageBase64: { data: string; mimeType: string },
  originalFingerprint: ProductFingerprint,
  mainImageBase64: { data: string; mimeType: string },
  supplementalImagesBase64: { data: string; mimeType: string }[] = [],
  options: VerificationOptions = {},
  signal?: AbortSignal,
): Promise<VerificationResult> =>
  apiPost('/api/analyze/verify', {
    generatedImageBase64: assertClientImagePayload(generatedImageBase64, '生成图'),
    originalFingerprint,
    mainImageBase64: assertClientImagePayload(mainImageBase64, '主产品图'),
    supplementalImagesBase64: normalizeClientImageArray(supplementalImagesBase64, '补充产品图'),
    options,
  }, { signal });

export const isVerificationPassed = (result: VerificationResult): boolean => {
  const {
    singleSubject,
    colorMatch,
    structureMatch,
    accessoryMatch,
    logoMatch,
    materialMatch,
    noCollage,
    noExtraParts,
    languageMatch,
    textContentMatch,
  } = result.checks;

  const criticalChecks = [
    singleSubject,
    colorMatch,
    structureMatch,
    accessoryMatch,
    logoMatch,
    materialMatch,
    noCollage,
    noExtraParts,
    ...(languageMatch === undefined ? [] : [languageMatch]),
    ...(textContentMatch === undefined ? [] : [textContentMatch]),
  ];

  return result.passed && result.score >= 80 && criticalChecks.every(Boolean);
};

const buildLocalizedIssueSummary = (result: VerificationResult) => {
  const lines: string[] = [];
  const pushUnique = (message: string) => {
    const normalized = message.trim();
    if (normalized && !lines.includes(normalized)) {
      lines.push(normalized);
    }
  };

  if (!result.checks.singleSubject) {
    pushUnique('画面主体不完整或不止一个，请保持单画面、单主体，并完整展示同一件产品。');
  }

  if (!result.checks.noCollage) {
    pushUnique('画面出现了拼图、分屏、多宫格或小窗插图，请改为单张完整图片。');
  }

  if (!result.checks.structureMatch) {
    pushUnique('产品主体结构与上传图不一致，请保持原始轮廓、关键部件和连接关系。');
  }

  if (!result.checks.colorMatch || !result.checks.materialMatch) {
    pushUnique('产品颜色或材质与上传图不一致，请保持原始配色和材质分区。');
  }

  if (!result.checks.accessoryMatch || !result.checks.noExtraParts) {
    pushUnique('画面出现了上传图里没有的附件、支架、底座或额外部件，请去掉多余元素。');
  }

  if (!result.checks.logoMatch) {
    pushUnique('Logo 或品牌标记与上传图不一致，请保持原始品牌信息。');
  }

  if (result.checks.languageMatch === false) {
    pushUnique('图片中的文案语言不符合当前要求，请按指定语言输出。');
  }

  if (result.checks.textContentMatch === false) {
    pushUnique('图片中的文案内容与当前要求不一致，请按要求重新生成。');
  }

  if (lines.length > 0) {
    return lines;
  }

  const issueTypeMap: Record<string, string> = {
    color: '图片颜色与上传产品不一致，请保持原始配色。',
    material: '图片材质与上传产品不一致，请保持原始材质和表面处理。',
    structure: '图片结构与上传产品不一致，请保持原始轮廓和关键部件。',
    accessory: '图片出现了额外附件或错误配件，请移除多余元素。',
    logo: '图片中的 Logo 或品牌标记与上传产品不一致，请保持原始品牌信息。',
    subjectCount: '图片主体数量不正确，请保持单主体展示。',
    composition: '图片构图不符合要求，请保持单画面、非拼图构图。',
    language: '图片中的文案语言不符合要求，请按指定语言输出。',
    text: '图片中的文案内容与要求不一致，请重新生成。',
    other: '当前图片与上传产品不完全一致，请人工检查后重试。',
  };

  result.issues.forEach(issue => {
    pushUnique(issueTypeMap[issue.type] || issueTypeMap.other);
  });

  return lines;
};

export const summarizeVerificationFailures = (result: VerificationResult): string => {
  if (result.passed) {
    return '校验通过。';
  }

  if (!result.issues.length) {
    return '校验未通过，请检查图片与产品是否一致。';
  }

  const severityLabelMap: Record<'low' | 'medium' | 'high', string> = {
    low: '低',
    medium: '中',
    high: '高',
  };

  const localizedLines = buildLocalizedIssueSummary(result);
  if (localizedLines.length > 0) {
    return localizedLines
      .slice(0, 4)
      .map((line, index) => `【${index === 0 ? '高' : '中'}】${line}`)
      .join('\n');
  }

  return result.issues
    .map(issue => `【${severityLabelMap[issue.severity] || '中'}】${issue.description}`)
    .join('\n');
};
