import { CommercialTone, DetailSetPlatform, GenerationMode, ImageType, SceneStrictness } from './types';
import { ProductFingerprint } from './types/product';

export interface DetailSetPlanItem {
  id: string;
  slot: number;
  title: string;
  description: string;
  aspectRatio: string;
  imageType: ImageType;
  mode: GenerationMode;
  commercialTone: CommercialTone;
  sceneStrictness: SceneStrictness;
  productTitle: string;
  copyText: string;
  customPrompt: string;
}

export const DETAIL_SET_PLATFORM_OPTIONS: { label: string; value: DetailSetPlatform }[] = [
  { label: 'Amazon', value: 'amazon' },
  { label: 'Temu', value: 'temu' },
  { label: 'Walmart', value: 'walmart' },
  { label: 'Shopify', value: 'shopify' },
];

const getProductName = (fingerprint?: ProductFingerprint | null): string => {
  return fingerprint?.productSummary || fingerprint?.category || 'the uploaded product';
};

const getCategory = (fingerprint?: ProductFingerprint | null): string => {
  return fingerprint?.category || 'product';
};

const getKeyParts = (fingerprint?: ProductFingerprint | null): string => {
  const parts = fingerprint?.structure?.keyParts?.filter(Boolean) || [];
  return parts.slice(0, 4).join(', ') || 'its core structure and visible details';
};

const getDistinctiveFeatures = (fingerprint?: ProductFingerprint | null): string => {
  const features = fingerprint?.structure?.distinctiveFeatures?.filter(Boolean) || [];
  return features.slice(0, 4).join(', ') || 'its distinctive physical features';
};

const getColorSummary = (fingerprint?: ProductFingerprint | null): string => {
  const colors = fingerprint?.colors?.filter(Boolean) || [];
  return colors.slice(0, 4).map(color => `${color.name} (${color.area})`).join(', ') || 'the original product color palette';
};

const getMaterialSummary = (fingerprint?: ProductFingerprint | null): string => {
  const materials = fingerprint?.materials?.filter(Boolean) || [];
  return materials.slice(0, 4).map(material => `${material.name} on ${material.location}`).join(', ') || 'the original material mix and finish';
};

const getAccessorySummary = (fingerprint?: ProductFingerprint | null): string => {
  const accessories = fingerprint?.accessories?.filter(Boolean) || [];
  return accessories.slice(0, 3).map(accessory => `${accessory.count}x ${accessory.name} at ${accessory.position}`).join(', ') || 'no unrelated extra accessories';
};

const getStructureSummary = (fingerprint?: ProductFingerprint | null): string => {
  const overallShape = fingerprint?.structure?.overallShape || 'the original overall silhouette';
  const keyParts = fingerprint?.structure?.keyParts?.slice(0, 4).join(', ');
  return keyParts ? `${overallShape} with ${keyParts}` : overallShape;
};

