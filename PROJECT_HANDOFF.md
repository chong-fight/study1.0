# 短词记 2.0 全项目交接与逻辑说明

最后整理：2026-11-02  
用途：交给新的 Codex 窗口继续检查 Bug、测试或开发。  
当前结论：核心学习、正式复习、低库存巩固和多轮轮换逻辑已经实现；本地浏览器实测、单元/集成测试、类型检查、Lint 和生产构建均通过。

---

## 1. 产品定位

短词记是面向中国英语学习者的本地优先短语记忆工具。

核心目标：

- 用于背诵固定搭配和动词句型。
- 两条学习线必须分开计算，不混合统计和进度。
- 词库由用户手动导入 JSON，不能把私人词库内嵌到源代码或 GitHub 仓库。
- 学习数据保存在当前浏览器的 IndexedDB 中。
- 需要支持手机浏览器，最终通过 GitHub Pages 静态部署。

当前技术栈：

- Next.js 16.4.3
- React 19
- TypeScript
- Dexie / IndexedDB
- 静态导出 `output / out`
- GitHub Actions 自动部署 GitHub Pages
- PWA Service Worker

---

## 2. 当前绝对路径

### 2.1 当前项目源码

```text
C:\Users\heyic\Documents\Codex\2026-10-26\c-users-heyic-projects-phrase-app-2\短词记2.0
```

### 2.2 最新 GitHub 上传压缩包

```text
C:\Users\heyic\Documents\Codex\2026-10-26\c-users-heyic-projects-phrase-app-2\outputs\短词记2.0-GitHub上传-v15-深度审计版.zip
```

解压后的目录：

```text
C:\Users\heyic\Documents\Codex\2026-10-26\c-users-heyic-projects-phrase-app-2\outputs\短词记2.0-GitHub上传-v15-深度审计版
```

上传 GitHub 时：

1. 先解压 ZIP。
2. 把解压文件夹内部的内容放到仓库根目录。
3. 仓库根目录应直接看到 `.github`、`src`、`public`、`scripts`、`tests`、`package.json` 等文件。
4. 不要再多套一层 `短词记2.0-GitHub上传-v15-深度审计版` 文件夹。
5. Windows 文件管理器可能默认隐藏 `.github`，需要开启“显示隐藏项目”。

### 2.3 当前本地测试地址

```text
http://127.0.0.1:4177/learn/
```

这个地址由项目内的静态服务器提供：

```powershell
cd "C:\Users\heyic\Documents\Codex\2026-10-26\c-users-heyic-projects-phrase-app-2\短词记2.0"
$env:PORT="4177"
node scripts/serve-static.mjs
```

---

## 3. 词汇 JSON 文件

### 3.1 原始增强版

固定搭配 546 条：

```text
C:\Users\heyic\Documents\Codex\2026-10-26\c-users-heyic-projects-phrase-app-2\outputs\短词记_固定搭配_增强版.json
```

动词句型 380 条：

```text
C:\Users\heyic\Documents\Codex\2026-10-26\c-users-heyic-projects-phrase-app-2\outputs\短词记_动词_增强版.json
```

### 3.2 合并专升本机构词组后的版本

固定搭配 577 条：

```text
C:\Users\heyic\Documents\Codex\2026-10-26\c-users-heyic-projects-phrase-app-2\outputs\短词记_固定搭配_增强版_合并专升本.json
```

动词句型 384 条：

```text
C:\Users\heyic\Documents\Codex\2026-10-26\c-users-heyic-projects-phrase-app-2\outputs\短词记_动词_增强版_合并专升本.json
```

### 3.3 专升本机构词组专项文件

机构去重完整表 127 条：

```text
C:\Users\heyic\Documents\Codex\2026-10-26\c-users-heyic-projects-phrase-app-2\outputs\短词记_专升本机构词组_去重完整表.json
```

分类清单 127 条：

```text
C:\Users\heyic\Documents\Codex\2026-10-26\c-users-heyic-projects-phrase-app-2\outputs\短词记_专升本127_分类清单.json
```

