#version 300 es
// 全屏三角形，不依赖顶点缓冲。vUv 的 y 轴朝下（左上角为 0,0），
// 与面板的 CSS 坐标一致，片元里可以直接把 vUv * uSize 当作像素坐标用。
out vec2 vUv;

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = vec2(p.x, 1.0 - p.y);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