const getSceneProfile = (fingerprint?: ProductFingerprint | null) => {
  const searchText = `${fingerprint?.productSummary || ''} ${fingerprint?.category || ''}`.toLowerCase();

  if (/(projector|beamer|home theater|home cinema)/.test(searchText)) {
    return {
      heroEnvironment: 'a premium living-room or home-theater corner with projection glow softly visible in the background',
      usageEnvironment: 'a believable movie-night setup in a bedroom, lounge, or family media room',
      bannerEnvironment: 'a cinematic entertainment interior with visible depth, ambient lighting, and a polished media-space feel',
      lightingStyle: 'layered practical lighting, soft ambient spill, believable shadow falloff, and tasteful highlights on the lens and body',
      propStyling: 'restrained home-entertainment props such as a sofa, side table, remote, throw blanket, or popcorn kept secondary to the product',
      detailStyling: 'Let the lens glass, vent texture, seams, buttons, and ports catch controlled highlights with a premium macro feel',
      comparisonStyling: 'show one full hero angle plus one supporting close-up of the lens, side texture, or control area',
    };
  }

  if (/(lamp|light|lantern|lighting|night light|desk light|ceiling light)/.test(searchText)) {
    return {
      heroEnvironment: 'a refined interior corner where the lighting effect can visibly shape the surrounding space',
      usageEnvironment: 'a believable home setup such as a bedside table, reading nook, vanity, or dining area',
      bannerEnvironment: 'a layered interior scene where the product light creates atmosphere across foreground and background surfaces',
      lightingStyle: 'soft directional light, visible light bloom where appropriate, gentle shadows, and premium tonal separation',
      propStyling: 'small decor accents such as books, ceramics, linens, or framed art that support the lighting story without clutter',
      detailStyling: 'Emphasize glow quality, surface finish, edge transitions, and craftsmanship while keeping the product shape exact',
      comparisonStyling: 'show one lit context shot plus one closer angle of the lighting effect or product finish',
    };
  }

  if (/(coffee|espresso|kettle|blender|air fryer|toaster|cooker|kitchen|appliance)/.test(searchText)) {
    return {
      heroEnvironment: 'a premium kitchen or countertop scene with clear styling hierarchy and natural lived-in realism',
      usageEnvironment: 'an active but tidy food-prep or serving moment in a modern kitchen environment',
      bannerEnvironment: 'a wide kitchen composition with layered surfaces, premium materials, and a clear lifestyle story',
      lightingStyle: 'bright but dimensional daylight or studio-natural hybrid light with controlled reflections and clean shadows',
      propStyling: 'tasteful food ingredients, cups, utensils, boards, or linens that feel useful and category-relevant without stealing focus',
      detailStyling: 'Highlight knobs, lids, handles, spouts, texture, finishes, and join lines with tactile, high-clarity detail',
      comparisonStyling: 'show one main countertop view plus one supporting close-up of the key functional area',
    };
  }

  if (/(speaker|headphone|earbud|keyboard|mouse|monitor|router|camera|microphone|tech|electronic|device|gadget)/.test(searchText)) {
    return {
      heroEnvironment: 'a modern desk, studio, or lifestyle-tech environment with layered depth and subtle atmospheric polish',
      usageEnvironment: 'a believable work, gaming, music, or creator setup that matches the category',
      bannerEnvironment: 'a wide, premium tech scene with distinct foreground, subject, and background separation',
      lightingStyle: 'crisp directional key light, tasteful rim highlights, controlled reflections, and premium contrast without looking synthetic',
      propStyling: 'supporting tech or desk accessories such as notebooks, screens, cables, plants, or furniture used sparingly',
      detailStyling: 'Emphasize buttons, grills, finishes, edges, interfaces, ports, and precision manufacturing details',
      comparisonStyling: 'show one hero setup angle plus one close-up that makes the product engineering clearer',
    };
  }

  if (/(sofa|chair|table|shelf|cabinet|storage|furniture|home decor|decor)/.test(searchText)) {
    return {
      heroEnvironment: 'a thoughtfully styled interior that feels aspirational but still believable for daily living',
      usageEnvironment: 'a real home scenario where the product naturally supports organization, comfort, or decor',
      bannerEnvironment: 'a wide editorial home scene with foreground styling, clear depth, and layered interiors',
      lightingStyle: 'soft natural daylight or premium interior light with realistic shadow shaping and gentle contrast',
      propStyling: 'books, textiles, trays, ceramics, or small home accessories used in a restrained styling language',
      detailStyling: 'Highlight texture, stitching, seams, edge quality, grain, surfaces, and structural finish with tactile realism',
      comparisonStyling: 'show one styled room view plus one closer crop that demonstrates surface or structural quality',
    };
  }

  return {
    heroEnvironment: 'a premium, category-appropriate real-life environment with visible depth and richer set design',
    usageEnvironment: 'a believable real-world usage setting tailored to the product category',
    bannerEnvironment: 'a wide premium scene with layered foreground, subject, and background separation',
    lightingStyle: 'directional light, believable shadow gradients, subtle highlight control, and a polished commercial finish',
    propStyling: 'restrained category-relevant props that add context without clutter or distraction',
    detailStyling: 'Highlight texture, surface transitions, craftsmanship, and key product structures with a tactile close-up feel',
    comparisonStyling: 'show one wider faithful product view plus one supporting close-up that clarifies benefits',
  };
};

const getVisualIdentityNotes = (fingerprint?: ProductFingerprint | null): string => {
  const notes = [
    `Preserve the exact product structure: ${getStructureSummary(fingerprint)}.`,
    `Preserve the visible color palette: ${getColorSummary(fingerprint)}.`,
    `Preserve the material expression: ${getMaterialSummary(fingerprint)}.`,
    `Preserve accessory logic: ${getAccessorySummary(fingerprint)}.`,
  ];

  if (fingerprint?.logo?.hasLogo) {
    const logoText = fingerprint.logo.text ? `"${fingerprint.logo.text}"` : 'the original logo';
    const logoPosition = fingerprint.logo.position || 'its original position';
    notes.push(`Keep ${logoText} in ${logoPosition} with faithful scale, style, and placement.`);
  }

  return notes.join(' ');
};

