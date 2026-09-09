import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { useGame } from "./store";

/**
 * Post-processing stack.
 * - Bloom picks up enemy emissive colours, neon strips and the muzzle flash.
 * - Vignette focuses the eye on the crosshair.
 * The "reduced bloom" accessibility setting drops intensity & raises the
 * threshold so only the hottest light sources glow. The render-quality tier
 * (manual "Low detail" toggle or the automatic FPS-based downgrade) trims
 * MSAA samples and the mip-chain blur, which are the priciest parts of this
 * pass, independent of the accessibility setting.
 */
export function Effects() {
  const reduceBloom = useGame((s) => s.settings.reduceBloom);
  const lowDetail = useGame((s) => s.settings.lowDetail);
  const autoQuality = useGame((s) => s.autoQuality);
  const low = lowDetail || autoQuality === "low";

  return (
    <EffectComposer multisampling={low ? 0 : 2}>
      <Bloom
        mipmapBlur={!low}
        intensity={reduceBloom ? 0.12 : 0.55}
        luminanceThreshold={reduceBloom ? 0.95 : 0.82}
        luminanceSmoothing={0.3}
        radius={low ? 0.4 : 0.72}
      />
      <Vignette eskil={false} offset={0.3} darkness={0.55} />
    </EffectComposer>
  );
}
