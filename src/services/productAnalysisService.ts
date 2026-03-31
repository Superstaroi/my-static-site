import { generateStructuredJson } from './geminiService';
import { ProductFingerprint } from '../types/product';
import { Type } from '@google/genai';

export const fingerprintSchemaEn = {
  type: Type.OBJECT,
  properties: {
    category: { type: Type.STRING },
    productSummary: { type: Type.STRING },
    colors: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          hex: { type: Type.STRING },
          area: { type: Type.STRING, enum: ['primary', 'secondary', 'accent'] },
          mustPreserve: { type: Type.BOOLEAN }
        },
        required: ['name', 'area', 'mustPreserve']
      }
    },
    materials: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          location: { type: Type.STRING },
          finish: { type: Type.STRING },
          mustPreserve: { type: Type.BOOLEAN }
        },
        required: ['name', 'location', 'mustPreserve']
      }
    },
    structure: {
      type: Type.OBJECT,
      properties: {
        overallShape: { type: Type.STRING },
        keyParts: { type: Type.ARRAY, items: { type: Type.STRING } },
        proportions: { type: Type.STRING },
        visibleControls: { type: Type.ARRAY, items: { type: Type.STRING } },
        openings: { type: Type.ARRAY, items: { type: Type.STRING } },
        distinctiveFeatures: { type: Type.ARRAY, items: { type: Type.STRING } }
      },
      required: ['overallShape', 'keyParts', 'distinctiveFeatures']
    },
    accessories: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          count: { type: Type.NUMBER },
          position: { type: Type.STRING },
          attached: { type: Type.BOOLEAN },
          mustPreserve: { type: Type.BOOLEAN }
        },
        required: ['name', 'count', 'position', 'attached', 'mustPreserve']
      }
    },
    logo: {
      type: Type.OBJECT,
      properties: {
        hasLogo: { type: Type.BOOLEAN },
        text: { type: Type.STRING },
        position: { type: Type.STRING },
        color: { type: Type.STRING },
        shape: { type: Type.STRING },
        mustPreserve: { type: Type.BOOLEAN }
      },
      required: ['hasLogo', 'mustPreserve']
    },
    forbiddenChanges: { type: Type.ARRAY, items: { type: Type.STRING } },
    verifierChecklist: { type: Type.ARRAY, items: { type: Type.STRING } },
    confidence: { type: Type.NUMBER }
  },
  required: ['category', 'productSummary', 'colors', 'materials', 'structure', 'accessories', 'logo', 'forbiddenChanges', 'verifierChecklist', 'confidence']
};

export const fingerprintSchemaZh = {
  type: Type.OBJECT,
  properties: {
    类目: { type: Type.STRING },
    产品总结: { type: Type.STRING },
    颜色: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          名称: { type: Type.STRING },
          十六进制代码: { type: Type.STRING },
          区域: { type: Type.STRING, enum: ['主要', '次要', '点缀'] },
          必须保留: { type: Type.BOOLEAN }
        },
        required: ['名称', '区域', '必须保留']
      }
    },
    材质: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          名称: { type: Type.STRING },
          位置: { type: Type.STRING },
          表面处理: { type: Type.STRING },
          必须保留: { type: Type.BOOLEAN }
        },
        required: ['名称', '位置', '必须保留']
      }
    },
    结构: {
      type: Type.OBJECT,
      properties: {
        整体形状: { type: Type.STRING },
        关键部件: { type: Type.ARRAY, items: { type: Type.STRING } },
        比例: { type: Type.STRING },
        可见控件: { type: Type.ARRAY, items: { type: Type.STRING } },
        开口: { type: Type.ARRAY, items: { type: Type.STRING } },
        显著特征: { type: Type.ARRAY, items: { type: Type.STRING } }
      },
      required: ['整体形状', '关键部件', '显著特征']
    },
    配件: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          名称: { type: Type.STRING },
          数量: { type: Type.NUMBER },
          位置: { type: Type.STRING },
          已连接: { type: Type.BOOLEAN },
          必须保留: { type: Type.BOOLEAN }
        },
        required: ['名称', '数量', '位置', '已连接', '必须保留']
      }
    },
    标志: {
      type: Type.OBJECT,
      properties: {
        有标志: { type: Type.BOOLEAN },
        文本: { type: Type.STRING },
        位置: { type: Type.STRING },
        颜色: { type: Type.STRING },
        形状: { type: Type.STRING },
        必须保留: { type: Type.BOOLEAN }
      },
      required: ['有标志', '必须保留']
    },
    禁止变化项: { type: Type.ARRAY, items: { type: Type.STRING } },
    验证清单: { type: Type.ARRAY, items: { type: Type.STRING } },
    置信度: { type: Type.NUMBER }
  },
  required: ['类目', '产品总结', '颜色', '材质', '结构', '配件', '标志', '禁止变化项', '验证清单', '置信度']
};