const getSceneRichnessNotes = (sceneProfile: ReturnType<typeof getSceneProfile>): string => {
  return `Build clear foreground, subject, and background depth. Use ${sceneProfile.lightingStyle}. Add ${sceneProfile.propStyling}. Avoid flat, empty, or repetitive white-background outputs unless the shot is intentionally a close-up detail frame.`;
};

const appendGuidance = (basePrompt: string, globalGuidance?: string): string => {
  const guidance = (globalGuidance || '').trim();
  if (!guidance) {
    return basePrompt;
  }

  return `${basePrompt}\nAdditional global guidance for this detail set: ${guidance}`;
};

const buildAmazonPlan = (
  fingerprint?: ProductFingerprint | null,
  globalGuidance?: string
): DetailSetPlanItem[] => {
  const productName = getProductName(fingerprint);
  const category = getCategory(fingerprint);
  const keyParts = getKeyParts(fingerprint);
  const distinctiveFeatures = getDistinctiveFeatures(fingerprint);
  const sceneProfile = getSceneProfile(fingerprint);
  const visualIdentityNotes = getVisualIdentityNotes(fingerprint);
  const sceneRichnessNotes = getSceneRichnessNotes(sceneProfile);

  return [
    {
      id: 'amazon-hero',
      slot: 1,
      title: 'Hero Lifestyle',
      description: 'Clean hero scene that quickly explains what the product is and where it belongs.',
      aspectRatio: '3:4',
      imageType: 'lifestyle',
      mode: 'lifestyle_listing',
      commercialTone: 'premium',
      sceneStrictness: 'strict',
      productTitle: `Hero lifestyle showcase for ${productName}`,
      copyText: '',
      customPrompt: appendGuidance(
        `Create a highly usable Amazon hero detail image for ${category}. Show ${productName} as the clear hero product in ${sceneProfile.heroEnvironment}. Use a shopper-friendly three-quarter angle, premium set styling, and enough environmental storytelling to feel rich without becoming busy. ${sceneRichnessNotes} ${visualIdentityNotes} Make the product instantly understandable within one glance and keep the frame strongly conversion-oriented.`,
        globalGuidance
      ),
    },
    {
      id: 'amazon-detail',
      slot: 2,
      title: 'Structure Detail',
      description: 'Close-up view focused on product construction and signature physical details.',
      aspectRatio: '1:1',
      imageType: 'detail',
      mode: 'infographic_listing',
      commercialTone: 'tech',
      sceneStrictness: 'strict',
      productTitle: `Close-up structure detail for ${productName}`,
      copyText: '',
      customPrompt: appendGuidance(
        `Create a close-up Amazon commercial detail image focused on ${keyParts}. Use a tight but premium crop, clean background treatment, and high micro-contrast so the product feels sharper and more tactile than a flat studio render. ${sceneProfile.detailStyling}. ${visualIdentityNotes} Preserve exact materials, edges, buttons, openings, and all structural identity while keeping the image retail-ready.`,
        globalGuidance
      ),
    },
    {
      id: 'amazon-use-case',
      slot: 3,
      title: 'Use Scenario',
      description: 'Believable usage context tailored to the product category.',
      aspectRatio: '4:3',
      imageType: 'lifestyle',
      mode: 'lifestyle_listing',
      commercialTone: 'natural',
      sceneStrictness: 'loose',
      productTitle: `Real usage context for ${productName}`,
      copyText: '',
      customPrompt: appendGuidance(
        `Show ${productName} in ${sceneProfile.usageEnvironment} for a ${category}. Make the scene feel believable, lived-in, and visually distinct from the hero shot with more context, deeper layering, and a stronger sense of real use. ${sceneRichnessNotes} ${visualIdentityNotes} The product must remain dominant and never be obscured by the environment.`,
        globalGuidance
      ),
    },
    {
      id: 'amazon-material',
      slot: 4,
      title: 'Feature Focus',
      description: 'High-clarity shot that highlights texture, finish, and build quality.',
      aspectRatio: '1:1',
      imageType: 'detail',
      mode: 'infographic_listing',
      commercialTone: 'premium',
      sceneStrictness: 'strict',
      productTitle: `Build quality highlight for ${productName}`,
      copyText: '',
      customPrompt: appendGuidance(
        `Highlight the product's finish, craftsmanship, and material quality. Emphasize ${distinctiveFeatures}. Use a premium angle, rich surface contrast, and tactile detail rather than a plain centered packshot. ${sceneProfile.detailStyling}. ${visualIdentityNotes} Avoid abstract styling, but make the image feel more dimensional, premium, and commercially useful.`,
        globalGuidance
      ),
    },
    {
      id: 'amazon-banner',
      slot: 5,
      title: 'Wide Banner',
      description: 'Wide-format detail image suited for header sections or A+ style panels.',
      aspectRatio: '16:9',
      imageType: 'banner',
      mode: 'lifestyle_listing',
      commercialTone: 'premium',
      sceneStrictness: 'loose',
      productTitle: `Wide e-commerce banner for ${productName}`,
      copyText: '',
      customPrompt: appendGuidance(
        `Create a wide Amazon-ready banner composition for ${productName} in ${sceneProfile.bannerEnvironment}. Use cinematic width, clean negative space for future layout use, and richer environmental depth than a standard product card. ${sceneRichnessNotes} ${visualIdentityNotes} Keep the product visually dominant while avoiding an empty or lifeless composition.`,
        globalGuidance
      ),
    },
  ];
};

