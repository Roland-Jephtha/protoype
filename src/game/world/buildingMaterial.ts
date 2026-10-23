import { Color, MeshStandardMaterial } from 'three';

/**
 * MeshStandardMaterial patched with a procedural window grid computed from
 * world position, so it works across instanced buildings of any size without
 * UV stretching or texture memory. Some windows are lit (warm emissive),
 * chosen by a hash of the window cell.
 *
 * `uWindowLight` (0..1) scales lit windows — the prologue blackout can drive it.
 */
export function createBuildingMaterial() {
  const material = new MeshStandardMaterial({ roughness: 0.82, metalness: 0.1 });
  const uniforms = {
    uWindowLight: { value: 1 },
    uWindowColor: { value: new Color(1.0, 0.7, 0.38) },
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vKWorldPos;
         varying vec3 vKWorldNormal;`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
         {
           mat4 kModel = modelMatrix;
           #ifdef USE_INSTANCING
             kModel = modelMatrix * instanceMatrix;
           #endif
           vKWorldPos = (kModel * vec4(transformed, 1.0)).xyz;
           vKWorldNormal = normalize(mat3(kModel) * objectNormal);
         }`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vKWorldPos;
         varying vec3 vKWorldNormal;
         uniform float uWindowLight;
         uniform vec3 uWindowColor;
         float kHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
         // Returns x = window mask, y = lit amount.
         vec2 kWindows() {
           vec3 n = normalize(vKWorldNormal);
           if (abs(n.y) > 0.5) return vec2(0.0);          // roofs/undersides
           vec2 t = normalize(vec2(-n.z, n.x));          // horizontal facade axis
           float u = dot(vKWorldPos.xz, t);
           float v = vKWorldPos.y;
           if (v < 4.5) return vec2(0.0);                // street level: no windows
           vec2 cell = vec2(floor(u / 2.6), floor(v / 3.3));
           vec2 f = vec2(fract(u / 2.6), fract(v / 3.3));
           float m = step(0.14, f.x) * step(f.x, 0.86) * step(0.22, f.y) * step(f.y, 0.86);
           float h = kHash(cell + floor(vKWorldPos.xz * 0.02) * 17.0 + n.xz * 3.1);
           float lit = step(0.62, h) * (0.6 + 0.4 * fract(h * 7.3));
           return vec2(m, lit * m);
         }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         vec2 kW = kWindows();
         diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.06, 0.08, 0.11), kW.x * 0.85);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
         roughnessFactor = mix(roughnessFactor, 0.15, kW.x);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         totalEmissiveRadiance += uWindowColor * kW.y * uWindowLight * 0.85;`,
      );
  };
  // Distinct cache key so three doesn't reuse an unpatched program.
  material.customProgramCacheKey = () => 'krypton-building-v1';

  return { material, uniforms };
}
