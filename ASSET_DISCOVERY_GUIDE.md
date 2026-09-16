# Autonomous 3D Asset Discovery & Integration Guide for AI Agents

> **Audience**: AI Coding Agents, Autonomous Software Engineers, and WebGL/Three.js Developers.  
> **Purpose**: A step-by-step playbook for finding, validating, downloading, and calibrating high-fidelity rigged 3D models (`.glb` / `.gltf` with animations) directly from open internet sources into production web applications.

---

## 1. The Core Challenge

Modern web applications and 3D games built with Three.js / React Three Fiber often look amateurish when forced to use procedural geometric primitives (boxes, cylinders, spheres). Creating immersive games demands real 3D assets:
- Rigged weapons with firing and reload animations.
- Character models (zombies, soldiers, monsters) with skinned meshes and locomotion cycles.
- PBR textures, normal maps, and skeletal rigs.

As an AI agent operating inside a sandboxed Linux container with access to network tools (`curl`, `node`, `run_command`, web search), you can discover, verify, and integrate production-grade 3D assets automatically.

---

## 2. Best Permissive Internet Repositories for 3D Assets

When searching for real `.glb` and `.gltf` models, prioritize these high-availability sources:

| Source | Characteristics | Access Pattern |
|---|---|---|
| **GitHub Open-Source Game Repos** | Real game ports (Counter-Strike, Left 4 Dead, Quake, Three.js FPS demos). Rigged skeletons + animations. | `https://raw.githubusercontent.com/{user}/{repo}/{branch}/...` |
| **Khronos glTF Sample Assets** | Standardized, verified glTF 2.0 models with PBR materials and skinning. | `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/...` |
| **Kenney.nl (Asset Forge / CC0)** | Modular low-to-mid poly assets, CC0 public domain, zero attribution required. | GitHub mirrors & CDN packages |
| **Hugging Face Datasets & Hub** | Many 3D datasets and game dev repositories host direct `.glb` files with open licenses. | `https://huggingface.co/{user}/{repo}/resolve/main/...` |
| **JSDelivr / unpkg CDNs** | NPM packages containing 3D demos, game assets, and three-stdlib models. | `https://cdn.jsdelivr.net/npm/{package}@{version}/...` |

---

## 3. The Autonomous Discovery Playbook

### Step 1: Targeted Query Formulations
Avoid generic search terms like `"3d model free download"`, which lead to gated interactive stores (Sketchfab, CGTrader, TurboSquid) requiring logins or CAPTCHAs.

Instead, search for **raw, directly linkable GLB binaries in open repositories**:
- `site:github.com inurl:public/models ext:glb`
- `site:github.com "ak47.glb" OR "rifle.glb"`
- `site:github.com "zombie.glb" OR "character.glb" "models"`
- `site:raw.githubusercontent.com "models" ".glb"`

### Step 2: Indexing Repositories via GitHub REST API (No Auth Required)
Public repositories can be queried anonymously via the GitHub API to discover exact asset file trees:
```bash
curl -s "https://api.github.com/repos/{owner}/{repo}/git/trees/{branch}?recursive=1" \
  | grep -E '\.(glb|gltf)$'
```
*Tip*: Check file sizes before downloading to ensure they are complete models (typically 1MB to 15MB for game-ready assets) and not LFS pointer files (which are ~130 bytes).

### Step 3: Validating Content Length and Direct Download
Verify the URL returns HTTP 200 and a valid file size before committing the download:
```bash
curl -sI -L "$URL" | grep -iE 'HTTP/|content-length'
```
Download directly to `public/models/`:
```bash
curl -fSL "$URL" -o "public/models/my_asset.glb"
```

---

## 4. Binary GLB Validation in Node.js

Never trust downloaded files blindly. A corrupted download, 404 HTML page, or Git LFS text pointer will crash Three.js.

Use a quick Node.js snippet to verify the binary header:
```javascript
const fs = require('fs');
const buf = fs.readFileSync('public/models/my_asset.glb');

// GLB Header: 12 bytes
// magic: 0x46546C67 (ASCII "glTF")
const magic = buf.readUInt32LE(0);
if (magic !== 0x46546C67) {
  throw new Error("Invalid GLB file: magic header mismatch!");
}

const version = buf.readUInt32LE(4);
const totalLength = buf.readUInt32LE(8);
const jsonChunkLength = buf.readUInt32LE(12);
const jsonChunkType = buf.readUInt32LE(16); // 0x4E4F534A ("JSON")

const gltf = JSON.parse(buf.slice(20, 20 + jsonChunkLength).toString('utf8'));
console.log("Model verified!");
console.log("Animations:", (gltf.animations || []).map(a => a.name));
console.log("Meshes:", (gltf.meshes || []).map(m => m.name));
console.log("Materials:", (gltf.materials || []).map(m => m.name));
```

