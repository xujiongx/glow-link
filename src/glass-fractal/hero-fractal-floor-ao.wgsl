// Cheap floor-space occlusion shared by the glass shell and its inner shapes.
// These are deliberately soft SDF masks rather than cast shadows: the studio
// environment can change without leaving a directional shadow that contradicts
// the reflections.

const ORB_RADIUS = 0.49666789;
const CUBE_HALF_EXTENT = ORB_RADIUS / sqrt(3.0);
const SKILL_ROTATION_Y = -2.09439510239;

export struct HeroFloorAoSettings {
  glassScale: f32,
  glassAmplitude: f32,
  glassOpacity: f32,
  fractalScale: f32,
  fractalAmplitude: f32,
  fractalOpacity: f32,
  orbScale: f32,
  orbAmplitude: f32,
  orbOpacity: f32,
  cubeScale: f32,
  cubeAmplitude: f32,
  cubeOpacity: f32,
}

fn signedEdgeDistance(point: vec2f, a: vec2f, b: vec2f) -> f32 {
  let edge = b - a;
  let delta = point - a;
  return -(edge.x * delta.y - edge.y * delta.x) / length(edge);
}

fn smoothMaximum3(a: f32, b: f32, c: f32, rounding: f32) -> f32 {
  let maximum = max(a, max(b, c));
  let safeRounding = max(rounding, 0.0001);
  return maximum + safeRounding * log(
    exp((a - maximum) / safeRounding) +
    exp((b - maximum) / safeRounding) +
    exp((c - maximum) / safeRounding)
  );
}

fn tetrahedronFootprintDistance(
  point: vec2f,
  scale: f32,
  amplitude: f32,
) -> f32 {
  let safeScale = max(scale, 0.0001);
  let a = vec2f(0.94280904158, 0.0) * safeScale;
  let b = vec2f(-0.47140452079, 0.81649658093) * safeScale;
  let c = vec2f(-0.47140452079, -0.81649658093) * safeScale;
  let edge0 = signedEdgeDistance(point, a, b);
  let edge1 = signedEdgeDistance(point, b, c);
  let edge2 = signedEdgeDistance(point, c, a);
  // A soft intersection erodes sharp corners as the blur grows. This behaves
  // closer to filtering the projected shape than merely feathering an exact
  // polygon SDF, whose fully opaque core always retains needle-like vertices.
  return smoothMaximum3(
    edge0,
    edge1,
    edge2,
    amplitude * 0.22,
  );
}

fn softInside(distance: f32, amplitude: f32) -> f32 {
  // Amplitude is the total signed-distance span of the 0 -> 1 transition.
  // Keeping it symmetric pins the exact SDF contour to a stable half-value.
  let halfAmplitude = max(amplitude * 0.5, 0.0001);
  return 1.0 - smoothstep(-halfAmplitude, halfAmplitude, distance);
}

fn inverseRotateFractalFootprint(point: vec2f, progress: f32) -> vec2f {
  // The projected triangle is defined in the fractal's local XZ plane. Sample
  // it with the inverse of the mesh's 120-degree Skill turn so its floor AO
  // follows the moving tips instead of remaining fixed beneath the glass.
  let angle = SKILL_ROTATION_Y * progress;
  let cosine = cos(angle);
  let sine = sin(angle);
  return vec2f(
    cosine * point.x - sine * point.y,
    sine * point.x + cosine * point.y,
  );
}

export fn heroFloorAo(
  point: vec2f,
  fractalScale: f32,
  orbScale: f32,
  cubeScale: f32,
  shapeWeights: vec3f,
  settings: HeroFloorAoSettings,
) -> f32 {
  let weights = max(shapeWeights, vec3f(0.0));
  let weightSum = max(weights.x + weights.y + weights.z, 0.0001);
  let shape = weights / weightSum;
  let leaveFractal = 1.0 - shape.x;
  let morph = smoothstep(0.0, 1.0, leaveFractal);

  let glassDistance = tetrahedronFootprintDistance(
    point,
    settings.glassScale,
    settings.glassAmplitude,
  );
  let glassMask = softInside(glassDistance, settings.glassAmplitude);

  let fractalDistance = tetrahedronFootprintDistance(
    inverseRotateFractalFootprint(point, morph),
    fractalScale * settings.fractalScale,
    settings.fractalAmplitude,
  );
  let fractalMask = softInside(fractalDistance, settings.fractalAmplitude);

  let orbDistance = length(point) - ORB_RADIUS * max(
    orbScale * settings.orbScale,
    0.0001,
  );
  let orbMask = softInside(orbDistance, settings.orbAmplitude);

  let cubeDistance = max(abs(point.x), abs(point.y)) - CUBE_HALF_EXTENT * max(
    cubeScale * settings.cubeScale,
    0.0001,
  );
  let cubeMask = softInside(cubeDistance, settings.cubeAmplitude);

  // Crossfade the triangular footprint away early while leaving the fractal,
  // then keep orb/cube AO proportional to their live shape weights.
  let aoLeave = smoothstep(0.0, 0.3, leaveFractal);
  let targetSum = max(shape.y + shape.z, 0.0001);
  let orbShare = shape.y / targetSum;
  let cubeShare = shape.z / targetSum;
  let targetMask =
    orbMask * settings.orbOpacity * orbShare +
    cubeMask * settings.cubeOpacity * cubeShare;
  let innerOcclusion = mix(
    fractalMask * settings.fractalOpacity,
    targetMask,
    aoLeave,
  );
  let glassTransmission = 1.0 - glassMask * settings.glassOpacity;
  return glassTransmission * (1.0 - innerOcclusion);
}