const buildTemuPlan = (
  fingerprint?: ProductFingerprint | null,
  globalGuidance?: string
): DetailSetPlanItem[] => {
  const productName = getProductName(fingerprint);
  const category = getCategory(fingerprint);
  const keyParts = getKeyParts(fingerprint);
  const sceneProfile = getSceneProfile(fingerprint);
  const visualIdentityNotes = getVisualIdentityNotes(fingerprint);
  const sceneRichnessNotes = getSceneRichnessNotes(sceneProfile);

  return [
    {
      id: 'temu-hero',
      slot: 1,
      title: 'Conversion Hero',
      description: 'Fast-reading hero shot designed for aggressive mobile commerce layouts.',
      aspectRatio: '3:4',
      imageType: 'lifestyle',
      mode: 'lifestyle_listing',
      commercialTone: 'premium',
      sceneStrictness: 'strict',
      productTitle: `Conversion-focused hero shot for ${productName}`,
      copyText: '',
      customPrompt: appendGuidance(
        `Create a high-clarity Temu-style hero image for ${productName}. The product should read instantly on mobile, but the scene should still feel rich, bright, and visually layered rather than plain. Place it in ${sceneProfile.heroEnvironment}. ${sceneRichnessNotes} ${visualIdentityNotes} Use punchier contrast, a more energetic composition, and strong visual hierarchy without altering the product.`,
        globalGuidance
      ),
    },
    {
      id: 'temu-feature',
      slot: 2,
      title: 'Feature Callout Visual',
      description: 'Feature-focused detail view that feels clear and direct even without text.',
      aspectRatio: '1:1',
      imageType: 'detail',
      mode: 'infographic_listing',
      commercialTone: 'tech',
      sceneStrictness: 'strict',
      productTitle: `Feature-focused detail for ${productName}`,
      copyText: '',
      customPrompt: appendGuidance(
        `Create a Temu feature-callout style image for ${productName}. Visually emphasize ${keyParts} through angle, zoom, and lighting rather than text alone. ${sceneProfile.detailStyling}. ${visualIdentityNotes} Make the frame crisp, obvious, and more dramatic than a flat product close-up.`,
        globalGuidance
      ),
    },
    {
      id: 'temu-lifestyle',
      slot: 3,
      title: 'Everyday Scenario',
      description: 'Bright, practical lifestyle scene with a shopper-friendly feel.',
      aspectRatio: '3:4',
      imageType: 'lifestyle',
      mode: 'lifestyle_listing',
      commercialTone: 'natural',
      sceneStrictness: 'loose',
      productTitle: `Everyday lifestyle use for ${productName}`,
      copyText: '',
      customPrompt: appendGuidance(
        `Place ${productName} in ${sceneProfile.usageEnvironment} appropriate for a ${category}. Make the scene approachable, practical, and mobile-friendly, but also visually fuller with stronger depth, cleaner styling, and more contextual realism. ${sceneRichnessNotes} ${visualIdentityNotes}`,
        globalGuidance
      ),
    },
    {
      id: 'temu-comparison',
      slot: 4,
      title: 'Benefit Comparison',
      description: 'Side-by-side benefit panel using only faithful depictions of the same product.',
      aspectRatio: '3:4',
      imageType: 'comparison',
      mode: 'infographic_listing',
      commercialTone: 'tech',
      sceneStrictness: 'strict',
      productTitle: `Comparison panel for ${productName}`,
      copyText: '',
      customPrompt: appendGuidance(
        `Create a Temu comparison-style layout using only the same uploaded product. ${sceneProfile.comparisonStyling}. Use one full view and one supporting close-up or alternate faithful depiction to highlight benefits. ${visualIdentityNotes} Keep it clear, high-contrast, and visually more dynamic than a plain side-by-side collage.`,
        globalGuidance
      ),
    },
  ];
};

