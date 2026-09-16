import {
  heroFractalCubePosition,
  heroFractalFacePosition,
  heroFractalSkillRotation,
  heroFractalSphereMix,
  heroFractalSpherePosition,
} from "./hero-fractal-face-instance.wgsl";

struct Params {
  viewProjection: mat4x4f,
  model: mat4x4f,
  meshMin: vec3f,
  meshMax: vec3f,
  shapeWeights: vec3f,
  morphDirection: f32,
  time: f32,
}
@group(0) @binding(0) var<uniform> params: Params;

@vertex fn vs_main(
  @location(0) packed_position: vec4f,
  @location(1) packed_normal: vec4f,
  @location(2) packed_sphere: vec4f,
  @builtin(instance_index) instance: u32,
) -> @builtin(position) vec4f {
  let decodedPosition = mix(params.meshMin, params.meshMax, packed_position.xyz);
  let weights = max(params.shapeWeights, vec3f(0.0));
  let weightSum = max(weights.x + weights.y + weights.z, 0.0001);
  let shape = weights / weightSum;
  let leaveFractal = 1.0 - shape.x;
  let morphProgress = heroFractalSphereMix(
    decodedPosition,
    leaveFractal * params.morphDirection,
  );
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
  let localPosition = heroFractalSkillRotation(morphProgress) * (
      fractalPosition * fractalWeight +
      heroFractalSpherePosition(sphereSourcePosition, params.time) * orbWeight +
      heroFractalCubePosition(sphereSourcePosition, params.time) * cubeWeight
    );
  _ = packed_normal;
  return params.viewProjection * params.model * vec4f(localPosition, 1.0);
}

@fragment fn fs_main() -> @location(0) vec4f {
  let alpha = 0.82;
  return vec4f(vec3f(0.0, 0.72, 1.0) * alpha, alpha);
}
