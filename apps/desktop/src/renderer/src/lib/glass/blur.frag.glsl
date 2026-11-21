#version 300 es
// 可分离高斯，一次一个方向。
// 12 对采样 + 步长 uStride：大 σ 也能用固定采样数糊出来，代价与半径无关。
// 移植自 EchoMusic-Lyrics-WinIsland 的 frost.sksl，改成「采样点与权重都按
// stride 摊开」的版本 —— 两者必须用同一个偏移量，否则高斯会被压窄。
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSource;
uniform vec2 uAxis;    // 一个 texel 的纹理步长（已含方向）
uniform float uStride; // 相邻采样点相隔几个 texel
uniform float uSigma;  // 高斯 σ，单位 texel

const int kTaps = 12;

void main() {
  float sigma = max(uSigma, 0.5);
  float twoSigma2 = 2.0 * sigma * sigma;
  vec4 sum = texture(uSource, vUv);
  float total = 1.0;

  for (int i = 1; i <= kTaps; i++) {
    float offset = float(i) * uStride;
    float weight = exp(-(offset * offset) / twoSigma2);
    sum += texture(uSource, vUv + uAxis * offset) * weight;
    sum += texture(uSource, vUv - uAxis * offset) * weight;
    total += 2.0 * weight;
  }

  fragColor = sum / total;
}
