export interface ProductColor {
  name: string;
  hex?: string;
  area: 'primary' | 'secondary' | 'accent';
  mustPreserve: boolean;
}

export interface ProductMaterial {
  name: string;
  location: string;
  finish?: string;
  mustPreserve: boolean;
}

export interface ProductAccessory {
  name: string;
  count: number;
  position: string;
  attached: boolean;
  mustPreserve: boolean;
}

export interface ProductLogo {
  hasLogo: boolean;
  text?: string;
  position?: string;
  color?: string;
  shape?: string;
  mustPreserve: boolean;
}

export interface ProductStructure {
  overallShape: string;
  keyParts: string[];
  proportions?: string;
  visibleControls?: string[];
  openings?: string[];
  distinctiveFeatures: string[];
}

export interface ProductFingerprint {
  category: string;
  productSummary: string;
  colors: ProductColor[];
  materials: ProductMaterial[];
  structure: ProductStructure;
  accessories: ProductAccessory[];
  logo: ProductLogo;
  forbiddenChanges: string[];
  verifierChecklist: string[];
  confidence: number;
}

export interface VerificationIssue {
  type: 'color' | 'structure' | 'accessory' | 'logo' | 'material' | 'subjectCount' | 'composition' | 'language' | 'text' | 'other';
  description: string;
  severity: 'high' | 'medium' | 'low';
}

export interface VerificationResult {
  passed: boolean;
  score: number;
  subjectCount: number;
  checks: {
    singleSubject: boolean;
    colorMatch: boolean;
    structureMatch: boolean;
    accessoryMatch: boolean;
    logoMatch: boolean;
    materialMatch: boolean;
    noCollage: boolean;
    noExtraParts: boolean;
    languageMatch?: boolean;
    textContentMatch?: boolean;
  };
  detectedText?: string;
  issues: VerificationIssue[];
  recommendations: string[];
}
