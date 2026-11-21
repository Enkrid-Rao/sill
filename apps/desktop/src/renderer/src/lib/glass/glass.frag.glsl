#version 300 es
// Sill 液态玻璃 —— 单形状版。
//
// 形变链移植自 EchoMusic-Lyrics-WinIsland 的 src/utils/liquid.sksl：
//   squircle SDF → 高度剖面 z=√(1-u⁴) → 法线 → Snell 折射
//   → 屏幕空间偏移采样（向内折叠）→ 三通道色散 → 内侧高光。
// 砍掉 shape1 / corner1 / smoothing / morphDispersion 那一支：Sill 的面板
// 不做「迷你态 ↔ 展开态」的形状融合，永远只有一个圆角矩形（原版这一支
// 因为 uniform 缓冲区是零初始化的，本来也从未生效）。
//
// 常量与默认值都对齐原版实测值：
//   bezelWidth 18px、thickness 14px、glassIor 1.45、displacementFactor 2.2
//   dispersion 0.2、tint.a 0.37、legibility 0.32、specular (0.75,0.38,0.80,0.90)
//   specularShape (1.5, 3.0)、kEdgeOffset 0.7、kEdgeSoftness 0.6、kMaxSlope tan85°
// 坐标一律 CSS px：口径统一，dpr 只影响光栅化密度，不影响材质。
//
// 原版没有、本文新增的自变量（「活起来」全靠这几个）：
//   uSwell   滑入进度 0..1，重放原版 `shift *= t + 7t(1-t)` 的鼓包（峰值 2.29×）
//   uPulse   欠阻尼弹簧冲击，可正可负（回摆）→ 边缘厚度/色散/高光跟着震
//   uBreath  极慢正弦 → 静止时的呼吸
//   uFlow    滚动视差（默认 0，需在设置里显式打开「滚动视差」）
//   uSpark   滑入时沿长边掠过的光带
//   uStretch/uSquash  采样空间各向异性拉伸（源自 AndroidLiquidGlass 的 ±20% 手法）
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uBackdrop;

uniform vec2 uSize;         // 面板 CSS 尺寸
uniform vec2 uOrigin;       // 面板左上角在 uBackdrop 里的 uv
uniform vec2 uStep;         // 每个 CSS px 对应的 uv 步长
uniform float uCorner;      // 圆角「外延量」c.x，不是半径
uniform float uCornerExp;   // 超椭圆指数 c.y，2 = 正圆角，2.5 = squircle

uniform float uBezel;       // 折射斜面的宽度（CSS px）
uniform float uThickness;   // 玻璃板厚（CSS px）
uniform float uIor;         // 折射率
uniform float uDisplace;    // 位移倍率
uniform float uDispersion;  // 色散
uniform float uSaturation;  // 让背景留着颜色（vibrancy）

uniform vec3 uTint;
uniform float uTintAlpha;
uniform float uLegibility;

uniform vec2 uLight;         // 归一化光源方向（面板空间，y 朝下）
uniform vec4 uSpecular;      // x 主光 / y 对侧微光 / z 叠加量 / w band² 衰减
uniform vec2 uSpecularShape; // x 边缘宽度 / y 高光指数

uniform float uSwell;
uniform float uPulse;
uniform float uBreath;
/** 滚动视差（theme.glassScrollFlow 打开时才非零，默认 0） */
uniform vec2 uFlow;
uniform float uSpark;
uniform float uSparkY;
uniform float uStretch;
uniform float uSquash;
uniform float uOpacity;
/** 内侧投影强度 0..1（背光侧压暗，玻璃才有厚度） */
uniform float uRimShade;
/** 抓帧位图在 Windows 上是 BGRA；在着色器里换通道比在主进程里遍历一遍便宜 */
uniform float uBgra;

const float kEpsilon = 0.0001;
const float kMaxSlope = 11.430052; // tan(85°)
const float kEdgeOffset = 0.7;
const float kEdgeSoftness = 0.6;