固定搭配分类 108 条：

```text
C:\Users\heyic\Documents\Codex\2026-10-26\c-users-heyic-projects-phrase-app-2\outputs\短词记_专升本127_固定搭配.json
```

动词句型分类 19 条：

```text
C:\Users\heyic\Documents\Codex\2026-10-26\c-users-heyic-projects-phrase-app-2\outputs\短词记_专升本127_动词句型.json
```

与原始词库相比的缺失清单 35 条：

```text
C:\Users\heyic\Documents\Codex\2026-10-26\c-users-heyic-projects-phrase-app-2\outputs\短词记_专升本机构词组_缺失清单.json
```

注意：

- 这些 JSON 不内嵌在应用代码中。
- `local-data/` 只用于本地测试，已加入 `.gitignore`。
- GitHub 上传包不包含 `local-data/`。

---

## 4. 用户明确提出的硬性要求

### 4.1 产品与数据

- 固定搭配和动词句型必须独立学习、独立统计、独立额度。
- 必须支持手动导入 JSON，不能写死在软件里。
- 导入时自动识别固定搭配或动词句型。
- 重复导入相同词条应更新内容并保留学习进度。
- 词条至少包含英文短语、中文含义、英文例句和中文翻译。
- 每个词应有多条例句轮换，当前标准是 4 条，避免每次只看到同一句。
- 多义词必须显示其他常见义项，并分别为义项准备例句和中文翻译。
- 主要考点使用最常用义项，但多义专项需要考察其他义项。

### 4.2 UI

- 配色为暖米色、高雅的纸张质感。
- 不应把整个界面做成单一米黄；标题附近和局部区域使用更深的米色做出层次。
- 保持简洁、高雅的视觉方向。
- 底部“今日 / 学习 / 短语库 / 复习 / 我的”选中项必须高亮。
- 学习预览卡正面只能显示英文短语，不能添加提示句、标签句、说明句。
- 点击卡片后应有 3D 翻转效果。
- 卡片背面显示中文、其他义项、例句和中文翻译。
- “陌生 / 模糊 / 认识”三个评价按钮始终可见，正反面都能直接点。
- 不翻转直接点“认识”也必须计数并可推进。
- 每次词卡重新出现时，必须先回到纯英文正面。
- 例句不能提前泄露答案。
- 同一词的例句不能和前面展示的例句完全相同，需要轮换。

### 4.3 今日页

- 可以快速查看今日背诵和今日复习。
- 今日统计同时覆盖两条学习线。
- 显示新学数量、待复习数量和已完成数量。
- 没有新词但存在已学词时，显示“可巩固 N”。
- 页面切换后不能丢失当前学习线上下文。

### 4.4 GitHub 部署

- 最终产物要能直接上传 GitHub。
- 使用 GitHub Pages 静态发布。
- 手机浏览器可直接访问。
- 不能包含私人词库、`node_modules`、本机构建缓存或 IndexedDB 数据。

---

## 5. 每日新词选择逻辑

默认设置：

| 项目 | 默认值 |
|---|---:|
| 固定搭配每日新学 | 6 |
| 动词句型每日新学 | 4 |
| 每日新学总量 | 10 |
| 固定搭配每日复习 | 25 |
| 动词句型每日复习 | 25 |
| 每日复习总量 | 50 |

新词选择顺序：

1. 只选择当前学习线中从未学过、未归档的词。
2. 按 `priority` 从小到大分组。
3. 高优先级组先进入候选。
4. 同一优先级内随机。
5. 第一轮避免同一 `confusionGroup` 或互相同义的词一起出现。
6. 如果因避冲突导致数量不足，会进行第二轮放宽补齐。
7. 只要库存足够，就必须给满用户设置的每日数量，不能无故少给。
8. 固定搭配和动词句型先受各自上限约束，再受每日总新学上限约束。
9. 到期复习达到总复习容量的 80% 时，新学量减半。
10. 到期复习达到 100% 时，暂停新学。

若当前学习线仍有未学新词：

