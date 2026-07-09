/**
 * Single source of truth for the tunnel's feel: depth bounds, how depth maps
 * to on-screen 3D transforms, and momentum behavior. Tune the experience here.
 */
export const TUNNEL_CONFIG = {
  /** Depth axis bounds (the scroll position lives in this range). */
  minDepth: 0,
  maxDepth: 1000,

  /** Depth units → scene units (all distances below are in scene units). */
  sceneDepthMultiplier: 4,
  /** Cards further than this are culled entirely. */
  visibilityRange: 400,
  /** Distance over which opacity falls off. */
  normalizationRange: 220,
  /** How far past the viewer a card starts fading out. */
  fadeStart: 48,
  /** Fade-out span once past the viewer. */
  fadeRange: 96,
  /** Distance over which cards shrink toward their minimum scale. */
  scaleRange: 400,
  /** How much side cards squeeze toward center with distance. */
  lateralCompression: 0.12,
  verticalFactor: 0.18,
  /** Primary Z-push multiplier: on-screen depth spread per scene unit. */
  zFactor: 8.5,
  rotateXFactor: 0.018,
  rotateYFactor: 0.012,

  /** The "You've entered …" choice card sits this many depth units before a segment. */
  choiceCardLeadIn: 25
} as const;
