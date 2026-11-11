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

---

# 2026-11-05 当前重构交接（此附录优先）

> 本节是当前源码的唯一事实来源。前文保留为历史设计记录；如果前文与本附录冲突，以本附录和 `tests/` 中的现行测试为准。

## A1. 项目绝对路径

```text
C:\Users\heyic\Documents\Codex\2026-10-26\c-users-heyic-projects-phrase-app-2\短词记2.0
```

项目当前不是 Git 仓库。历史本地词库仅在：

```text
C:\Users\heyic\Documents\Codex\2026-10-26\c-users-heyic-projects-phrase-app-2\短词记2.0\local-data
```

`local-data/` 已加入 `.gitignore`，不得进入 GitHub 上传包。

## A2. 当前验证结果

截至 2026-11-05：

```text
21 test files passed
88 tests passed
typecheck passed
lint passed
production static build passed
```

统一验证：

```powershell
cd "C:\Users\heyic\Documents\Codex\2026-10-26\c-users-heyic-projects-phrase-app-2\短词记2.0"
npm.cmd run check
```

## A3. 页面与路由

```text
src/app/page.tsx             今日页
src/app/learn/page.tsx       新学与第 0 天四关
src/app/review/page.tsx      隔天校准、正式复习、巩固
src/app/library/page.tsx     词库
src/app/import/page.tsx      JSON 导入
src/app/profile/page.tsx     设置、统计、备份恢复
src/components/QuickReviewSheet.tsx  今日快闪
```

## A4. 今日页与今日快闪

今日页读取 `getTodayData()`，分别展示：

```text
fixed          固定搭配
verb-pattern   动词句型
```

今日统计使用显式 ID 集合：

```text
reviewCompletedIds      成功完成
reviewFailedIds         今日失败、明天重试
reviewSettledIds        今日已处理 = 成功 + 失败待重试
reviewPendingIds        仍待处理
```

“今日背诵”右侧提供“今日快闪”按钮。

快闪内容：

```text
track.session ? track.learningPhrases : track.newPhrases
```

默认覆盖当前筛选下两条学习线今天的学习内容。

方向：

```text
English -> 中文
中文 -> English
```

规则：

- 每张卡答对一次即从当前方向队列移除。
- 答错不推进，可以重试。
- 两个方向分别记录进度。
- 进度使用 localStorage，仅在当天有效：

```text
phrase-memory-2-quick-review:YYYY-MM-DD:en-zh
phrase-memory-2-quick-review:YYYY-MM-DD:zh-en
```

- 快闪不写 ReviewLog、CardProgress 或 ReviewState，不影响校准和正式复习。

## A5. 新学流程

每条学习线每天最多创建一个：

```text
id = YYYY-MM-DD:trackId
```

默认每日新学：

| 项目 | 固定搭配 | 动词句型 |
|---|---:|---:|
| 每日新学 | 6 | 4 |
| 每日复习上限 | 25 | 25 |
| 两线复习总上限 | 50 | 50 |

到期正式任务达到总容量 80% 时新学减半，达到 100% 时暂停新学。

新词选择：

1. 当前学习线未学、未归档。
2. priority 小的优先。
3. 同优先随机。
4. 避免同 confusionGroup 或近义冲突。
5. 冲突导致不足时允许第二轮放宽补齐。

## A6. 第 0 天预览

- 正面只显示英语。
- 点击后 3D 翻到中文、其他义项、例句和翻译。
- 每次重新出现先重置到英文正面。
- 可以直接点评级，不强制翻面。

预览累计确认目标：

| 初始评级 | 次数 |
|---|---:|
| 认识 | 2 |
| 模糊 | 3 |
| 陌生 | 4 |

相邻确认轮顺序不能完全相同，刷新后同一轮顺序稳定。

## A7. 第 0 天四关

```text
1. 含义回忆
2. 主动产出
3. 语境应用
4. 出口测试
```

含义回忆连续正确：

| 评级 | 次数 |
|---|---:|
| 认识 | 1 |
| 模糊 | 2 |
| 陌生 | 3 |

所有中 -> 英拼写统一规则：

```text
累计正确 2 次
错误不清零
错误只增加 attempts / incorrectAttempts
```