/**
 * 圆角矩形 SDF + 外法线梯度。
 * corner.x 是「圆角在每条边上占用的长度」，不是半径 —— squircle 用比半径
 * 更大的外延量，才能让 45° 顶点落在正圆弧该在的位置（见 renderer 里的换算）。
 * corner.y 是超椭圆指数：2 = 正圆弧，2.5 = 连续曲率（Apple 味）。
 */
float sdPanel(vec2 local, vec2 halfSize, vec2 corner, out vec2 g) {
  vec2 sgn = vec2(local.x < 0.0 ? -1.0 : 1.0, local.y < 0.0 ? -1.0 : 1.0);
  vec2 q = abs(local) - halfSize + corner.x;

  if (q.x > 0.0 && q.y > 0.0) {
    vec2 m = q / corner.x;
    vec2 mp = pow(m, vec2(corner.y - 1.0));
    float len = length(mp);
    g = len > kEpsilon ? (mp / len) * sgn : sgn;
    float inside = pow(mp.x * m.x + mp.y * m.y, 1.0 / corner.y);
    return (inside - 1.0) * corner.x;
  }

  g = q.x > q.y ? vec2(sgn.x, 0.0) : vec2(0.0, sgn.y);
  return max(q.x, q.y) - corner.x;
}

float scene(vec2 p, out vec2 g) {
  return sdPanel(p - uSize * 0.5, uSize * 0.5, vec2(uCorner, uCornerExp), g);
}

vec3 backdropAt(vec2 p) {
  vec4 c = texture(uBackdrop, uOrigin + p * uStep);
  return mix(c.rgb, c.bgr, uBgra);
}