- 不允许进入第二轮巩固。
- 下一次学习应继续安排新词。

---

## 6. 第 0 天：初次学习

### 6.1 预览与认识目标

预览卡当前行为：

- 正面只有英文短语。
- 点击后 3D 翻转到背面。
- 背面显示中文主释义、其他义项、例句和中文翻译。
- 三个评价按钮始终显示。
- 不翻转也能直接评价。
- 每次重新出现时，卡片状态重置为纯英文正面。

初始评价和目标次数：

| 初始选择 | 初始认识计数 | 最终需要连续认识 |
|---|---:|---:|
| 认识 | 1 | 2 |
| 模糊 | 0 | 3 |
| 陌生 | 0 | 4 |

重复出现规则：

- 选择“认识”增加连续认识次数。
- 选择“模糊”或“陌生”会把连续认识计数清零。
- 再次出现时，不翻转也可以直接点“认识”。
- 达到目标次数后，该词退出预览队列。
- 每轮重新出现会重新打乱顺序。
- 同一批词在相邻认识轮次不能保持完全相同的顺序。
- 刷新页面后，同一轮顺序仍保持稳定。

### 6.2 第一关：看英文填中文

- 题型：`meaning`
- 达标次数：

| 初始选择 | 连续正确目标 |
|---|---:|
| 认识 | 1 |
| 模糊 | 2 |
| 陌生 | 3 |

中文判定要求：

- 忽略空格、标点、全半角差异。
- `……`、`...`、`…`、`什么`、`某人`、`某事` 等占位表达按同一类处理。
- `对……感激`、`对...感激`、`对感激`、`感激` 应视为可接受。
- 不接受空答案、单独无意义汉字或完全无关回答。
- 不能退回“只写短语中任意两个字就算对”的松散规则。

### 6.3 第二关：看中文默写英文

- 题型：`spelling`
- 每张卡累计写对 3 次。
- 写错不会扣掉已经累计的正确次数。
- 写错后重新排队。
- 卡片交错出现，不连续重复同一张。
- 必须累计 3/3 才通过。

### 6.4 第三关：语境应用

- 优先使用独立测验例句。
- 题面中的目标短语必须被挖空或隐藏。
- 从 4 个英文选项中选正确短语。
- 答对 1 次通过。
- 例句不可靠时回退为短语选择题，但不能显示泄露答案的完整例句。

### 6.5 第四关：出口测试

- 再次混合考察全部卡片。
- 单义词可选题型：含义、短语选择、语境选择、拼写。
- 多义词必须逐个通过所有次要义项的语境辨认。
- 每个义项有自己的例句和中文翻译。
- 某些义项答错不能被其他义项答对掩盖。

### 6.6 第 0 天完成

所有卡片完成四个关卡后：

- `CardProgress.state` 改为 `incubating`
- 保存四个关卡的首次正确、最终正确、尝试次数和时间
- 暂不创建长期 `ReviewState`
- `calibrationDueOn` 设置为实际完成日的下一天

---

## 7. 第 1 天：四轮校准

### 7.1 四轮内容

| 轮次 | 内容 | 达标 |
|---|---|---|
| 1 | 英→中含义 | 按初始感觉连续正确 1/2/3 次 |
| 2 | 选正确英文形式 | 1 次 |
| 3 | 新语境应用 | 1 次；多义词抽义项题 |
| 4 | 中→英拼写 | 累计写对 3 次 |

规则：

- 每一轮覆盖当天所有卡。
- 答错后回到本轮队尾。
- 重试顺序按尝试次数分组并重新打乱。
- 同一轮连续失败 3 次，该卡本次判 D。
- D 卡次日重新校准，不创建长期复习状态。

### 7.2 等级

等级根据：

- 第 0 天初始感觉
- 第 0 天四关首次正确情况
- 第 1 天四轮首次作答情况

等级和初始间隔：

| 等级 | 初始间隔 |
|---|---:|
| S | 4 天 |
| A | 2 天 |
| B | 1 天 |
| C | 1 天 |
| D | 不进入长期复习，次日重验 |