该规则用于：

- 第 0 天主动产出
- 第 1 天校准第四轮
- 长期正式复习拼写
- 第二轮及以后巩固拼写

多义词出口测试必须逐个通过所有次要义项。主义项以 `primary: true` 判断，不能假设索引一定是 0。

第 0 天完成后：

```text
CardProgress.state = incubating
calibrationDueOn = 次日
```

不创建长期 ReviewState。

## A8. 第 1 天四轮校准

| 轮次 | 内容 |
|---|---|
| 1 | 英 -> 中 |
| 2 | 形式选择 |
| 3 | 语境；多义词逐义项 |
| 4 | 中 -> 英，累计正确 2 次 |

多义词第三轮分别记录每个次要义项的首答、最终正确和尝试次数。任一义项首次错误必须影响等级。

旧版“答对一个义项就通过第三轮”的活动计划会在读取时重新打开第三轮。

失败判定：

```text
failureStreak >= 3 -> D -> 次日重校准
```

“错-对-对”不会判 D。

## A9. 首次正式复习

| 等级 | 间隔 |
|---|---:|
| S | 4 天 |
| A | 2 天 |
| B | 1 天 |
| C | 1 天 |
| D | 次日晚重校准 |

## A10. 长期正式复习

每张卡通常抽两种不同题型：

```text
meaning
phraseChoice
contextChoice
senseChoice
spelling
cloze
```

- 拼写累计答对 2 次。
- 任一其他题型错误触发纠错。
- 当前最多 3 次完整尝试：首轮 + 最多 2 次纠错。
- 纠错重新抽题和打乱卡序。
- 第三次仍失败，本次结束并更早复习。
- 首次错误影响间隔质量，不能被后续纠错覆盖。

间隔：

- 全对：扩大；连续两次高质量成功升级。
- 部分正确：小幅扩大并降低难度系数。
- 全错或第三次纠错失败：回到 1 天。
- 连续两次失败降级。

## A11. 第二轮及以后巩固

解锁必须满足：

- 两条线无今天到期的正式复习。
- 无今天到期的校准。
- 无进行中的校准。
- 当前线无进行中的第 0 天学习。
- 当前线全部非归档词都已完成第一轮学习。
- 今天没有因容量延后的正式任务。

第一次巩固是第二轮，之后依次第三、第四轮。

`ReviewPlan.kind = "booster"` 保存：

```text
boosterRound
```

`CardProgress` 保存：

```text
boosterCompletedRounds
lastBoosterRound
boosterMistakeCount
lastBoosterPassed
lastBoosterAt
firstRoundWeaknessScore
```

下一轮：

```text
max(2, 当前线已学卡最低 boosterCompletedRounds + 1)
```

每日批量等于当前线每日新学数量，默认固定搭配 6、动词句型 4。

排序：

第二轮：

```text
firstRoundWeaknessScore DESC
-> 风险
-> 更久未巩固
-> 稳定随机
```

第三轮及以后：

```text
boosterMistakeCount DESC
-> firstRoundWeaknessScore DESC
-> 风险
-> 更久未巩固
-> 稳定随机
```

`firstRoundWeaknessScore` 是固定快照，包含：

- 校准/临时等级风险
- 初始评级风险
- 第 0 天各关卡错误
- 重试次数
- fragile 能力项

`boosterMistakeCount` 是最近一轮巩固首轮答错题数。

完成保证：

- 当前轮未完成卡始终优先。
- 每日只取当前轮尚未完成的卡。
- 全部完成才进下一轮。
- 中途退出时只有完成卡增加轮次，未完成卡下次继续优先。
- 新增词从它的第二轮开始，旧卡不会在同一轮重复。

巩固不创建或修改 ReviewState，不改变正式 grade、interval、nextReviewOn、校准日期。

巩固会更新 skills、lastBoosterAt、boosterMistakeCount、lastBoosterPassed、boosterCompletedRounds、lastBoosterRound。

## A12. 学习线切换

键：

```text
phrase-memory-2-active-track
```

URL：

```text
?track=fixed
?track=verb-pattern
```

主动切换会同步 storage、URL 并保留其他查询参数。刷新保持最后选择。