/** 一次着色，返回预乘 alpha */
vec4 shade(vec2 p, float d, vec2 g) {
  float fill = 1.0 - smoothstep(kEdgeOffset - kEdgeSoftness, kEdgeOffset + kEdgeSoftness, d);
  if (fill <= 0.0) return vec4(0.0);

  // 斜面高度剖面：z = √(1-u⁴)，slope 是它的导数
  float inward = max(-d, 0.0);
  float bezel = max(uBezel * (1.0 + 0.12 * uPulse + 0.05 * uBreath), 1.0);
  float band = clamp(inward / bezel, 0.0, 1.0);
  float u = 1.0 - band;
  float u2 = u * u;
  float slope = inward <= bezel
    ? min(2.0 * u2 * u / sqrt(max(1.0 - u2 * u2, kEpsilon)), kMaxSlope)
    : 0.0;
  vec3 normal = normalize(vec3(g * slope, 1.0));

  // 折射：ray 向内偏，采样点被拖进面板内部 —— 这条「向内的折叠」就是玻璃厚度感的来源
  vec3 ray = refract(vec3(0.0, 0.0, -1.0), normal, 1.0 / max(uIor, 1.0001));
  float thick = uThickness * (1.0 + 0.55 * uPulse + 0.06 * uBreath);
  vec2 shift = ray.z < 0.0 ? ray.xy / -ray.z * (thick + inward * 0.5) * uDisplace : vec2(0.0);

  // 原版滑入鼓包：t=0 零位移 → t=4/7 峰值 2.29× → t=1 回到 1×
  float swell = clamp(uSwell, 0.0, 1.0);
  shift *= swell + 7.0 * swell * (1.0 - swell);

  // 注意：背景默认只跟「窗口在屏幕上的位置」和「桌面像素」有关，
  // 跟面板内部滚动位置无关 —— uFlow 只在 theme.glassScrollFlow 打开时才非零。
  shift += uFlow * (0.30 + 0.70 * band);

  // 采样空间的各向异性拉伸：轮廓不动，只让玻璃里的像被挤一下
  vec2 center = uSize * 0.5;
  vec2 sampleP = center + (p - center) / vec2(1.0 + uStretch, 1.0 - uSquash);

  vec3 glass;
  if (dot(shift, shift) < 0.0025) {
    glass = backdropAt(sampleP);
  } else if (uDispersion < 0.0005) {
    glass = backdropAt(sampleP + shift);
  } else {
    glass = vec3(
      backdropAt(sampleP + shift * (1.0 + uDispersion)).r,
      backdropAt(sampleP + shift).g,
      backdropAt(sampleP + shift * (1.0 - uDispersion)).b
    );
  }

  // 保留一点色：模糊会把颜色洗成灰，提饱和往回拉（vibrancy）
  float luma = dot(glass, vec3(0.2126, 0.7152, 0.0722));
  glass = mix(vec3(luma), glass, uSaturation);

  // 亮背景往 tint 收：白字才不会糊在浅色壁纸上
  float tintAmount = min(uTintAlpha + uLegibility * smoothstep(0.35, 0.95, luma), 1.0);
  glass = mix(glass, uTint, tintAmount);

  // 内侧投影：背光的那一侧压暗一圈，玻璃才有「厚度」，
  // 否则只是一张贴图。斜坡比斜面宽两倍，和斜面叠成一条暗边。
  float shadowReach = max(uBezel * 2.2, 12.0);
  float shadowSide = pow(max(dot(g, -uLight), 0.0), 1.6);
  float shadowFalloff = 1.0 - smoothstep(0.0, shadowReach, inward);
  glass *= 1.0 - uRimShade * shadowSide * shadowFalloff;

  // 内侧高光：|grad·light|^n 只贴在边缘一圈，band² 让它往外圈收
  float rimWidth = max(uSpecularShape.x, 0.25);
  float rim = 1.0 - smoothstep(0.0, rimWidth, abs(d));
  if (rim > 0.0) {
    float falloff = uSpecular.w * band * band;
    float power = max(uSpecularShape.y, 1.0);
    float primary = pow(max(dot(g, uLight), 0.0), power) * max(uSpecular.x - falloff, 0.0);
    float opposite = pow(max(dot(g, -uLight), 0.0), power) * max(uSpecular.y - falloff, 0.0);
    // 原版：specular.z * min(coverage + pulse*0.85, 1.75)
    float gain = uSpecular.z * (1.0 + 0.50 * uPulse + 0.10 * uBreath);

    // 滑入时沿长边掠过的一道白光（原版由 CSS 斜向反光代劳）
    if (uSpark > 0.0) {
      float y = clamp(p.y / max(uSize.y, 1.0), 0.0, 1.0);
      float along = (y - uSparkY) * 3.0;
      gain += uSpark * 1.15 * exp(-along * along) * (0.35 + 0.65 * band);
    }

    glass += clamp((primary + opposite) * rim, 0.0, 1.0) * gain;
  }

  return vec4(glass * fill * uOpacity, fill * uOpacity);
}

void main() {
  vec2 p = vUv * uSize;
#ifdef GLASS_DEBUG_RAW
  // 排查用：打开 GLASS_DEBUG_RAW 就绕过材质，直接看采到的纹理
  fragColor = vec4(texture(uBackdrop, uOrigin + p * uStep).rgb, 1.0);
  return;
#endif
  vec2 g;
  float d = scene(p, g);

  vec4 color;
  // 只在边缘带做 4×RGSS：曲率处锯齿最明显，内部没必要付 4 倍采样
  bool edge = d > -1.5 && d < 2.0;
  if (edge) {
    vec2 offset = vec2(0.125, 0.375);
    color = vec4(0.0);
    for (int i = 0; i < 4; i++) {
      vec2 q = p + offset;
      vec2 gq;
      float dq = scene(q, gq);
      color += shade(q, dq, gq);
      offset = vec2(-offset.y, offset.x);
    }
    color *= 0.25;
  } else {
    color = shade(p, d, g);
  }

  if (color.a <= 0.0004) discard;
  fragColor = color;
}