---

## 8. 长期正式复习

### 8.1 题型

每张卡通常抽 2 种不同题型：

1. 根据最弱能力确定主题型。
2. 再加入另一个不同题型。
3. 多义词会强制加入 `senseChoice`。
4. 拼写题扩展为累计写对 3 次。

题型池：

- `meaning`
- `spelling`
- `phraseChoice`
- `contextChoice`
- `cloze`
- `senseChoice`

### 8.2 例句轮换

- 每条词有 4 条例句。
- 优先使用最少使用的例句。
- 排除上一题刚使用的例句。
- 使用次数持久化。
- 预期循环：`1 → 2 → 3 → 4 → 1 → 2 → 3 → 4`。

### 8.3 错题与纠错

- 任意一轮有错，进入纠错。
- 纠错轮重新抽题型并打乱卡序。
- 最多纠错 3 轮。
- 第 3 轮仍失败，次日再复习。
- 首次错误会影响间隔，不因后续纠对而抹掉。

### 8.4 间隔更新

- 全部正确：扩大间隔；连续两次高质量成功提升等级。
- 部分正确：小幅扩大并降低难度系数。
- 全部错误：间隔回到 1 天并增加遗忘次数。
- 连续两次失败：等级下降一级。
- 使用简化 SM-2 参数，不宣称临床或医学最优。

### 8.5 公平性

复习先选最早到期内容。同等逾期时依次比较：

1. 被顺延次数更多者优先。
2. 等级风险更高者优先。
3. 历史错误更多者优先。
4. 稳定 ID 打破平局。

这保证旧卡不会被新卡永久挤出。

---

## 9. 第二轮、第三轮：低库存巩固

### 9.1 什么时候进入

必须同时满足：

- 当前学习线没有未学新词。
- 今天没有正式到期复习。
- 没有待校准卡片。
- 没有正在进行的第 0 天学习。

有正式复习或新词时，它们优先。

### 9.2 每次选多少

使用当前学习线每日新学数量作为巩固批量：

- 固定搭配默认 6
- 动词句型默认 4

例如设为每天 4 个：

- 12 个已学词会在前三轮覆盖完。
- 第 4 轮才从第 1 批重新开始。

### 9.3 选词顺序

1. 先选择从未进入过巩固轮次的已学词。
2. 同一批内，优先：
   - 等级更低
   - 临时等级更低
   - 错误和遗忘次数更多
   - 上次正式复习更早
3. 所有已学词都至少巩固一次后，从 `lastBoosterAt` 最早的一批开始下一轮。
4. 用稳定随机打乱同优先级平局。

这同时满足：

- 不能每天重复少数薄弱词。
- 必须参考第一轮学习表现。
- 必须逐渐轮换所有已学词。

### 9.4 和正式复习的冲突处理

- 巩固使用统一的复习计划和复习界面。
- 巩固日志标记为 `ReviewLog.mode = "booster"`。
- 巩固不会创建或修改正式 `ReviewState`。
- 不改变正式等级、间隔、下次复习日期。
- 不影响次日校准。
- 正式到期复习出现时，不生成当天巩固轮。
- 未完成的旧巩固计划会在下一天归档。
- 已完成卡通过 `CardProgress.lastBoosterAt` 保留轮换位置。

---

## 10. 多义词规则

每个多义词保存 `senses[]`：

- 第一个或 `primary: true` 的义项为主释义。
- 其他义项是次要常见义项。
- 每个义项可有自己的例句、翻译和说明。

展示：

- 学习卡背面显示主释义和其他义项。
- 词条详情显示全部义项。
- 短语库显示 `+N` 表示还有 N 个义项。

考察：

- 看英→中、看中→英和主语境题使用主释义。
- 多义专项使用 `senseChoice` 考察次要义项。
- 义项题按使用次数轮换。
- 第 0 天出口关和第 1 天校准都可能要求逐个义项通过。

---

## 11. 今日页和学习线恢复

今日页显示：

- 总进度
- 两条学习线的新学、待复习、可巩固数量
- 今日背诵列表
- 今日复习/巩固列表