准备和提交期间禁止切换。所有异步加载使用请求代次。

## A13. 数据库

```text
PhraseMemory2
```

表：

```text
phrases
learningSessions
cardProgress
reviewStates
reviewPlans
calibrationPlans
reviewLogs
importJobs
```

新增字段均为可选字段，不需要清库或重建对象仓库。

## A14. 关键源码

```text
src/lib/domain/constants.ts
src/lib/domain/types.ts
src/lib/domain/learning-flow.ts
src/lib/domain/learning-policy.ts
src/lib/domain/preview-order.ts
src/lib/domain/review-flow.ts
src/lib/domain/scheduler.ts
src/lib/domain/grading.ts
src/lib/domain/booster-selection.ts
src/lib/domain/text.ts
src/lib/domain/date.ts

src/lib/data/db.ts
src/lib/data/repositories.ts
src/lib/data/settings.ts

src/lib/hooks/usePersistedTrack.ts
src/lib/hooks/useLocalDay.ts
src/lib/hooks/useQuestionScroll.ts

src/lib/import/schema.ts
src/lib/import/normalize.ts
src/lib/import/importer.ts

src/app/layout.tsx
src/app/page.tsx
src/app/learn/page.tsx
src/app/review/page.tsx
src/app/library/page.tsx
src/app/import/page.tsx
src/app/profile/page.tsx

src/components/PreviewStudyCard.tsx
src/components/CalibrationSession.tsx
src/components/QuickReviewSheet.tsx
src/components/Sheet.tsx
src/components/MeaningSenses.tsx
```

## A15. 测试

```text
tests/learning-flow.test.ts
tests/learning-policy.test.ts
tests/learning-experience.test.ts
tests/preview-order.test.ts
tests/four-round-flow.test.ts
tests/scheduler.test.ts
tests/long-term.test.ts
tests/fairness.test.ts
tests/simulation.test.ts
tests/booster-flow.test.ts
tests/booster-selection.test.ts
tests/booster-multi-round.test.ts
tests/import.test.ts
tests/backup.test.ts
tests/regression-fixes.test.ts
tests/spelling-target.test.ts
tests/pwa-config.test.ts
```

## A16. PWA 与 GitHub Pages

```text
next.config.ts
public/sw.js
src/components/ServiceWorker.tsx
scripts/prepare-static-export.mjs
.github/workflows/pages.yml
```

- 页面网络优先。
- `_next/static` 文件名内容哈希。
- 缓存前缀 `phrase-memory-2-`。
- 构建自动替换 `__BUILD_ID__`。
- 只清理本应用前缀缓存。
- CI 执行 typecheck、lint、test、build。

禁止进入构建产物：

```text
local-data/
local-preview/
backup-smoke.json
node_modules/
.next/
out/
```

## A17. 重构顺序

1. 先补仓储层接口测试。
2. 按 learning/review/calibration/booster/statistics/backup 拆分 `repositories.ts`。
3. 保留现有公开导出作为兼容门面。
4. 把 QuickReview 状态抽成纯 reducer。
5. 把今日页统计继续下沉到数据层。
6. 增加 Playwright E2E 和固定测试数据。
7. 不要在同一个大提交里同时改规则、模型和 UI。

## A18. 不得破坏

- 两条学习线统计、进度和巩固轮次隔离。
- 校准优先于正式复习。
- 正式复习优先于巩固。
- 巩固不创建校准，不改正式复习日期。
- 拼写累计正确 2 次，错误不清零。
- 多义词每个次要义项都必须通过。
- 快闪不写正式学习/复习状态。
- 私有词库不进入 GitHub 上传包。
- 不清空现有 IndexedDB。

## A19. 需求确认与修改记录

这一节记录用户在后续对话中明确确认的产品语义，优先级高于前文历史原型描述。

### 1. 初始目标

- 固定搭配和动词句型必须独立学习、独立复习、独立统计。
- 用户手动导入私有 JSON，源码和 GitHub 包不能内置私有词库。
- 学习数据保存在当前浏览器 IndexedDB。
- 最终通过 GitHub Pages 静态发布，手机浏览器可用。

### 2. 第一次完整审计后已修复的问题