---

## 5. Viewmodel & First-Person Calibration Math

External assets come from various DCC tools (Blender, Maya, Unreal Engine, Source Engine). They often suffer from:
1. **Mismatched Axis Conventions**: Raw models may point along `+Y`, `+Z`, or `-Z`.
2. **Extreme Scale Differences**: A model authored in centimeters will be 100x too large; a model exported with metarig scaling might be 10x too small or too large.
3. **Orientation Inversions**: Applying a naive `-Math.PI / 2` rotation may point the gun straight up into the sky or flip the sights upside down.

### The Systematic Calibration Algorithm:
To calibrate any unknown weapon viewmodel:

1. **Find Barrel Axis by Vertex Extremes**:
   Locate the muzzle vertex (maximum forward in local space) and the stock vertex (minimum rearward in local space).
   ```javascript
   // Calculate weapon vector in world space:
   const muzzle = getSkinnedVertex(muzzleIndex);
   const stock = getSkinnedVertex(stockIndex);
   const gunDir = new THREE.Vector3().subVectors(muzzle, stock).normalize();
   const gunLength = new THREE.Vector3().subVectors(muzzle, stock).length();
   ```

2. **Scale to Real-World Dimensions**:
   - An assault rifle (e.g., AK-47) is approximately `0.88m` long.
   - If `gunLength` is measured as `8.18` units, the required scale is `0.88 / 8.18 ≈ 0.108`.

3. **Solve Alignment Euler Angles**:
   - We want `gunDir` in camera space to point directly forward: `[0.0, 0.0, -1.0]`.
   - We want `gunDir.y ≈ 0.0` (level horizontal line of fire).
   - We want iron sights on top and magazine on bottom: `sightVertex.y > magVertex.y`.
   - In our AK-47 calibration, the exact rotation required was:
     `[-THREE.MathUtils.degToRad(6), THREE.MathUtils.degToRad(177), 0]`

4. **Calculate Iron Sight & Hip-Fire Screen Coordinates**:
   Use Three.js camera projection to verify alignment mathematically before running the game:
   ```javascript
   const screenPos = muzzleVertex.clone().project(camera);
   // ADS alignment: screenPos.x should be 0.000 (centered on crosshair)
   // Hip-fire alignment: screenPos.x ≈ 0.18, screenPos.y ≈ -0.35 (lower-right)
   ```

5. **Prevent Near-Plane Camera Clipping**:
   Standard Three.js cameras default to `near: 0.1` or `0.3`, which clips weapons and hands when brought close to the face during ADS. Set camera near plane to:
   ```tsx
   <Canvas camera={{ near: 0.03, ... }} />
   ```

---

## 6. Material & Lighting Tuning (Eliminating "White/Albino" Glitches)

When using modern PBR workflows with `ACESFilmicToneMapping` and bright outdoor skylight rigs, raw textures can appear washed out or chalk-white.

### Fixes:
1. **Subtle Decay / Flesh Tone Multiplication**:
   In Three.js, `MeshStandardMaterial.color` multiplies directly with the base texture map.
   ```typescript
   // Rather than leaving material.color at pure #ffffff:
   stdMaterial.color.set("#506346"); // rotten zombie olive flesh
   stdMaterial.roughness = 0.92;     // matte decayed skin
   stdMaterial.metalness = 0.04;     // non-metallic organic flesh
   stdMaterial.envMapIntensity = 0.3;// avoid blinding sky specular blowouts
   ```

2. **Disable Frustum Culling on Skinned Meshes**:
   Animated character bones frequently rotate outside the initial bind-pose bounding box. Without this setting, models will flicker or vanish at screen edges:
   ```typescript
   scene.traverse((child) => {
     if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
       child.frustumCulled = false;
     }
   });
   ```

---

## 7. Summary Checklist for AI Agents

When tasked with enhancing 3D web applications:
- [ ] Query raw GitHub / Hugging Face repos for direct `.glb` assets.
- [ ] Inspect binary header & extract animation clip names via Node.js before saving.
- [ ] Calculate real-world bounding dimensions and apply correct scaling factor.
- [ ] Solve rotation Euler angles using stock-to-muzzle forward vector.
- [ ] Verify ADS iron-sight centering via `vector.project(camera)`.
- [ ] Adjust camera near clip to `0.03` to prevent viewmodel clipping.
- [ ] Apply PBR color tinting to avoid blown-out white textures under bright lighting.
- [ ] Set `frustumCulled = false` on all animated skinned meshes.
