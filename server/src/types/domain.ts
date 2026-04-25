export type UserRole = 'admin' | 'user';

export interface AuthUser {
  id: number;
  username: string;
  role: UserRole;
  isActive: boolean;
}

export interface UserRecord extends AuthUser {
  passwordHash: string;
  dailyLimit: number;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export interface QuotaSnapshot {
  dailyLimit: number;
  todayUsed: number;
  bonusQuota: number;
  remaining: number;
  resetAt: string;
}

export interface GenerationHistoryRecord {
  id: number;
  userId: number;
  previewUrl: string;
  originalUrl: string;
  sourceType: string | null;
  createdAt: string;
}

export interface ProductIdentityProfile {
  category: string;
  identitySummary: string;
  mustMatch: string[];
  forbiddenChanges: string[];
  confusionWarnings: string[];
  confidence: number;
}

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