- 校准反馈出现后仍能按 Enter 重复提交。
- 多义词校准只通过一个义项就进入下一轮。
- “连续失败 3 次”错误地按总尝试次数判断。
- 另一条线有正式复习时仍可能生成巩固。
- `?track=` 在刷新后覆盖用户主动切换的学习线。
- 复习准备存在旧异步任务回写新学习线的风险。
- 今日页完成数和分母来自不同口径。
- Service Worker 会删除同源其他项目缓存。
- 缓存版本依赖手工修改。
- CI 缺少 lint。

### 3. 拼写规则变更

用户明确要求：

```text
中 -> 英默写太多了，改为正确默写两次即可
答错不清零
```

该规则同步用于第 0 天主动产出、第 1 天校准、长期正式复习和巩固。

### 4. 巩固的产品语义

用户明确确认：

- 第二轮巩固不是正式复习。
- 当前学习线第一轮全部学完后才出现第二轮。
- 第二轮按每日新学数量分批，例如每天 10 个。
- 第二轮会覆盖当前学习线全部已学词，然后进入第三轮。
- 第三轮、第四轮继续循环，轮次不固定为两轮。
- 第二轮顺序根据第一轮学习时的相对弱点。
- 第三轮起根据上一轮巩固中的错误动态调整。
- 巩固不增加校准，不影响正式复习日期。
- 巩固是纯额外复习。

用户否定过的方案：

- 不能把巩固当成正式 `ReviewState`。
- 不能因为今天做完一批新词就让整个学习线尚未学完时提前开启第二轮。
- 不能只随机抽样而不保证整轮覆盖。
- 不能只有第二、第三轮，后续轮次必须能继续递增。

### 5. 今日快闪

用户明确要求：

- 今日页增加一个按钮。
- 可以选择英 -> 中或中 -> 英。
- 每个今日学习词答对一次即可。
- 仅用于当天。
- 使用小卡片弹窗。
- 空闲时可以随时复习。
- 不参与校准和正式复习。

实现选择：

- 两个方向分别保存当天 localStorage 进度。
- 答错不推进，答对一次后移除。
- 关闭再打开可继续当天进度。
- 次日自动使用新的日期键。
- 不写 `ReviewLog`、`CardProgress`、`ReviewState`。

### 6. 交接要求

用户要求：

- 所有当前逻辑、内容、路径和修改记录写入本 Markdown。
- 新窗口需要能直接基于本文件继续重构。
- 新窗口不能把前文旧设计误当成当前要求。

### 7. 新窗口必须遵循的冲突处理

发生冲突时，优先级从高到低：

```text
用户最新明确要求
-> 本文件 A1-A20 当前交接
-> 现有 tests/
-> 前文历史设计
```

如果最新用户要求会改变学习或复习语义，新窗口必须先向用户确认，不能自行推断。

---

# A20. 2026-11-05 启动、2026-11-06 完成：仓储分层、快速快闪与浏览器门禁

本节记录本轮经用户批准的重构结果。A20 不改 A1–A19 中的产品或学习语义，只改变代码组织、测试基础设施和发布验证方式。

## A20.1 新模块结构

`src/lib/data/repositories.ts` 现在只保留兼容重新导出，不再包含查询、事务或领域实现：

```text
src/lib/data/repositories.ts
src/lib/data/repositories/learning.ts
src/lib/data/repositories/review.ts
src/lib/data/repositories/calibration.ts
src/lib/data/repositories/booster.ts
src/lib/data/repositories/statistics.ts
src/lib/data/repositories/backup.ts
src/lib/data/repositories/shared/helpers.ts
src/lib/data/repositories/shared/progress.ts
src/lib/data/repositories/shared/workload.ts
```

职责：

- `learning.ts`：学习会话、预览评级、预览确认、第 0 天四关和完成。
- `review.ts`：正式复习计划、队列、尝试、纠错和调度完成。
- `calibration.ts`：第 1 天四轮校准、多义词义项结果和等级完成。
- `booster.ts`：巩固资格、候选、轮次和计划创建。
- `statistics.ts`：词库读取、今日页读模型、统计和日志查询。
- `backup.ts`：完整备份恢复。
- `shared/progress.ts`：例句使用、义项使用和首轮弱点快照。
- `shared/workload.ts`：正式工作阻塞快照和下一巩固轮次。
- `shared/helpers.ts`：短语映射和旧学习会话读取归一化。