const buildWalmartPlan = (
  fingerprint?: ProductFingerprint | null,
  globalGuidance?: string
): DetailSetPlanItem[] => {
  const productName = getProductName(fingerprint);
  const category = getCategory(fingerprint);
  const keyParts = getKeyParts(fingerprint);
  const distinctiveFeatures = getDistinctiveFeatures(fingerprint);
  const sceneProfile = getSceneProfile(fingerprint);
  const visualIdentityNotes = getVisualIdentityNotes(fingerprint);
  const sceneRichnessNotes = getSceneRichnessNotes(sceneProfile);

  return [
    {
      id: 'walmart-hero',
      slot: 1,
      title: 'Trustworthy Hero',
      description: 'Clean, family-safe hero image focused on clarity and mainstream retail appeal.',
      aspectRatio: '3:4',
      imageType: 'lifestyle',
      mode: 'lifestyle_listing',
      commercialTone: 'clean',
      sceneStrictness: 'strict',
      productTitle: `Retail hero image for ${productName}`,
      copyText: '',
      customPrompt: appendGuidance(
        `Create a Walmart-friendly retail hero image for ${productName}. Keep the scene bright, clear, safe, and broadly appealing, but avoid a sterile or overly plain setup. Place the product in ${sceneProfile.heroEnvironment}. ${sceneRichnessNotes} ${visualIdentityNotes} The product should feel dependable, practical, and easy to understand for everyday shoppers.`,
        globalGuidance
      ),
    },
    {
      id: 'walmart-detail',
      slot: 2,
      title: 'Value Detail',
      description: 'Close-up that highlights practical build quality and visible value.',
      aspectRatio: '1:1',
      imageType: 'detail',
      mode: 'infographic_listing',
      commercialTone: 'tech',
      sceneStrictness: 'strict',
      productTitle: `Practical detail highlight for ${productName}`,
      copyText: '',
      customPrompt: appendGuidance(
        `Create a practical Walmart detail image focused on ${keyParts}. Make the product feel sturdy, useful, and honest with a tactile close-up, visible material fidelity, and stronger dimensional lighting than a plain white-box shot. ${sceneProfile.detailStyling}. ${visualIdentityNotes} Avoid luxury styling or abstract framing.`,
        globalGuidance
      ),
    },
    {
      id: 'walmart-lifestyle',
      slot: 3,
      title: 'Everyday Use Scene',
      description: 'Helpful real-world scenario that demonstrates easy everyday use.',
      aspectRatio: '3:4',
      imageType: 'lifestyle',
      mode: 'lifestyle_listing',
      commercialTone: 'natural',
      sceneStrictness: 'strict',
      productTitle: `Everyday use context for ${productName}`,
      copyText: '',
      customPrompt: appendGuidance(
        `Show ${productName} in ${sceneProfile.usageEnvironment} for a ${category}. The environment should feel useful and realistic with strong shopper clarity, but still include enough spatial depth and styling to avoid looking repetitive. ${sceneRichnessNotes} ${visualIdentityNotes}`,
        globalGuidance
      ),
    },
    {
      id: 'walmart-comparison',
      slot: 4,
      title: 'Comparison Panel',
      description: 'Structured value comparison layout using only faithful views of the same product.',
      aspectRatio: '3:4',
      imageType: 'comparison',
      mode: 'infographic_listing',
      commercialTone: 'tech',
      sceneStrictness: 'strict',
      productTitle: `Comparison panel for ${productName}`,
      copyText: '',
      customPrompt: appendGuidance(
        `Create a clear Walmart comparison-style panel using only the same uploaded product. ${sceneProfile.comparisonStyling}. Highlight practical benefits, visible function, and shopper value without introducing unrelated variants. ${visualIdentityNotes} Keep the layout trustworthy, useful, and visually well-structured.`,
        globalGuidance
      ),
    },
  ];
};