export const analyzeProductFingerprint = async (
  mainImageBase64: { data: string, mimeType: string },
  supplementalImagesBase64: { data: string, mimeType: string }[] = []
): Promise<{ canonicalEn: ProductFingerprint, displayZh: any }> => {
  const prompt = `
    You are an expert product analyst. Your task is to extract a highly detailed, structured "Product Fingerprint" from the provided image(s).
    The first image is the main product image. Any following images are supplemental detail views of the EXACT SAME physical product.
    
    Combine all visible details across ALL provided views to create a comprehensive fingerprint. Supplemental views must be used to resolve ambiguity from the main image (e.g., fine structure, materials, accessories, logo placement, ports, buttons).
    
    Extract the following information with extreme precision:
    1. Category: The general category of the product.
    2. Product Summary: A concise description of what the product is.
    3. Colors: Identify primary, secondary, and accent colors. Include hex codes if possible.
    4. Materials: Identify the materials used in different parts of the product.
    5. Structure: Describe the overall shape, key parts, proportions, and distinctive features.
    6. Accessories: List any visible accessories or detachable parts.
    7. Logo: Identify if a logo is present, its text, position, color, and shape.
    8. Forbidden Changes: List critical visual elements that MUST NOT be altered during image generation (e.g., specific branding, unique structural curves, exact button placement).
    9. Verifier Checklist: Provide a list of yes/no questions to verify if a generated image faithfully represents this product.
    10. Confidence: A score from 0 to 100 indicating your confidence in this analysis.

    If you are uncertain about any detail, do not hallucinate. Lower your confidence score and omit the uncertain detail or mark it as uncertain.
    
    CRITICAL: You must return the EXACT same fingerprint data in TWO languages:
    1. "canonicalEn": The canonical English version for internal system use.
    2. "displayZh": The exact same data translated to Chinese for user display.
  `;

  const schema = {
    type: Type.OBJECT,
    properties: {
      canonicalEn: fingerprintSchemaEn,
      displayZh: fingerprintSchemaZh
    },
    required: ['canonicalEn', 'displayZh']
  };

  const images = [mainImageBase64, ...supplementalImagesBase64];
  const result = await generateStructuredJson(prompt, images, schema) as { canonicalEn: ProductFingerprint, displayZh: any };
  return result;
};

export const buildLockedFeatureSummary = (fingerprint: ProductFingerprint): string => {
  const lockedColors = fingerprint.colors.filter(c => c.mustPreserve).map(c => c.name).join(', ');
  const lockedMaterials = fingerprint.materials.filter(m => m.mustPreserve).map(m => m.name).join(', ');
  const lockedAccessories = fingerprint.accessories.filter(a => a.mustPreserve).map(a => a.name).join(', ');
  
  let summary = `Category: ${fingerprint.category}\n`;
  if (lockedColors) summary += `Locked Colors: ${lockedColors}\n`;
  if (lockedMaterials) summary += `Locked Materials: ${lockedMaterials}\n`;
  if (lockedAccessories) summary += `Locked Accessories: ${lockedAccessories}\n`;
  if (fingerprint.logo.hasLogo && fingerprint.logo.mustPreserve) summary += `Locked Logo: ${fingerprint.logo.text || 'Present'} at ${fingerprint.logo.position}\n`;
  
  return summary.trim();
};