依赖边界：

```text
domain -> 不依赖 React、Dexie 或 data
statistics -> 只依赖 db、domain 和 shared 读模型
review -> 不依赖 booster
booster -> 可单向依赖 review
页面/组件/import -> 继续通过 repositories.ts 兼容门面导入
```

## A20.2 关键 Dexie 事务集合

拆分后事务边界保持不变，自动化契约测试固定以下集合：

```text
ensureLearningSession
  learningSessions, cardProgress, phrases, reviewStates

预览评级 / 预览确认
  learningSessions, cardProgress

recordLearningGateAnswer
  learningSessions, cardProgress, reviewLogs, phrases

ensureReviewPlan
  reviewPlans, reviewStates, phrases, calibrationPlans, cardProgress

ensureBoosterReviewPlan
  reviewPlans, cardProgress, reviewStates, phrases,
  learningSessions, calibrationPlans

ensureCalibrationPlan
  calibrationPlans, cardProgress, reviewStates, phrases, reviewPlans

recordCalibrationAnswer
  calibrationPlans, reviewLogs, cardProgress, reviewStates, phrases

recordReviewAnswer
  reviewPlans, reviewLogs, cardProgress, reviewStates, phrases

restoreBackup
  phrases, learningSessions, cardProgress, calibrationPlans,
  reviewStates, reviewPlans, reviewLogs
```

所有读写仍使用数据库 `PhraseMemory2` 和 IndexedDB schema version 2。没有清库、重建对象仓库或数据库版本升级。

## A20.3 今日页统计

`statistics.ts` 新增纯读模型 `summarizeTodayData()`。今日页的总数、已完成、待学、待复习、正式到期、失败待重试和巩固入口判断统一下沉到该函数。

统计继续使用显式 ID 集合：

```text
reviewCompletedIds
reviewFailedIds
reviewSettledIds
reviewPendingIds
```

`reviewSettledIds = reviewCompletedIds + reviewFailedIds` 且不会继续留在 `reviewPendingIds`。

## A20.4 今日快闪状态

今日快闪拆为：

```text
src/lib/domain/quick-review.ts
src/lib/data/quick-review-storage.ts
src/components/QuickReviewSheet.tsx
```

规则保持：

- English -> 中文和中文 -> English 分开保存。
- 键仍为 `phrase-memory-2-quick-review:YYYY-MM-DD:en-zh` 和 `phrase-memory-2-quick-review:YYYY-MM-DD:zh-en`。
- 答错不推进。
- 答对一次后移除。
- 关闭后可继续当天进度。
- 次日自动使用新日期键。
- 不读取或写入 `ReviewLog`、`CardProgress`、`ReviewState`。

## A20.5 学习线切换和异步保护

新增：

```text
src/lib/domain/track-selection.ts
```

保留：

```text
localStorage key = phrase-memory-2-active-track
URL = ?track=fixed | ?track=verb-pattern
```

主动切换继续同步 storage 和 URL，并保留其他查询参数与 hash。学习页和复习页使用请求代次拒绝旧异步结果；加载、开始、准备、预览保存和提交期间禁止切换学习线。

## A20.6 固定测试数据与仓储契约

新增合成 fixture：

```text
tests/fixtures/phrases.ts
tests/fixtures/db.ts
e2e/fixtures/seed.ts
```

这些 fixture 不依赖 `local-data/`、相邻 `outputs/` 或用户私有词库。

仓储契约测试覆盖：

- 数据库表和 schema version 不变。
- 所有兼容门面导出仍可用。
- 每个仓储函数定义只存在一次。
- Dexie 事务表集合不变。
- 拆分完成后门面不再包含实现。
- domain 不依赖 React、Dexie 或 data。
- statistics 不调用写仓储。
- review 不反向依赖 booster。
- `src/lib` 无 import cycle。
- 拼写累计正确 2 次。
- 正式复习总尝试上限为 3。
- 巩固第二轮按首轮弱点，第三轮起按上一轮巩固错误优先。
- 快闪不写正式状态。
- 学习线 storage/URL 契约。

