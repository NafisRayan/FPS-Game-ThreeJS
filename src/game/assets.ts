/* ------------------------------------------------------------------ */
/* Real, CC0 assets streamed from CORS-enabled CDNs.                   */
/*                                                                     */
/*  · HDRI sky ....... Poly Haven  (CC0)                               */
/*  · Ground PBR ..... Poly Haven  (CC0)                               */
/*  · Rifle .......... Quaternius "Modular Sci-Fi Guns" (CC0)          */
/*  · Hands .......... Babylon.js rigged WebXR hand meshes (Apache-2)  */
/*  · Foliage/rocks .. Quaternius "Nature Pack" (CC0)                  */
/* ------------------------------------------------------------------ */

const PH = "https://dl.polyhaven.org/file/ph-assets";
const QUAT =
  "https://cdn.jsdelivr.net/gh/trebeljahr/quaternius-showcase@main/public/glb";
const BJS = "https://cdn.jsdelivr.net/gh/BabylonJS/Assets@master/core";

/** Clear-blue daytime sky with sun — used for background + IBL. */
export const HDRI_SKY = `${PH}/HDRIs/hdr/1k/kloofendal_43d_clear_puresky_1k.hdr`;

/** Photographic leafy-grass ground, 1k PBR set. */
export const GROUND = {
  diff: `${PH}/Textures/jpg/1k/leafy_grass/leafy_grass_diff_1k.jpg`,
  norm: `${PH}/Textures/jpg/1k/leafy_grass/leafy_grass_nor_gl_1k.jpg`,
  rough: `${PH}/Textures/jpg/1k/leafy_grass/leafy_grass_rough_1k.jpg`,
  ao: `${PH}/Textures/jpg/1k/leafy_grass/leafy_grass_ao_1k.jpg`,
};

export const MODELS = {
  rifle: `${QUAT}/modular_sci_fi_guns_pack/AR_4.glb`,
  handR: `${BJS}/HandMeshes/r_hand_rhs.glb`,
  handL: `${BJS}/HandMeshes/l_hand_rhs.glb`,
  treeA: `${QUAT}/nature_pack/CommonTree_1.glb`,
  treeB: `${QUAT}/nature_pack/PineTree_1.glb`,
  treeC: `${QUAT}/nature_pack/BirchTree_2.glb`,
  bush: `${QUAT}/nature_pack/Bush_1.glb`,
  bushBerry: `${QUAT}/nature_pack/BushBerries_1.glb`,
  rock: `${QUAT}/nature_pack/Rock_1.glb`,
  rockMoss: `${QUAT}/nature_pack/Rock_Moss_1.glb`,
  grassTuft: `${QUAT}/nature_pack/Grass_Short.glb`,
} as const;

export const CREDITS =
  "Sky & ground: Poly Haven (CC0) · Rifle & foliage: Quaternius (CC0) · Hands: Babylon.js";
