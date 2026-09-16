import { presentCeramic } from "./hero-fractal-presentation.wgsl";
import {
  heroFractalCubeNormal,
  heroFractalCubePosition,
  heroFractalFaceNormal,
  heroFractalFacePosition,
  heroFractalSkillRotation,
  heroFractalSphereMix,
  heroFractalSphereNormal,
  heroFractalSpherePosition,
} from "./hero-fractal-face-instance.wgsl";
import {
  rotateHeroEnvironmentDirection,
  sampleHeroEnvironmentLevel,
} from "./hero-glass-environment.wgsl";

const RUBBER_F0 = vec3f(0.028);

struct SoftRubberMaterial {
  baseColor: vec3f,
  roughness: f32,
  diffuseStrength: f32,
  specularStrength: f32,
  ambientStrength: f32,
}

struct MeshParams {
  viewProjection: mat4x4f,
  model: mat4x4f,
  cameraPosition: vec3f,
  meshMin: vec3f,
  meshMax: vec3f,
  shapeWeights: vec3f,
  morphDirection: f32,
  time: f32,
  material: SoftRubberMaterial,
  environmentRotation: mat4x4f,
  environmentExposure: f32,
}
@group(0) @binding(0) var<uniform> params: MeshParams;
@group(0) @binding(1) var environmentTexture: texture_2d_array<f32>;
@group(0) @binding(2) var environmentSampler: sampler;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) worldPosition: vec3f,
  @location(1) worldNormal: vec3f,
  @location(2) ambientOcclusion: f32,
};

@vertex fn vs_main(
  @location(0) packed_position: vec4f,
  @location(1) packed_normal: vec4f,
  @location(2) packed_sphere: vec4f,
  @builtin(instance_index) instance: u32,
) -> VertexOut {
  let decodedPosition = mix(params.meshMin, params.meshMax, packed_position.xyz);
  let weights = max(params.shapeWeights, vec3f(0.0));
  let weightSum = max(weights.x + weights.y + weights.z, 0.0001);
  let shape = weights / weightSum;
  let leaveFractal = 1.0 - shape.x;
  let morphProgress = heroFractalSphereMix(
    decodedPosition,
    leaveFractal * params.morphDirection,
  );
  // Keep the tip-led stagger while leaving the fractal, then redistribute the
  // departed weight across orb/cube so direct orb <-> cube morphs stay stable.
  let targetWeight = morphProgress;
  let fractalWeight = 1.0 - targetWeight;
  let targetSum = max(shape.y + shape.z, 0.0001);
  let orbWeight = targetWeight * (shape.y / targetSum);
  let cubeWeight = targetWeight * (shape.z / targetSum);

  let fractalPosition = heroFractalFacePosition(decodedPosition, instance);
  let sphereSourcePosition = heroFractalFacePosition(
    packed_sphere.xyz,
    instance,
  );
  let spherePosition = heroFractalSpherePosition(
    sphereSourcePosition,
    params.time,
  );
  let cubePosition = heroFractalCubePosition(sphereSourcePosition, params.time);
  let sphereNormal = heroFractalSphereNormal(sphereSourcePosition, params.time);
  let cubeNormal = heroFractalCubeNormal(sphereSourcePosition);
  let transitionRotation = heroFractalSkillRotation(morphProgress);
  let morphPosition = transitionRotation * (
    fractalPosition * fractalWeight +
    spherePosition * orbWeight +
    cubePosition * cubeWeight
  );
  let fractalNormal = heroFractalFaceNormal(packed_normal.xyz, instance);
  let morphNormal = transitionRotation * normalize(
    fractalNormal * fractalWeight +
    sphereNormal * orbWeight +
    cubeNormal * cubeWeight
  );
  let world = params.model * vec4f(morphPosition, 1.0);
  var out: VertexOut;
  out.position = params.viewProjection * world;
  out.worldPosition = world.xyz;
  out.worldNormal = normalize((params.model * vec4f(morphNormal, 0.0)).xyz);
  out.ambientOcclusion = mix(
    packed_position.w,
    packed_sphere.w,
    targetWeight,
  );
  return out;
}

fn environment(direction: vec3f, level: f32) -> vec3f {
  return sampleHeroEnvironmentLevel(
    environmentTexture,
    environmentSampler,
    rotateHeroEnvironmentDirection(direction, params.environmentRotation),
    level,
  ) * params.environmentExposure;
}

fn fresnelSchlick(cosine: f32) -> vec3f {
  return RUBBER_F0 + (vec3f(1.0) - RUBBER_F0) *
    pow(1.0 - clamp(cosine, 0.0, 1.0), 5.0);
}

@fragment fn fs_main(in: VertexOut) -> @location(0) vec4f {
  let view = normalize(params.cameraPosition - in.worldPosition);
  // The generated mesh has consistent outward/cavity winding and is back-face
  // culled. Flipping this normal toward the camera makes diffuse lighting
  // discontinuously change as the orbit crosses a face plane.
  let normal = normalize(in.worldNormal);
  let roughness = clamp(params.material.roughness, 0.08, 1.0);
  let facing = clamp(dot(normal, view), 0.0, 1.0);
  let fresnel = fresnelSchlick(facing);
  let maxEnvironmentLevel = f32(textureNumLevels(environmentTexture) - 1u);

  // The environment is prefiltered once during asset loading. Diffuse uses a
  // broad irradiance-like level, while roughness selects progressively softer
  // studio reflections with a single lookup. Glass continues to sample level
  // zero, so its reflections stay sharp.
  let diffuseEnvironment = environment(normal, maxEnvironmentLevel * 0.72);
  let reflectedDirection = reflect(-view, normal);
  let specularEnvironment = environment(
    reflectedDirection,
    roughness * maxEnvironmentLevel,
  );
  let diffuse = params.material.baseColor * diffuseEnvironment * (
    params.material.diffuseStrength + params.material.ambientStrength * 0.35
  );
  let specular = specularEnvironment * fresnel *
    params.material.specularStrength * mix(0.82, 0.34, roughness);
  let grazingSheen = params.material.baseColor * diffuseEnvironment *
    pow(1.0 - facing, 2.0) * roughness * 0.28;
  let ambientOcclusion = clamp(in.ambientOcclusion, 0.0, 1.0);
  let rubber = (diffuse * (vec3f(1.0) - fresnel) + grazingSheen) *
    ambientOcclusion + specular * mix(0.45, 1.0, ambientOcclusion);
  return presentCeramic(rubber);
}