完成状态规则：

- 完成状态只读取当前学习线的当前会话。
- 固定搭配完成不能把未完成的动词句型显示为完成。
- 离开学习页再返回时必须恢复原学习线。
- 学习线选择保存在 `localStorage`。
- URL 可通过 `?track=fixed` 或 `?track=verb-pattern` 指定学习线。

异步保护：

- 快速切换学习线时，旧请求不能覆盖新学习线。
- 提交答案期间禁止进一步切换学习线。

---

## 12. 当前数据模型

主要 IndexedDB 表：

- `phrases`
- `learningSessions`
- `cardProgress`
- `reviewStates`
- `reviewPlans`
- `calibrationPlans`
- `reviewLogs`
- `importJobs`

关键字段：

### `LearningSession`

- `phraseIds`
- `previewedPhraseIds`
- `currentRound`
- `roundPassedIds`
- `status: active | completed`

### `CardProgress`

- `state: day0 | incubating | calibrating | scheduled | relearning`
- `day0Rating`
- `previewRequiredCount`
- `previewRecognizedCount`
- `day0Gates`
- `skills`
- `provisionalGrade`
- `confirmedGrade`
- `calibrationDueOn`
- `exampleUseCounts`
- `lastExampleIndex`
- `senseUseCounts`
- `lastSenseIndex`
- `lastBoosterAt`

### `ReviewState`

- `grade`
- `intervalDays`
- `easeFactor`
- `nextReviewOn`
- `mistakeCount`
- `lapses`
- `deferralCount`

### `ReviewPlan`

- `kind?: "scheduled" | "booster"`
- `phraseIds`
- `completedPhraseIds`
- `attempts`
- `status`

### `ReviewLog.mode`

- `learning`
- `calibration`
- `review`
- `booster`

---

## 13. 代码架构

```text
src/app/*                 路由和页面交互
    ↓
src/components/*          展示组件和答题 UI
    ↓
src/lib/domain/*          纯业务规则
    ↓
src/lib/data/*            Dexie 查询、事务和持久化
    ↓
src/lib/import/*          JSON 解析、清洗和导入
```

依赖方向：

- 页面可以依赖组件、领域层和数据层。
- 领域层不能依赖 React、Dexie 或页面。
- 数据层负责事务和 IndexedDB。

### 13.1 关键文件

项目根：

```text
C:\Users\heyic\Documents\Codex\2026-10-26\c-users-heyic-projects-phrase-app-2\短词记2.0
```

学习页：

```text
src\app\learn\page.tsx
```

今日页：

```text
src\app\page.tsx
```

复习与巩固页：

```text
src\app\review\page.tsx
```

翻转预览卡：

```text
src\components\PreviewStudyCard.tsx
```

第 1 天校准 UI：

```text
src\components\CalibrationSession.tsx
```

义项展示：

```text
src\components\MeaningSenses.tsx
```

全局视觉：

```text
src\app\globals.css
```

领域规则：

```text
src\lib\domain\learning-policy.ts
src\lib\domain\learning-flow.ts
src\lib\domain\preview-order.ts
src\lib\domain\booster-selection.ts
src\lib\domain\review-flow.ts
src\lib\domain\grading.ts
src\lib\domain\scheduler.ts
src\lib\domain\text.ts
```

数据事务：

```text
src\lib\data\repositories.ts
src\lib\data\db.ts
src\lib\data\settings.ts
```

学习线持久化：

```text
src\lib\hooks\usePersistedTrack.ts
```

导入系统：

```text
src\lib\import\schema.ts
src\lib\import\normalize.ts
src\lib\import\importer.ts
```

PWA 缓存：

```text
public\sw.js
src\components\ServiceWorker.tsx
```

当前缓存版本：

```text
phrase-memory-2-v17
```

---

## 14. GitHub Pages

静态配置：

```text
next.config.ts
```

GitHub Actions：

```text
.github\workflows\pages.yml
```

构建命令：

