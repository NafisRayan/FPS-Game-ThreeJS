import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { useGame } from "./store";

/**
 * Post-processing stack.
 * - Bloom picks up enemy emissive colours, neon strips and the muzzle flash.
 * - Vignette focuses the eye on the crosshair.
 * The "reduced bloom" accessibility setting drops intensity & raises the
 * threshold so only the hottest light sources glow.
 */
export function Effects() {
  const reduceBloom = useGame((s) => s.settings.reduceBloom);

  return (
    <EffectComposer multisampling={4}>
      <Bloom
        mipmapBlur
        intensity={reduceBloom ? 0.12 : 0.55}
        luminanceThreshold={reduceBloom ? 0.95 : 0.82}
        luminanceSmoothing={0.3}
        radius={0.72}
      />
      <Vignette eskil={false} offset={0.3} darkness={0.55} />
    </EffectComposer>
  );
}
