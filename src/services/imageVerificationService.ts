import { generateStructuredJson } from './geminiService';
import { ProductFingerprint, VerificationResult, VerificationIssue } from '../types/product';
import { Type } from '@google/genai';
import { ImageType } from '../types';

export interface VerificationOptions {
  targetOutputLanguage?: string;
  imageType?: ImageType;
  expectedCopyText?: string;
}

export const verifyGeneratedImage = async (
  generatedImageBase64: { data: string, mimeType: string },
  originalFingerprint: ProductFingerprint,
  mainImageBase64: { data: string, mimeType: string },
  supplementalImagesBase64: { data: string, mimeType: string }[] = [],
  options: VerificationOptions = {}
): Promise<VerificationResult> => {
  const images = [generatedImageBase64, mainImageBase64, ...supplementalImagesBase64];
  const { targetOutputLanguage, imageType, expectedCopyText } = options;
  const allowComparisonLayout = imageType === 'comparison';
  const shouldCheckCopyText = !!expectedCopyText?.trim();
  
  const languageCheckInstruction = targetOutputLanguage 
    ? `9. Language Match: If there is any text rendered on the product or in the scene, does it appear to be in the requested target language (${targetOutputLanguage})? If no text was requested or rendered, this passes.` 
    : '';

  const textConsistencyInstruction = shouldCheckCopyText
    ? `10. Text Content Match: Promotional text was requested. Does the visible rendered marketing text closely match the expected copy text "${expectedCopyText!.trim()}"? Preserve brand names, numbers, core wording, and meaning. Minor line-break differences are acceptable, but missing words, spelling errors, incorrect numerals, altered meaning, or substituted claims must fail this check.`
    : '';

  const subjectCheckInstruction = allowComparisonLayout
    ? '1. Subject Consistency: If the generated image intentionally uses comparison panels or split views, do all visible product depictions still represent the same original product without unrelated duplicates?'
    : '1. Single Subject: Is there exactly ONE complete product unit? (No duplicates, no collages, no inset panels).';

  const collageCheckInstruction = allowComparisonLayout
    ? '7. Composition Integrity: If comparison panels or split views are used, are they intentional, clean, and limited to the same product rather than accidental collage noise?'
    : '7. No Collage: Is the image a single, unified scene without split views or collages?';

  const comparisonModeInstruction = allowComparisonLayout
    ? 'Intentional comparison layouts are allowed in this task, but every visible product depiction must still match the same original product and must not introduce unrelated variants.'
    : '';

  const prompt = `
    You are an expert product image verifier. Your task is to strictly evaluate the FIRST image (the generated image) against the SUBSEQUENT images (the original product reference images) AND the provided original product fingerprint.
    
    Original Product Fingerprint:
    ${JSON.stringify(originalFingerprint, null, 2)}
    
    Evaluate the generated image and determine if it faithfully represents the original product WITHOUT ANY unwanted alterations.
    ${comparisonModeInstruction}
    
    Check the following:
    ${subjectCheckInstruction}
    2. Color Match: Do the primary and secondary colors match the original fingerprint and reference images?
    3. Structure Match: Is the overall shape, key parts, and proportions identical to the original reference images?
    4. Accessory Match: Are the accessories identical in count and position?
    5. Logo Match: Is the logo present, correctly positioned, and unaltered compared to the reference images?
    6. Material Match: Do the materials look identical to the original?
    ${collageCheckInstruction}
    8. No Extra Parts: Are there any hallucinated or extra parts that were not in the original?
    ${languageCheckInstruction}
    ${textConsistencyInstruction}
    
    Provide a detailed assessment, a score from 0 to 100, and a final pass/fail verdict.
    If the image fails any critical check (e.g., structure altered, extra subject added), it MUST fail the overall verification.
    If promotional text was requested, include the text you can read from the image in "detectedText".
  `;

  const schema = {
    type: Type.OBJECT,
    properties: {
      passed: { type: Type.BOOLEAN },
      score: { type: Type.NUMBER },
      subjectCount: { type: Type.NUMBER },
      checks: {
        type: Type.OBJECT,
        properties: {
          singleSubject: { type: Type.BOOLEAN },
          colorMatch: { type: Type.BOOLEAN },
          structureMatch: { type: Type.BOOLEAN },
          accessoryMatch: { type: Type.BOOLEAN },
          logoMatch: { type: Type.BOOLEAN },
          materialMatch: { type: Type.BOOLEAN },
          noCollage: { type: Type.BOOLEAN },
          noExtraParts: { type: Type.BOOLEAN },
          ...(targetOutputLanguage ? { languageMatch: { type: Type.BOOLEAN } } : {}),
          ...(shouldCheckCopyText ? { textContentMatch: { type: Type.BOOLEAN } } : {})
        },
        required: [
          'singleSubject',
          'colorMatch',
          'structureMatch',
          'accessoryMatch',
          'logoMatch',
          'materialMatch',
          'noCollage',
          'noExtraParts',
          ...(targetOutputLanguage ? ['languageMatch'] : []),
          ...(shouldCheckCopyText ? ['textContentMatch'] : [])
        ]
      },
      ...(shouldCheckCopyText ? { detectedText: { type: Type.STRING } } : {}),
      issues: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            type: { type: Type.STRING, enum: ['color', 'structure', 'accessory', 'logo', 'material', 'subjectCount', 'composition', 'language', 'text', 'other'] },
            description: { type: Type.STRING },
            severity: { type: Type.STRING, enum: ['high', 'medium', 'low'] }
          },
          required: ['type', 'description', 'severity']
        }
      },
      recommendations: { type: Type.ARRAY, items: { type: Type.STRING } }
    },
    required: ['passed', 'score', 'subjectCount', 'checks', ...(shouldCheckCopyText ? ['detectedText'] : []), 'issues', 'recommendations']
  };

  return await generateStructuredJson(prompt, images, schema, true) as VerificationResult;
};

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

export const summarizeVerificationFailures = (result: VerificationResult): string => {
  if (result.passed) return "Verification passed.";
  return result.issues.map(i => `[${i.severity.toUpperCase()}] ${i.type}: ${i.description}`).join('\n');
};