```powershell
$env:NEXT_PUBLIC_BASE_PATH="/仓库名"
npm run build
```

构建输出：

```text
out\
```

当前发布包不包含：

- `node_modules`
- `.next`
- `out`
- `local-data`
- `.npm-cache`
- `.git`

---

## 15. 已修复的重要 Bug

### 15.1 切换学习线后错误显示完成

原因：

- 固定搭配的 `completed` 状态残留在页面状态中。
- 返回学习页时还会默认跳回固定搭配。

修复：

- 删除跨学习线共用完成状态。
- 完成状态只读取当前学习会话。
- 当前学习线保存到 `localStorage`。

### 15.2 设置 4 个但少于 4 个

原因：

- 避近义词和混淆组的一轮选择可能不足数量。

修复：

- 先严格控制冲突。
- 数量不足时再做放宽补齐。
- 库存足够时严格给满目标数量。

### 15.3 翻转卡在正式页显示镜像正面

原因：

- 卡片本体上的淡入动画/滤镜破坏 `preserve-3d`。

修复：

- 移除会压平 3D 的动画。
- 翻转动作单独保留。

### 15.4 预览顺序没打乱

原因：

- 早期原型使用固定数组。

修复：

- 正式版使用会话种子乱序。
- 每轮认识次数层级再次打乱。
- 相邻轮次不会保持完全相同顺序。

### 15.5 第二轮与正式复习冲突

修复：

- 巩固使用独立 `booster` 日志。
- 不创建或移动正式复习状态。
- 正式到期复习优先。

### 15.6 快速切换学习线导致异步串线

修复：

- 学习页和复习页使用请求序号。
- 旧请求晚返回时直接忽略。
- 提交按钮执行期间锁定学习线切换。

### 15.7 旧缓存继续使用

修复：

- Service Worker 缓存版本递增。
- 页面采用网络优先。
- 静态资源缓存仍然保留。

---

## 16. 已验证的测试场景

### 16.1 单元和集成测试

最近一次完整结果：

```text
18 test files passed
75 tests passed
```

测试目录：

```text
tests\
```

重点测试：

- 预览认识次数 4/3/2
- 直接点“认识”不翻转也计数
- 每次重新出现先回到英文正面
- 预览每轮打乱
- 认识次数目标
- 中文宽判定
- 多义词和义项例句
- 第 0 天四关
- 第 1 天四轮校准
- 长期复习调度
- 复习队列公平性
- 120 天模拟
- 926 条完整词库一年模拟
- 备份恢复
- JSON 导入与去重
- 专升本词表合并
- 低库存巩固
- 30 天巩固轮换
- 正式复习优先
- 跨天未完成巩固归档
- 仍有未学新词时禁止巩固

### 16.2 30 天巩固模拟结果

设置：

- 已学词 12 个
- 每天巩固 4 个

结果：

- 每个词 30 天中刚好出现 10 次
- 前 3 天覆盖全部 12 个词
- 第 4 天从第 1 批重新开始
- 没有词被遗漏

### 16.3 120 天复习公平性

```text
cards: 300
neverReviewed: 0
maxReviewWaitDays: 2
maxOverdueDays: 2
```

### 16.4 926 条整库模拟

```text
fullDeckCards: 926
neverReviewed: 0
maxFirstReviewWait: 5
```

### 16.5 浏览器测试

已覆盖：

- 390px 手机宽度
- 320px 小屏宽度
- 卡片正反面翻转
- 不翻转直接评价
- 评价按钮始终可见
- 滑动到底部后按钮可操作
- 学习线切换
- 从“我的”返回学习页
- 低库存巩固入口
- 巩固答题后正式复习状态不变
- 浏览器控制台无错误

---

## 17. 当前命令

在项目目录运行：

```powershell
cd "C:\Users\heyic\Documents\Codex\2026-10-26\c-users-heyic-projects-phrase-app-2\短词记2.0"
```

