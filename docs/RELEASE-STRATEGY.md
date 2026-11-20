# Sill 发布与生态战略（2026-11-20）

> 范围：`Enkrid-Rao/sill`（应用）与 `Enkrid-Rao/sill-components`（组件规范 / 目录 / 官方组件）。
> `Sill-release/`、`Sill-dev-widget/` 是本地物料，不是仓库，未纳入评级。
> 本文是**规划**文档；"现在到底有什么、验证到什么程度"仍以 [HANDOFF.md](HANDOFF.md) 与
> [Sill-Components › STATUS.md](https://github.com/Enkrid-Rao/sill-components/blob/main/STATUS.md) 为准。
> 事实 / 推断 / 待验证在关键结论处标【事实】【推断】【待验证】；未标注的是仓库内直接观察。

---

## 0. 结论（先看这一页）

**不要把「MSIX + 商店 + 认证」作为第一步。** 现在做，换来的是"零成本签名 + 商店曝光"，
代价是"在产品、合规、身份都没定型时冻结更新节奏、消耗审核机会、背上双通道维护"。

三句话结论：

1. **签名不是"买证书"，是"选渠道"。** 中国大陆个人开发者拿不到 Azure Artifact Signing
   （个人仅限美/加）；EV 从 2024 年起已不再跳过 SmartScreen；OV 约 $219/年，且签名后仍要
   攒声誉才不弹警告。真正"零成本 + 零警告"的签名来源只有 **Store MSIX**（微软重签）。
   所以顺序是「先把产品做到值得上架」→「用商店的免费签名」，而不是「先买证书 / 先上商店」。
2. **微软官方社区不是获客渠道。** Q&A、Tech Community、Learn 讨论区是支持/答疑场景，
   反自我推广，受众也不是"想装桌面小工具的人"。微软生态里现在真正该用的是 **winget**
   （P1，PR 进 `microsoft/winget-pkgs`），以后是 **Store**（P3）。获客去 Rainmeter / Reddit /
   Product Hunt / HN / 少数派 / B 站。
3. **「微软认证」在桌面应用里没有独立徽章。** 它等于"Store 审核通过"，是上架的结果，
   不是可以单独追求的目标；WACK 是测试工具，Microsoft Partner / MVP 与产品认证无关，
   Microsoft 365 / Teams 认证不适用。

**推荐顺序**（P3 有硬门禁：P2 不达标就不进商店）：

```text
P0 1.0 收口 + 可验证发布   →  P1 分发与信任（winget / 更新校验 / MSIX spike）
   →  P2 开发者与用户获取   →  P3 MSIX + Store 认证   →  P4 运营与生态
```

| 选项 | 可行性 | 成本 / 周期 | 优先级 | 结论 |
|---|---|---|---|---|
| 组件包签名 + 哈希（catalog） | 高 | 1–2 周，¥0 | **P0** | 立刻做；这是当前最大的供应链风险 |
| 1.0 收口、发布自动化 | 高 | 2 周 | **P0** | 立刻做；所有后续动作的前提 |
| 隐私政策 / 第三方声明 / 同意 | 高 | 3–5 天 | **P0** | 立刻做；上架的硬门槛，也是国内合规底线 |
| Store 开发者账号注册（免费） | 中（大陆个人验证可能卡） | 1 天–2 周 | **P0 并行** | 现在试；lead time 长、零成本、不阻塞主线 |
| winget 上架 | 高 | 1–2 周 | **P1** | 1.0 后立刻；微软生态里 ROI 最高的入口 |
| 应用代码签名（OV/IV） | 中 | 2–4 周，≈$219/年 | **P2 触发式** | 仅当商店路线失败、或非商店下载占主导时买 |
| MSIX 打包 | 中 | 2–3 周 | **P3**（spike 放 P1） | 商店的前置；不是独立目标 |
| Store 上架 + 认证 | 中低（政策 10.2.2 / 10.5.1 / 启动可见性） | 3–6 周含迭代 | **P3** | 目标，不是第一步 |
| 微软官方社区推广 | 低 | — | **不做** | 用 winget / Store / GitHub 代替 |
| 「微软认证」 | 低（无可展示徽章） | — | **P4 结果** | 不要当目标；可对外说的是"已上架并通过 Store 审核" |
| Windows Widgets Board 接入 | 中（需 MSIX 身份 + Adaptive Cards） | 3–5 周 | **P4 机会** | 上架后再评估，是唯一的"微软生态分发位" |

---

## 1. 体检方法与本次证据

- 代码：逐文件读关键路径（`src/main/*`、`shared/catalog.ts`、`electron-builder.yml`、NSIS include）。
- 现场复核（2026-11-20 21:23，本机）：

| 命令 | 结果 |
|---|---|
| `pnpm typecheck` | 通过（node + web 两套 tsconfig） |
| `pnpm test` | **54 passed / 10 files**（HANDOFF 里写的 49 已过期） |
| `pnpm build` | 通过，renderer 单 chunk 891.65 kB |
| `git status` | 干净；`main` 与 `origin/main` 同步，HEAD = `40c8163 release: 0.7.0-dev.2` |
| `python scripts/validate.py`（Sill-Components） | `validate: ok`（34 个 JSON：widgets / examples / catalog / fixtures） |

- 外部依据：Microsoft Learn / Store Policies 7.20 / electron-builder 文档 / SignPath Foundation 条款
  （链接见 §10）。凡"当前政策"都以 2026-11 抓到的页面为准，并注明【事实】。

---

## 2. 现状体检

### 2.1 Sill（应用）

规模：186 个跟踪文件；`apps/desktop/src` 81 个 TS/TSX、**13 292 行**；68 个 commit、7 天、1 位作者。

| 维度 | 证据 | 判断 |
|---|---|---|
| 功能完整度 | Electron 45 透明窗、热键、托盘、四预设 + 自由布局、六内置组件、组件平台（模板 / `.sill` / URL / 目录 / 设置 / 存储 / 信任分级 / 更新）、i18n、自动更新、设置内卸载 | **个人 beta ≈ 90%，消费者 1.0 ≈ 70%** |
| 工程质量 | `strict` TS、0 处显式 `any`、54 个单测、模块划分清晰、安装器有 zip-slip / 大小 / 原子写防护、CSP + `contextIsolation` | **好**（同龄项目里少见） |
| 工程缺口 | 无 ESLint / Prettier、无 E2E（只有 `--smoke` 截图）、renderer 无测试、62 个 IPC 多数只有 `typeof` 级校验、无结构化日志 / 崩溃上报、Electron 精确锁 45.3.1 | **中**：单人项目可接受，公开后是维护风险 |
| 文档 | README ×2、DEVPLAN（42 KB）、DEVELOPMENT（53 KB）、ARCHITECTURE、HANDOFF、LAYOUT、TODO、WEB-WIDGETS、WIDGET-SURFACE、QUICKSTART、CONTRIBUTING、SECURITY | **丰富但漂移**（见 §2.3），且没有对外的文档站 |
| 打包 | electron-builder 26.18 + NSIS per-user + 绿色 ZIP；`latest.yml` / blockmap 齐全；122 MB 安装包 / 159 MB 绿色包 | **可用**，但发布是手工流程（`Sill-release/` 目录 + 本地打包 + 手工 SHA256） |
| 签名 | 无 Authenticode；`electron-updater` 只校验 `latest.yml` 的 sha512，不校验发布者 | **缺失**（DEVPLAN 原本推到 M6） |
| 合规 | 无隐私政策、无第三方声明、无 EULA；天气默认 `auto` → 首启就请求 `ipwho.is` / `ipapi.co` / `ipinfo.io`；歌词请求 LRCLIB | **不满足上架门槛**，也不满足国内《个人信息保护法》的"告知—同意" |
| 分发基建 | 目录与组件包都指向 `raw.githubusercontent.com`（大陆直连常被重置）；catalog 无 `sha256`、无签名；无 winget、无商店 | **单点且不可达**：大陆用户的组件目录大概率拉不下来 |
| 社区 | 4 星、0 fork、最新预发布资产下载 2 次 | 还没有受众 |

补充两个对"可发布性"影响很大的细节【事实】：

1. **启动后没有任何可见窗口**（`src/main/index.ts` `boot()` 只建隐藏面板 + 托盘）。
   Store 审核员从开始菜单启动后看不到界面，极易被判"无法测试 / 启动异常"。
2. **安全模型是"组件即受信代码"**（`SECURITY.md`：模板可拿完整 host API，`web + trusted` 有完整 Node）。
   这对开发者是卖点，对商店审核是最大政策风险点（§4.2）。

### 2.2 Sill-Components（规范 / 目录 / 官方组件）

规模：46 个 commit、6 天、1 位作者；11 篇文档约 66 KB；10 个示例；5 个官方可安装组件（registry 里 13 个包文件）。

| 维度 | 证据 | 判断 |
|---|---|---|
| 规范完整度 | `spec/widget.schema.json`、`catalog.schema.json`、`providers.json`、manifest / runtime / package / security / design 文档 | **强**，authoring.md（22 KB）是真正的资产 |
| 校验 | `scripts/validate.py`（jsonschema + 链接检查）+ GitHub Actions | **有**，但只校验结构与链接，不校验"可安装性 / 安全" |
| 官方组件 | clock / lyrics / rings 1.1.1，calendar / weather 1.1.0；视觉规范 + 状态机 + 截图矩阵 | **质量高于项目阶段** |
| 目录 | `catalog.json` 11 条，`installable + download` 直链 raw；无 `sha256`、无签名、无审核记录 | **原型级**：不可作为公开分发的信任根 |
| 发布 | 包文件直接提交进 git；无版本发布流程、无 CI 产物、无回滚 | **手工** |
| 治理 | CONTRIBUTING 有；无 issue 模板、无提交表单、无审核 SLA、无安全审查清单 | **缺**，P2 要补 |

### 2.3 两仓库的一致性问题（文档漂移清单）

这些不是"文风问题"，它们会直接误导下一个接手的 agent / 贡献者：

| # | 位置 | 写的 | 实际 |
|---|---|---|---|
| 1 | `docs/HANDOFF.md:7-8` | 正式版 v0.5.4、当前 0.6.1 | `package.json` 0.7.0-dev.2，已有 v0.7.0-dev.1 Release |
| 2 | `docs/HANDOFF.md:49` | 49 个测试 | 54 |
| 3 | `docs/DEVELOPMENT.md` §10 标题 / §6.26 | "发布与自动更新（M0.5 进行中）"、"还没有目录下载、签名和自动更新" | M0.5 在 0.1.x 已完成；URL / 目录安装 0.6.0 已上线 |
| 4 | `AGENTS.md` | "仓库目前没有配置 remote" | `origin` 已配置，main / feature 均已推送 |
| 5 | `AGENTS.md` | 引用 `docs/HANDOFF.md §8` | HANDOFF 只有 5 个二级标题，无 §8 |
| 6 | `Sill-Components/STATUS.md:11,83` | 宿主 0.6.0、46 个测试 | 0.6.1 已发布、main 在 0.7.0-dev.2；54 个测试 |
| 7 | `Sill-Components/registry/catalog.json:39,80,…` | builtin 的 `source.ref` = `v0.5.4`；shelf"下一版发布" | 目录 `updated` 2026-11-20；shelf 早已发布 |
| 8 | `Sill-Components/README.md:131-143` | 官方可安装组件只有 lyrics | 实际 5 个 |
| 9 | `DEVPLAN.md:116` | rmskin 导入是 M4 交付 | `docs/roadmap.md` 明确"不做 rmskin 兼容" |

**结论：文档密度足够，但"单一真值"没有守住。** 1.0 前必须做一次真值对齐（P0-5）。

---

## 3. 可发布性评估

| 发布形态 | 现在能不能发 | 缺什么 |
|---|---|---|
| GitHub 预发布（beta） | **能**，已经在发 | 无 |
| GitHub 正式 1.0（公开承诺） | **差 3 项** | 可重复发布流水线、组件包校验、隐私/第三方声明 |
| 绿色版 / 便携分发 | 能 | 同上；SmartScreen 仍会拦 |
| winget | **差 3 项** | 静默安装验证（`/S`）、稳定版本化 URL、1.0 正式版 |
| MSIX 侧载 | **差 1 条产线 + 4 处代码分支** | 打包产线；updater / 自启 / 文件关联 / 卸载要分支 |
| Microsoft Store | **差 5 项硬前置** | ①MSIX ②隐私政策 ③首启可见 UI ④商店版降级（动态代码 / 信任档位）⑤身份与名称 |

**一句话：现在是"可以给朋友装的 beta"，不是"可以挂在商店里让陌生人装的 1.0"。**

四个真正的硬前置（任何"上商店"计划都绕不开）：

1. **MSIX 产线**：electron-builder 26 只有 AppxTarget，没有 MSIX；MSIX 目标在未发布的 v27
   （`toolsets.winCodeSign >= 1.0.0`），或自己用 Windows SDK 的 `makeappx.exe` 写脚本
   （本机已有 10.0.26100 SDK）【事实】。
2. **商店版行为分支**：`electron-updater` 在 MSIX 下不可用（商店管更新）；注册表 Run 键自启
   要换 `startupTask`；`.sill` 关联要走 manifest；设置内卸载要换 `ms-settings:appsfeatures`。
3. **首启可见 UI**：否则 10.3 / 10.4 过不去，审核员看不到东西。
4. **隐私政策 + 同意**：Desktop Bridge / Win32 产品"必须始终有隐私政策"（政策 10.5.1）【事实】；
   而 Sill 默认自动 IP 定位，属于个人信息处理。

---

## 4. 四个战略选项的可行性

### 4.1 代码 / 包签名

拆成两件事，优先级完全不同：

**(a) 组件包签名（P0，必须做）**

- 现状：catalog 只有 `download` 直链，安装时"按包内容重新校验"但不比对哈希【事实】。
  目录在 raw.githubusercontent，仓库或个人 token 一旦失守 = 所有用户的 RCE（`trusted` 档位是完整 Node）。
- 方案：catalog 每条加 `sha256` + `signature`（Ed25519，公钥内置应用）；下载后校验，失败拒装；
  目录走 CDN 并保留 pin；发布用离线密钥签名（密钥不进 CI，或进 CI secret + 手动 approve）。
- 成本：1–2 周，¥0。**这是全项目性价比最高的安全投入。**

**(b) 应用代码签名（P2，触发式）**

| 路线 | 可行性（大陆个人） | 成本 | SmartScreen |
|---|---|---|---|
| Store MSIX（微软重签） | 高（账号免费；认证要过） | ¥0 | **无警告**【事实】 |
| Azure Artifact Signing | **不可行**：个人仅美/加，组织名单不含中国【事实】 | $9.99/月 | 仍会警告，攒声誉 |
| OV / IV 证书（云 HSM） | 中：需 CA 个体验证，≈$219/年起【事实，价格随 CA 浮动】 | ≈$219/年 + HSM 月费 | 仍会警告，攒声誉 |
| EV 证书 | 中，但**不再跳过 SmartScreen**（2024 起）【事实】 | $400+/年 | 与 OV 相同 |
| SignPath Foundation（免费 OSS 签名） | **暂不可行**：要求"可验证的项目声誉""已发布形态"，【推断：门槛是"可验证的项目声誉"，当前阶段大概率不满足】 | ¥0 | OV 级 |
| 不签名 | 可行 | ¥0 | 每次更新都从零攒声誉；Win11 Smart App Control 直接拦未签名文件【事实】 |

**判断：现在不买证书。** 理由：
1. OV 的钱买不到"立刻不弹警告"，只买到"发布者名字可见 + 声誉可累积"；
2. 商店 MSIX 免费且彻底无警告，是更高优先级的签名来源；
3. 只有在"商店路线失败"或"非商店下载成为主渠道"时，OV 才值得买（触发条件见 §7）。

**唯一例外**：如果 1.0 发布后 SmartScreen 明显压住转化（下载页跳出 / 反馈里 ≥10 条"被拦截"），
就提前买 OV —— 这是"用数据触发"，不是"按计划买"。

### 4.2 MSIX / Microsoft Store

**可行性：中。技术上不难，难在政策与产品形态。**

技术侧【事实】：

- Store 免费注册（个人 / 公司均免），个人用政府证件 + 自拍验证，全球约 200 个市场；
  但 2026 年有大陆个人反馈验证卡住、收款资料报错的案例【推断：免费应用不受收款影响，但验证时长要有预期】。
- MSIX 提交**不需要 CA 证书**，商店在认证通过后自动重签并托管分发；认证"最多 3 个工作日"。
- 认证会跑 WACK 与技术合规；`runFullTrust` 属受限能力，需要在提交时说明用途。
- 商店版更新由 Store 负责，`electron-updater` 必须关掉。
- 备选路线：政策 10.2.9 允许用"已签名 EXE + 自有托管 + 静默安装"上架，可作为 MSIX 被打回时的退路；但它仍需自购 CA 证书，所以优先级低于 MSIX。

政策侧（真正的风险）：

| 条款 | 原文要点 | 对 Sill 的含义 |
|---|---|---|
| 10.2.2 动态代码 | 不得通过"动态引入代码"根本改变/扩展**已描述**的功能 | 组件平台必须在商店描述里写明；商店版最好把"装任意第三方包"降级为"装官方签名包"或"开发者模式" |
| 10.1.5 扩展 | 经用户同意可获取"增强产品功能的附加项/扩展" | 支持"组件=扩展"的叙事，但商店版要保证来源可控 |
| 10.5.1 隐私 | Desktop Bridge / Win32 产品**必须始终有隐私政策** | 必须先在 Partner Center 填 URL |
| 10.2.8 系统改动 | 改 Windows 设置/体验要用户同意，且用受支持的方法 | 自启要换成 `startupTask`，不要偷写 Run 键 |
| 10.4 可用性 | 启动要快、要能测试、不能异常退出 | 首启必须有可见 UI |

**结论：MSIX 是"值得做的一次性工程"，但不是"现在就该做"。** 它同时解决三件事——
免费签名、商店分发、未来的 Widgets Board 身份——所以 P3 值得投入 2–3 周；但在 1.0 之前做，
等于把"每天能发版"换成"每次审核 1–3 天"，还会因为首启/隐私/动态代码被打回。

### 4.3 进入微软相关社区

把"微软社区"拆成三类，结论完全不同：

| 类别 | 例子 | 能不能获客 | 该不该做 |
|---|---|---|---|
| 分发 / 索引类 | `microsoft/winget-pkgs`、Store、GitHub topics | **能**（winget 是免费且高转化的安装入口） | **P1 做 winget**，P3 做 Store |
| 官方支持社区 | Microsoft Q&A、Tech Community、Learn 讨论区 | 不能，且反推广 | 只在遇到 MSIX/认证具体问题时提问，不发产品贴 |
| 真正的用户/作者社区 | r/Windows11、r/desktopmods、r/Rainmeter、Rainmeter 论坛、DeviantArt、Product Hunt、HN、少数派、V2EX、B 站 | **能** | P2 主战场 |

**判断：不要把"微软社区"当第一步，也不要把官方论坛当推广位。** 现在去发，4 星项目 +
未签名安装包 + 没有文档站，转化率接近 0，还会消耗一次"第一印象"。

顺带一个战略张力：Rainmeter 社区是意图最强的作者池，但 `DEVPLAN` 曾把 rmskin 导入列为 M4，
`Sill-Components/docs/roadmap.md` 又写"不做 rmskin 兼容"。建议在 P2 做**增长实验**而不是兼容层：
迁移指南 + 3 个迁移样例 + 一个"从 rmskin 抽图片/字体"的小工具。做不动就明确写进非目标，
不要让两处文档继续互相打脸。

### 4.4 「获得微软认证」

先定义：桌面应用语境下**不存在**可展示的"微软认证"徽章。可能的候选逐个排除【事实 / 推断】：

- **Microsoft Store 认证**：真实存在，但它是"每次提交的审核"，通过后你得到的是"已上架"，
  不是一个可以印在官网上的认证标志。→ 这是唯一有意义的解读，属于 P3 的自然结果。
- **Windows App Certification Kit（WACK）**：测试工具，不是认证。
- **Microsoft Partner Network / Solutions Partner**：面向 B2B 服务商的能力体系，与消费级桌面应用无关。
- **Microsoft 365 / Teams 应用认证**：不适用。
- **Microsoft MVP**：个人技术社区奖励，不是产品认证；且通常要求长期公开贡献。

**判断：把它从目标列表里删掉，换成两个可验证的对外事实**：
①"已在 Microsoft Store 上架并通过审核"；②"X 次安装 / Y 个社区组件"。后者对开发者和用户都更有说服力。

---

## 5. 为什么不是第一步：五条判断依据

1. **产品没定型，商店会冻结它。** 0.7.0-dev.2、7 天、4 星；商店每次更新要重新认证（1–3 天），
   而现在的迭代节奏是"一天几个 commit"。先上商店 = 主动把节奏降一个数量级。
2. **商店身份不可逆。** Individual → Company 不支持转换，要新开账号（等于新应用、新 ID）。
   在"个人项目 / 未来商业化 / 是否注册公司"没想清楚前注册，是在给未来挖坑。
3. **政策风险集中在产品最核心的卖点上。** "装第三方组件 + trusted 全 Node" 正对 10.2.2 的枪口；
   没有商店版降级方案和描述策略，提交一次大概率被打回，还会留下审核记录。
4. **签名经济学不支持"先买证书"。** Store 是唯一零成本无警告路径；OV 只降低摩擦、不消除；
   EV 已无效。所以"先签名"本身不是捷径，"先上商店"才是——而商店又要求 1.0 与合规，
   顺序只能是 1.0 → 合规 → 商店。
5. **社区顺序错了。** 微软官方社区反推广、受众错位；真正的作者在 Rainmeter / Reddit。
   用没打磨的 1.0 去发，等于把唯一的首发机会浪费在错误的地方。

**但有两件事可以现在就并行做（零后悔、长 lead time）**：

- 注册 Store 开发者账号（免费）+ 查 "Sill" 名称冲突 + 拿一份 CA 报价（不买）；
- 写隐私政策、做 3 天的 MSIX spike（只验证 4 个代码分支点，不提交）。

这两件事放 P0/P1 的并行轨道，不占主线，但能把 P3 的等待时间提前吃掉。

---

## 6. 分阶段路线图

时间按"单人、每周 15–25 小时"估；外部 lead time（CA / 商店验证 / 审核）单列。

### P0 · 1.0 收口与可验证发布（W1–W2，11-21 → 12-05）

**目标**：把 dev.2 收成 1.0.0；发布链路可重复、可验证；合规底座到位；文档回到单一真值。

关键动作：

1. **功能冻结**：0.7.0 收尾 → 1.0.0-rc.1（只修 P0/P1）→ 1.0.0。冻结期不加新组件、不改包格式。
2. **发布工程**：新增 `.github/workflows/release.yml`（tag 触发：typecheck → test → build →
   NSIS + portable → `SHA256SUMS` → SBOM → 上传 Release）；本地 `Sill-release/` 降级为"素材模板"。
3. **组件供应链**：catalog 增加 `sha256` + `signature`；下载后强制校验；目录域名换 CDN
   （jsDelivr / Cloudflare R2 + 自定义域），raw 只作回退；下载域名白名单。
4. **合规**：`PRIVACY.md`（数据流表：ipwho.is / ipapi.co / ipinfo.io、open-meteo、lrclib、
   GitHub 更新与目录）、`THIRD-PARTY-NOTICES.md`（Electron/Chromium、React、Instrument 字体 OFL、
   adm-zip、electron-updater）、首次运行"自动定位"明示同意（或默认固定城市）、"无遥测"声明 +
   诊断日志导出。
5. **文档真值**：HANDOFF 更新到 1.0；修正 §2.3 的 9 条；`DEVPLAN` 顶部标"历史"；rmskin 做取舍并写死；
   新增 `scripts/check-docs.mjs`（版本号 / 测试数 / 内链一致性）。
6. **并行轨道**：Store 账号注册；名称冲突检查；CA 报价；3 天 MSIX spike（见 P1）。

**验收标准（每条都要有证据）**：

- [ ] `v1.0.0` tag 触发 CI 全绿；Release 含安装版 / 绿色版 / `SHA256SUMS` / SBOM / `latest.yml`。
- [ ] 干净 clone 能复现构建（产物哈希一致；如不一致，记录差异原因并写进 release notes）。
- [ ] 篡改过的组件包安装被拒（自动化测试）；catalog 中无 `sha256` 的条目不可安装。
- [ ] 首启在用户同意前对 `ipwho.is` / `ipapi.co` / `ipinfo.io` 的请求数 = 0（代理/抓包日志为证）。
- [ ] `PRIVACY.md` / `THIRD-PARTY-NOTICES.md` 在仓库、安装包、关于页三处可达。
- [ ] `check-docs.mjs` 通过；HANDOFF「已实际验证」表每一行都有当日证据。
- [ ] 3 台干净 VM（Win10 22H2 / Win11 23H2 / Win11 24H2）安装 → 自动更新到 1.0.1 → 卸载无残留。
- [ ] Store 账号验证已提交（不要求通过）。

**门禁**：以上有 2 条以上未过 → 不进 P1 的 winget 提交。

### P1 · 分发与信任（W2–W4，12-01 → 12-20）

**目标**：让"下载 Sill"有第二条可信通道；更新链有发布者校验；MSIX 可行性有结论。

关键动作：

1. **winget**：`Enkrid-Rao.Sill` manifest（`InstallerType: nullsoft`、`Silent: /S`、
   `InstallerSha256`、`PublisherUrl`、`License: MIT`）；先本地 `winget validate`，再 PR 到
   `microsoft/winget-pkgs`（需人工审核 + 多引擎 AV 扫描【事实】）。
2. **更新链**：保留 `latest.yml` sha512 校验；签名后启用 `verifyUpdateCodeSignature`；
   未签名阶段至少固定 feed 域 + 版本单调 + 失败回退。
3. **下载页 / README**：SmartScreen 说明（截图）、`certutil -hashfile` 校验步骤、
   "为什么未签名 / 什么时候会签"。
4. **MSIX spike（时间盒 3 天）**：用 `makeappx` 手工打最小 MSIX（`runFullTrust` + `.sill` 关联 +
   `startupTask`），自签证书本地安装；产出 `docs/MSIX-SPIKE.md`，列出改造点与工时。
5. **证书触发决策**：若 4 周内 GitHub 下载 <100，或"被 SmartScreen 拦"反馈 ≥10 条 → 买 OV/IV，
   签 NSIS + portable，重发 1.0.x；否则继续等 P3。

**验收标准**：

- [ ] `winget install --id Enkrid-Rao.Sill` 在干净 VM 成功；`winget uninstall` 后无残留目录 / 注册表项。
- [ ] 1.0.0 → 1.0.1 自动更新成功；篡改 `latest.yml` 的 sha512 → 拒绝安装（测试记录）。
- [ ] MSIX spike 能安装、能启动、`.sill` 双击关联可用；`MSIX-SPIKE.md` 列出 ≥8 条改造项与工时。
- [ ] 证书决策有书面记录（买 / 不买 + 触发数据 + 预算）。
- [ ] 下载页转化基线有数（访问 → 下载 → 安装，至少用 GitHub asset 计数 + 反馈估算）。

**门禁**：winget 未合并 → P2 不启动正式宣发（否则首发没有安装入口）。

### P2 · 开发者与用户获取（W4–W10，12 月中 → 1 月底）

**目标**：从"能装"到"有人装、有人写组件"。

关键动作：

1. **文档站**（GitHub Pages / VitePress）：authoring / manifest / providers / design / testing 迁移；
   英文优先 + 中文；首页就是"5 分钟做出第一个组件"。
2. **模板与 Gallery**：3 个 5 分钟模板（时钟 / 待办 / 天气）；Gallery 页（截图 + 一键安装 +
   能力档位标签）。
3. **贡献流水线**：issue 模板、PR 模板、组件提交 Issue Form + CI 校验（schema / sha256 / 能力档位 /
   网络域名）、7 天审核 SLA、安全审查清单。
4. **增长实验（3 条并行，2 周一轮，看数据留 1 条）**：
   - Rainmeter 迁移指南 + 3 个迁移样例（意图最强的作者池）；
   - Product Hunt + Show HN + r/Windows11 + r/desktopmods（英文首发）；
   - 少数派 / V2EX / B 站 3 分钟演示（中文首发）。
5. **反馈闭环**：Discord + QQ 群；双周"组件精选"；把高频问题回灌文档。

**验收标准（同时是 P3 门禁）**：

- [ ] 最新 Release 资产下载 ≥300（GitHub 计数）；周均真实反馈 ≥5 条。
- [ ] ≥10 个第三方组件提交，≥3 位外部作者合并；每条审核记录可追溯（谁审、审了什么、sha256）。
- [ ] 文档站上线；3 位新手实测"第一个组件"≤10 分钟（录屏/计时为证）。
- [ ] 未解决的启动/安装类 issue = 0；P0/P1 平均修复 <72h。
- [ ] ≥1 条外部内容（视频/文章）≥1k 播放/阅读。
- [ ] **不达标就不进 P3**：商店不会凭空带来用户，双通道维护却是固定成本。

### P3 · MSIX 与 Store 上架（W10–W14，2 月）

**目标**：通过 Store 认证，拿到免费签名与分发；NSIS 通道保留且不受影响。

关键动作：

1. **MSIX 产线**：electron-builder 27（beta）或自写 `makeappx` 脚本；`AppxManifest`
   （`identityName` 以 Partner Center 预留结果为准、`Publisher` 与决定的主体一致、`runFullTrust`、
   `.sill` `fileAssociations`、`startupTask`、`zh-CN` + `en-US`、`minVersion 10.0.17763`）；
   全套图标资产；`createMsixupload` 或手工 `.msixupload`。
2. **商店版分支**（`SILL_STORE=1` / `process.windowsStore`）：
   - 关 `electron-updater`，设置页显示"由 Microsoft Store 更新"；
   - 自启走 `startupTask`，不写 Run 键；
   - `.sill` 关联走 manifest，不写 `HKCU\Software\Classes`；
   - 设置内卸载 → `ms-settings:appsfeatures`；
   - **首启欢迎窗**（说明托盘 / Alt+Q / 组件是什么），保证审核员看得到界面；
   - `trust: trusted` 档位默认关闭（或仅"开发者模式"可开），并在描述里写明组件来自官方签名目录。
3. **Partner Center**：名称预留、隐私政策 URL、IARC 年龄分级、截图（16:9 + 商店尺寸）、
   描述明确"可安装组件"、认证备注解释 10.2.2 与 `runFullTrust` 用途、支持联系方式。
4. **认证迭代**：按报告修；最多 3 轮；每轮记录拒绝原因与改法。

**验收标准**：

- [ ] `.msixupload` 通过 Partner Center 校验 + WACK；认证通过；商店页在 ≥2 个市场可见。
- [ ] 干净 Win11 VM：Store 安装 → 首启可见 UI → `Alt+Q` 唤起 → 双击 `.sill` 安装 →
      设置内卸载 → 无残留文件 / Run 键 / 文件关联。
- [ ] Store 版更新由 Store 完成；NSIS 版仍可独立更新；两版同时安装时能检测并提示"只保留一个通道"。
- [ ] 安装过程无 SmartScreen 警告（截图）；首启到可见 UI < 3 秒。
- [ ] 隐私政策、第三方声明、组件来源说明在商店页与关于页均可达。

### P4 · 运营与生态（W14+，3 月起）

**目标**：把"上架"变成"持续增长与合规运营"。

关键动作：评分运营（≥4.5 / ≥50 评分）、编辑推荐申请、ARM64 包、无障碍（WCAG AA）、
日 / 德本地化、Electron 月度升级节奏、Store 政策季度复核、Windows Widgets Board 实验
（Adaptive Cards 形态，需 MSIX 身份）、必要时申请 Microsoft for Startups（Azure 额度）。

**验收标准**：

- [ ] 商店评分 ≥4.5（≥50 条）；崩溃/启动失败率 <1%（诊断样本）。
- [ ] ARM64 包通过认证；无障碍审计通过（键盘全路径 + 对比度）。
- [ ] 每季度一次 Store 政策差异复核，有记录。
- [ ] 组件生态：≥50 个目录组件、≥10 位活跃作者；组件审核平均 <7 天。

---

## 7. 风险登记与触发式决策

| # | 风险 | 概率 / 影响 | 触发信号 | 对策 |
|---|---|---|---|---|
| R1 | Store 以 10.2.2（动态代码）拒绝 | 中 / 高 | 认证报告出现 10.2.2 | 商店版禁用第三方安装 / 只允许官方签名包；描述前置说明；备注解释；连续 2 次被拒 → 转 10.2.9 或放弃商店 |
| R2 | 大陆个人账号验证卡住 | 中 / 中 | 提交 5 个工作日无进展 | 保留 NSIS + winget 主线；不把商店当唯一渠道；必要时用公司主体新开账号 |
| R3 | 双通道冲突（热键 / 单实例 / 数据 / 更新） | 高 / 中 | 两版同装出现双托盘 / 抢热键 | 启动时检测另一通道并提示；共享 `%APPDATA%\Sill` 数据；文档写"只装一个" |
| R4 | 未签名被 Smart App Control 拦 | 高 / 高（非商店） | 反馈"打不开 / 被阻止" | 商店优先；或买 OV；下载页给"解除阻止"步骤 |
| R5 | 组件目录被投毒 / 供应链 RCE | 中 / 极高 | catalog 或仓库异常提交 | P0 的 sha256 + Ed25519；密钥离线；CDN + pin；`trusted` 档位二次确认 |
| R6 | 单人 bus factor | 高 / 高 | 只有一人能发版 | 发布脚本化、2FA + 硬件密钥、签名密钥托管、文档写清"如何发一版" |
| R7 | 文档继续漂移 | 高 / 中 | 版本号/测试数与代码不符 | CI 加 `check-docs`；HANDOFF 作为唯一真值；PR 模板要求勾选 |
| R8 | 名称冲突（"Sill"） | 中 / 中 | Store 名称被占 / 商标异议 | P0 就查 Store + 商标库；准备 2 个备选名；越早改名成本越低 |
| R9 | 隐私合规（IP 定位 / 歌词 / 组件数据） | 中 / 高 | 用户投诉 / 商店问询 | 首启同意、最小化、可关闭、政策写清第三方 |
| R10 | Electron 安全更新滞后 | 中 / 中 | 月度升级拖延 | 每月固定升级窗口；Dependabot；Store 政策可能查已知漏洞 |

**Store 被拒的决策树**：

```text
认证失败
├─ 10.2.2 动态代码 → 商店版关闭第三方安装（只留官方签名目录）→ 重提（≤2 次）
│                   └─ 仍拒 → 放弃商店，走 OV + winget + 官网（P3' 备选）
├─ 受限能力 / runFullTrust → 补认证备注 + 功能说明 → 重提
├─ 10.4 启动 / 可测试 → 修首启 UI、加欢迎窗 → 重提
└─ 10.5 隐私 → 补政策 / 同意流程 → 重提
```

---

## 8. 未来 14 天行动清单

- [ ] D1：决定商店身份（Individual / Company）与是否要商业化；查 "Sill" 在 Store 与商标库的冲突。
- [ ] D1：提交 Store 开发者账号验证（免费，先排队）。
- [ ] D2–D3：`PRIVACY.md` + `THIRD-PARTY-NOTICES.md` + 首启定位同意（或默认城市）。
- [ ] D2–D4：catalog 加 `sha256` + Ed25519 签名；安装器校验；换 CDN 域名。
- [ ] D4–D6：`release.yml` 打通 tag → 产物 + `SHA256SUMS` + SBOM；跑一遍 1.0.0-rc.1。
- [ ] D6–D7：HANDOFF / STATUS / README / AGENTS 真值对齐；`check-docs.mjs`。
- [ ] D8–D9：3 天 MSIX spike（makeappx + 自签），写 `MSIX-SPIKE.md`。
- [ ] D9：拿一份 OV/IV 报价（不买），记录触发条件。
- [ ] D10–D14：1.0.0 发布；winget manifest 本地验证；准备 P2 文档站骨架。

---

## 9. 需要拍板的 6 个决策

1. **商店身份**：Individual（免费、快、不可转公司）还是 Company（要营业执照 / D-U-N-S，未来可商业化）？
2. **`trust: trusted`（全 Node）档位**：保留（开发者爽、审核险）还是商店版默认关闭？
3. **组件目录治理**：只做"官方审核目录"，还是开放第三方提交（触发 UGC 政策 11.12 的责任）？
4. **商业化**：免费 / 捐赠 / 付费解锁？（影响账号类型与商店支付路径）
5. **大陆分发**：是否备案域名 + 国内 CDN？（决定组件目录与更新在大陆是否可用）
6. **Rainmeter 迁移**：作为 P2 增长实验，还是写进非目标、彻底放弃？

---

## 10. 依据

**仓库内证据（本次实际读取 / 运行）**

| 主题 | 位置 |
|---|---|
| 打包与签名 | [`apps/desktop/electron-builder.yml`](../apps/desktop/electron-builder.yml)（无签名配置；NSIS per-user；`.sill` 注册） |
| 自动更新 | [`apps/desktop/src/main/updates.ts`](../apps/desktop/src/main/updates.ts)（`autoUpdater` 配置，无发布者校验） |
| 自启 / 文件关联 | [`autostart.ts`](../apps/desktop/src/main/autostart.ts)、[`resources/sill-file-assoc.nsh`](../apps/desktop/resources/sill-file-assoc.nsh) |
| 启动行为 | [`src/main/index.ts`](../apps/desktop/src/main/index.ts)（`boot()` 只建隐藏面板 + 托盘） |
| 目录 / 下载 | [`shared/catalog.ts`](../apps/desktop/src/shared/catalog.ts)、[`main/catalog.ts`](../apps/desktop/src/main/catalog.ts)、[`main/widget-download.ts`](../apps/desktop/src/main/widget-download.ts)（无 sha256） |
| 信任模型 | [`SECURITY.md`](../SECURITY.md)、[`panel.ts`](../apps/desktop/src/main/panel.ts)（`webviewTag` + `trusted` 全 Node） |
| 隐私相关默认值 | [`settings.ts`](../apps/desktop/src/main/settings.ts)（`weatherLocation: 'auto'`）、[`weather.ts`](../apps/desktop/src/main/weather.ts)（三家 IP 定位） |
| 状态真值 | [`docs/HANDOFF.md`](HANDOFF.md)、[Sill-Components STATUS](https://github.com/Enkrid-Rao/sill-components/blob/main/STATUS.md) |

**外部依据（2026-11 抓取）**

- Store 开发者账号免费、个人验证流程：<https://learn.microsoft.com/en-us/windows/apps/publish/partner-center/open-a-developer-account>
- Store 政策 7.20（10.2.2 动态代码 / 10.5.1 隐私 / 10.2.8 系统改动 / 10.1.5 扩展）：
  <https://learn.microsoft.com/en-us/windows/apps/publish/store-policies>
- 签名选项（MSIX 由商店重签；EV 不再跳过 SmartScreen；Artifact Signing 地域限制）：
  <https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options>
- 认证流程（最多 3 个工作日、WACK、商店重签、上架后抽查）：
  <https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/app-certification-process>
- SmartScreen 声誉与 Smart App Control：<https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation>
- Artifact Signing（个人仅美/加，组织名单不含中国）：<https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart>
- electron-builder MSIX（v27 未发布；`createMsixupload`；`runFullTrust` 自动加；MSIX 不走 electron-updater）：
  <https://www.electron.build/docs/msix>
- winget 提交要求（静默安装 / 非重定向 HTTPS / 多引擎 AV）：
  <https://learn.microsoft.com/en-us/windows/package-manager/package/repository>
- SignPath Foundation 免费签名条件（需可验证声誉、已发布、OSI 许可）：
  <https://signpath.org/terms.html>
- 个人开发者免注册费公告（2025-09）：
  <https://blogs.windows.com/windowsdeveloper/2025/09/10/free-developer-registration-for-individual-developers-on-microsoft-store/>
- 同类项目（脚本型组件应用）的公开调研笔记（二手，可作交叉核对）：
  <https://github.com/everettjf/scriptwidget/blob/main/docs/windows/notes/distribution_and_signing.md>