const buildShopifyPlan = (
  fingerprint?: ProductFingerprint | null,
  globalGuidance?: string
): DetailSetPlanItem[] => {
  const productName = getProductName(fingerprint);
  const category = getCategory(fingerprint);
  const keyParts = getKeyParts(fingerprint);
  const distinctiveFeatures = getDistinctiveFeatures(fingerprint);
  const sceneProfile = getSceneProfile(fingerprint);
  const visualIdentityNotes = getVisualIdentityNotes(fingerprint);
  const sceneRichnessNotes = getSceneRichnessNotes(sceneProfile);

  return [
    {
      id: 'shopify-banner',
      slot: 1,
      title: 'Storefront Hero Banner',
      description: 'Premium wide hero tailored for Shopify storefront headers and landing sections.',
      aspectRatio: '16:9',
      imageType: 'banner',
      mode: 'lifestyle_listing',
      commercialTone: 'luxury',
      sceneStrictness: 'loose',
      productTitle: `Shopify hero banner for ${productName}`,
      copyText: '',
      customPrompt: appendGuidance(
        `Create a premium Shopify hero banner for ${productName} in ${sceneProfile.bannerEnvironment}. The image should feel brand-forward, elevated, polished, and visually rich, with layered composition and clear atmosphere rather than a generic studio setup. ${sceneRichnessNotes} ${visualIdentityNotes} Keep it believable and product-faithful.`,
        globalGuidance
      ),
    },
    {
      id: 'shopify-lifestyle',
      slot: 2,
      title: 'Brand Lifestyle Story',
      description: 'Aspirational but grounded lifestyle scene for storytelling sections.',
      aspectRatio: '4:3',
      imageType: 'lifestyle',
      mode: 'lifestyle_listing',
      commercialTone: 'premium',
      sceneStrictness: 'loose',
      productTitle: `Brand storytelling scene for ${productName}`,
      copyText: '',
      customPrompt: appendGuidance(
        `Show ${productName} in ${sceneProfile.usageEnvironment} suitable for a premium ${category} Shopify product page. Make the scene visually rich, editorial, and emotionally appealing with foreground styling, depth, and tonal layering. ${sceneRichnessNotes} ${visualIdentityNotes} Keep the brand feel elevated without becoming abstract or surreal.`,
        globalGuidance
      ),
    },
    {
      id: 'shopify-detail',
      slot: 3,
      title: 'Craft Detail',
      description: 'High-end detail for feature, texture, and craftsmanship sections.',
      aspectRatio: '1:1',
      imageType: 'detail',
      mode: 'infographic_listing',
      commercialTone: 'luxury',
      sceneStrictness: 'strict',
      productTitle: `Craftsmanship detail for ${productName}`,
      copyText: '',
      customPrompt: appendGuidance(
        `Create a refined Shopify detail shot focusing on ${keyParts}. The result should feel premium, tactile, and materially rich, with macro-like clarity and premium light shaping. ${sceneProfile.detailStyling}. ${visualIdentityNotes} Make it suitable for a feature section on a branded product page.`,
        globalGuidance
      ),
    },
    {
      id: 'shopify-feature',
      slot: 4,
      title: 'Signature Feature Panel',
      description: 'Feature-first visual for premium PDP sections and conversion blocks.',
      aspectRatio: '3:4',
      imageType: 'detail',
      mode: 'infographic_listing',
      commercialTone: 'premium',
      sceneStrictness: 'strict',
      productTitle: `Signature feature panel for ${productName}`,
      copyText: '',
      customPrompt: appendGuidance(
        `Create a premium Shopify feature panel centered on ${distinctiveFeatures || keyParts}. Use a polished composition, stronger depth, refined styling, and richer contrast so the result feels more premium than a standard product listing image. ${sceneRichnessNotes} ${visualIdentityNotes} Keep it suitable for a Shopify product page section.`,
        globalGuidance
      ),
    },
  ];
};

export const createDetailSetPlan = ({
  platform,
  fingerprint,
  globalGuidance,
}: {
  platform: DetailSetPlatform;
  fingerprint?: ProductFingerprint | null;
  globalGuidance?: string;
}): DetailSetPlanItem[] => {
  switch (platform) {
    case 'temu':
      return buildTemuPlan(fingerprint, globalGuidance);
    case 'walmart':
      return buildWalmartPlan(fingerprint, globalGuidance);
    case 'shopify':
      return buildShopifyPlan(fingerprint, globalGuidance);
    case 'amazon':
    default:
      return buildAmazonPlan(fingerprint, globalGuidance);
  }
};
