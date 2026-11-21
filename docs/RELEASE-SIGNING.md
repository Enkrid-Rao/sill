# 签名决策记录（0.7）

## 结论

0.7 的 Beta / RC 继续以 **unsigned** 发布，不把“已签名”写进任何安装提示或 Release Notes。

正式版 `0.7.0` 前必须在以下两条路径中拍板：

1. **Store MSIX**：免费、由 Store 重签；需要 MSIX、首启可见 UI 与隐私政策，周期更长。
2. **OV / IV 代码签名证书**：约 $219/年，CI 签名 NSIS + portable；签名后仍需积累 SmartScreen 声誉。
3. **明确接受 unsigned**：只能在下载页、安装向导、Release Notes 三处显著标注风险；不能称“正式签名版”。

当前不购买证书，不阻断 Beta/RC；正式版发布说明必须写清 unsigned 状态和 SmartScreen 提示。

## 为什么不是现在买证书

- 0.7 仍是 Beta，产品/安装形态还会变；证书不解决首启、隐私、组件签名等更靠前的门禁。
- EV 不再自动跳过 SmartScreen；OV 也需要声誉积累。
- Store MSIX 是唯一可能“零成本且无警告”的路径，但应先完成可见首启、隐私同意和组件策略。

## 验收

- Beta/RC：Release Notes 明确“未签名”，安装包 `Get-AuthenticodeSignature` 为 `NotSigned` 是预期。
- 正式版：
  - 若签名：安装包与更新包签名有效，CI 有校验步骤；
  - 若 Store：MSIX 由 Store 重签，NSIS 通道保留并单独标注；
  - 若 unsigned：README / Release Notes / 安装向导三处一致标注，并在发布检查清单签字。