## A20.7 Playwright 与浏览器验证

Playwright 固定版本：

```text
@playwright/test 1.51.1
```

Windows 本地使用系统 Microsoft Edge (`channel: "msedge"`)；其他平台默认使用 Playwright Chromium，CI 直接使用 Ubuntu runner 预装的 Google Chrome (`PLAYWRIGHT_CHANNEL=chrome`)。

GitHub Actions 的独立 `Browser checks` workflow 可通过手动触发运行，使用 runner 预装的 Chrome 执行主流程、Pages 子路径和 PWA 双构建检查。日常 Pages 部署只执行 typecheck、lint、test 和 build，避免浏览器回归拖慢发布。

命令：

```powershell
npm.cmd run test:e2e
npm.cmd run test:e2e:pages
npm.cmd run test:e2e:pwa
```

已执行的真实浏览器检查：

- 学习线 URL/localStorage 恢复。
- 快速切换后最终学习线正确。
- 今日快闪英文/中文方向、答错不推进、当天续做和正式数据隔离。
- 第 2 轮巩固入口打开，且不创建 `ReviewState`。
- 320px 无横向溢出，底部五项导航可见。
- GitHub Pages `/phrase-memory-2/` 子路径可加载，manifest 和 `sw.js` 路径正确。
- 连续构建 `e2e-cache-a` 与 `e2e-cache-b` 两个不同 Build ID。
- 浏览器升级后旧 `phrase-memory-2-e2e-cache-a` 被删除，新 cache b 生效。
- 同源无关缓存 `other-project-v1` 在升级后保留。

## A20.8 验证命令

每个重构阶段均执行过：

```powershell
npm.cmd run check
```

最终验证分为三层：

```text
1. Vitest 单元/集成测试
2. typecheck + lint + production static build
3. Playwright 主流程、Pages 子路径和 PWA 双构建缓存升级
```

对随机或 seeded 流程连续运行多次完整 Vitest，结果必须一致。

## A20.9 数据兼容性

- 数据库名、表和 schema version 未改变。
- 未删除或重建用户 IndexedDB。
- 新增仓储模块和纯状态模块不改变持久化记录。
- `ReviewPlan`、`CardProgress` 等可选字段保持向后兼容。
- 备份格式仍为 `phrase-memory-backup-3.0`。
- 测试数据只在合成 fixture 中生成。

## A20.10 剩余风险

- 多标签页同时操作同一 IndexedDB 仍未做跨页冲突合并。
- Windows 本地 Playwright 使用 Edge，存在平台级句柄滞留风险；本地运行器通过完成标记控制生命周期。CI 使用 Linux Chromium，不依赖该 Windows 行为。
- Playwright 验证使用合成固定数据，不代表真实私有词库的内容质量。
- 真实用户的多义词、例句轮换和长期复习体验仍需要持续观察。

## A20.11 最终验证记录

2026-11-06 最终验证：

```text
Vitest: 31 test files / 117 tests passed
连续完整 Vitest: 3 次通过，结果稳定
typecheck: passed
lint: passed
production static build: passed
Playwright main browser checks: passed
Playwright Pages subpath check: passed
Playwright PWA two-build cache upgrade check: passed
```

最终生产静态构建给出的缓存版本会随构建内容自动变化，不应手工写回本文。

## A20.12 修复今日快闪仅显示模糊遮罩

问题：

- 在今日内容较长或手机高度较小时，点击“今日快闪”后只看到页面模糊，看不到底部弹窗。

根因：

- `.page` 的入场动画保留了 `transform`，使内部 `position: fixed` 的 Sheet 相对整张长页面定位，而不是相对视口定位。
- 弹窗被排到长页面底部，当前屏幕只能看到覆盖全页的模糊遮罩。

修复：

- `Sheet` 使用 React Portal 挂载到 `document.body`，彻底隔离页面动画、裁剪和 stacking context。
- `.page` 动画不再保留最终 transform。
- 新增 390px x 700px 长页面移动端回归测试，验证今日快闪弹窗始终位于视口内。

该问题与“今日是否学完”无关；只要今日页出现“今日快闪”按钮，点击后就应直接显示方向选择弹窗。