### 全量检查

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test
npm.cmd run build
```

或者：

```powershell
npm.cmd run check
```

注意：

- 当前 PowerShell 环境可能禁止直接运行 `npm` 脚本包装器。
- 使用 `npm.cmd` 可以绕过该限制。
- 不要因此修改系统执行策略。

### 本地静态预览

```powershell
$env:PORT="4177"
node scripts/serve-static.mjs
```

### 带本地测试词库的预览

构建：

```powershell
$env:NEXT_PUBLIC_LOCAL_PREVIEW_SEED="1"
npm.cmd run build
```

服务器：

```powershell
$env:ENABLE_LOCAL_PREVIEW_SEED="1"
$env:PORT="4200"
node scripts/serve-static.mjs
```

本地测试词库仅用于开发，不会进入正式 GitHub 包。

---

## 18. 已知架构债和后续检查重点

### 18.1 `repositories.ts` 仍然较大

当前文件约 1900 行，包含学习、复习、导入、备份、统计和恢复。

当前没有强行拆分，原因：

- 多个操作共享 IndexedDB 事务。
- 用户已经有真实学习进度。
- 贸然拆分事务容易引入数据一致性问题。

未来建议按以下顺序拆分，但必须保留现有公开导出作为兼容门面：

1. `repositories/learning.ts`
2. `repositories/review.ts`
3. `repositories/statistics.ts`
4. `repositories/backup.ts`

### 18.2 没有把 Playwright E2E 测试文件提交到仓库

当前浏览器流程是本地使用 Playwright/MCP 手工运行验证。

后续可增加：

- `e2e/learning.spec.ts`
- `e2e/review.spec.ts`
- `e2e/booster.spec.ts`
- `e2e/navigation.spec.ts`

### 18.3 多词义数据仍需人工抽查

多义词、例句和翻译由数据脚本处理，仍需观察真实学习反馈。

### 18.4 次数参数仍是产品假设

- 预览 2/3/4 次
- 含义回忆 1/2/3 次
- 拼写累计 3 次
- 4 条例句

这些不是临床最优值，需要长期使用数据评估。

### 18.5 多标签页并发

当前主要假设单标签页使用。
多个标签页同时操作同一 IndexedDB 时，最后写入的结果可能覆盖另一标签页的界面状态。

### 18.6 旧数据兼容

新增 `ReviewPlan.kind`、`ReviewLog.mode = booster` 和 `CardProgress.lastBoosterAt` 都是兼容字段。
旧备份缺少这些字段时可以正常读取。

---

## 19. 新窗口继续检查时的建议顺序

1. 先读本文件。
2. 运行：

```powershell
npm.cmd run test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

3. 打开本地应用：

```text
http://127.0.0.1:4177/learn/
```

4. 优先检查：

- 固定搭配完成 → 动词句型未完成 → 点击“我的” → 返回学习
- 每日上限 4，但库存和冲突组较多时是否严格给 4
- 预览每次出现是否都是纯英文正面
- 不翻转直接点“认识”是否累计
- 陌生/模糊清零后是否重排
- 有到期正式复习时是否禁止巩固
- 还有未学新词时是否禁止巩固
- 未完成巩固跨天后是否归档
- 30 天巩固轮换是否均匀
- 多义词义项题和例句是否一致
- 320px 手机宽度是否出现横向溢出
- GitHub Pages 子路径下资源、路由和 Service Worker 是否正常

5. 修改后必须重新跑测试和构建，并更新 Service Worker 缓存版本。

---

## 20. 不要破坏的关键不变量

- 固定搭配和动词句型不能混为一条学习线。
- 不能把私人 JSON 嵌入源码或上传包。
- 不能覆盖已有 `CardProgress` 和 `ReviewState` 来“重新学”。
- 巩固轮不能修改正式复习日期。
- 正式到期复习必须优先于巩固。
- 还有未学新词时必须优先新词。
- 每次预览重新出现都必须从纯英文正面开始。
- 不翻转直接选择评价必须有效。
- 达到认识目标后才能通过预览。
- 拼写必须累计正确 3 次。
- 中文答案不能退化为只接受某个单一标点写法。
- 不确定时先增加测试，不要直接推倒数据事务。

