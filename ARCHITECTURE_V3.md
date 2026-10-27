# 短词记 2.0 代码架构 v3

日期：2026-10-27

## 1. 架构目标

- 保留当前已经验证的产品流程，不做无收益的大规模重写。
- 页面只负责交互和展示，不重复定义学习规则。
- 领域层保持纯函数，可在浏览器外测试。
- 仓储层负责 IndexedDB 事务、持久化和恢复。
- 导入层负责兼容不同 JSON 格式。
- 静态导出后可直接部署到 GitHub Pages。
- 本地预览专用功能必须在正式构建中关闭，不能内嵌私人词库。

## 2. 模块关系

```text
src/app/*                路由和页面编排
        ↓
src/components/*         展示、答题交互、本地预览辅助
        ↓
src/lib/domain/*         业务规则、题型、评分、调度、队列策略
        ↓
src/lib/data/*           Dexie 查询、事务和持久化
        ↑
src/lib/import/*         JSON 解析、标准化和导入
```

依赖方向必须保持单向：页面可以依赖领域层和数据层；领域层不能依赖 React、Dexie 或页面。

## 3. 目录职责

### 3.1 路由和页面

| 路径 | 职责 |
|---|---|
| `src/app/page.tsx` | 今日概览、学习/复习入口、积压提醒 |
| `src/app/learn/page.tsx` | 第 0 天预览、四关学习和会话恢复 |
| `src/app/review/page.tsx` | 长期复习入口、复习题和纠错轮 |
| `src/components/CalibrationSession.tsx` | 第 1 天四轮校准 |
| `src/app/library/page.tsx` | 搜索、筛选和查看词条 |
| `src/app/import/page.tsx` | JSON 预览和确认导入 |
| `src/app/profile/page.tsx` | 节奏设置、备份和恢复 |

### 3.2 纯领域层

| 模块 | 职责 |
|---|---|
| `types.ts` | Phrase、Progress、Plan、Log 等领域类型 |
| `constants.ts` | 学习线、等级、默认间隔和默认设置 |
| `date.ts` | 本地自然日运算 |
| `text.ts` | 中英文标准化、答案比较、稳定乱序 |
| `learning-policy.ts` | 预览与含义回忆的自适应次数规则 |
| `learning-flow.ts` | 新词选择、会话和进度初始化 |
| `review-flow.ts` | 题型选择、例句/义项轮换、挖空和复习轮次常量 |
| `grading.ts` | 第 1 天等级判定 |
| `scheduler.ts` | 间隔扩展、复习队列公平比较 |

本次优化将原先分散在页面和仓储中的阈值收拢到 `learning-policy.ts`，避免页面与数据库规则漂移。

### 3.3 数据层

`src/lib/data/db.ts` 定义 Dexie 表：

- `phrases`
- `learningSessions`
- `cardProgress`
- `reviewStates`
- `reviewPlans`
- `calibrationPlans`
- `reviewLogs`
- `importJobs`

`src/lib/data/repositories.ts` 是当前稳定的数据门面，负责：

- 今日视图组装
- 学习会话创建和恢复
- 预览确认、四关答题、第 1 天校准
- 复习计划选择、答题、纠错轮和间隔更新
- 单词池、统计、备份和恢复

### 3.4 导入层

- `schema.ts`：兼容原始字段
- `normalize.ts`：清洗、识别学习线、建立 4 例句池
- `importer.ts`：比较现有内容、去重、在事务中更新

更新内容时保留 `CardProgress`、`LearningSession`、`ReviewPlan` 等学习进度。

## 4. 状态机

```text
unseen
  → day0 preview
  → day0 meaning
  → day0 production
  → day0 application
  → day0 exit
  → incubating
  → calibration rounds 1..4
  → scheduled
  ↔ review / relearning
```

例外：

- 第 1 天任一卡在一轮内连续失败 3 次：保持 `incubating`，次日重验。
- 长期复习连续 3 个纠错轮仍错误：`relearning`，次日复习。

## 5. 队列算法

### 5.1 复习调度

优先级不使用不稳定的纯权重相加，而是显式比较：

1. 逾期天数
2. `deferralCount`
3. 等级风险
4. 历史错误数
5. 稳定短语 ID

这样可以证明：只要用户持续完成每日复习，最早到期的卡不会永久被新卡挤掉。

### 5.2 学习乱序

`seededShuffle(items, seed)` 使用字符串种子的 Fisher-Yates：

- 刷新可恢复
- 同一轮稳定
- 不同尝试次数、不同关卡、不同深度使用不同种子
- 初次学习与后续重试不共享同一顺序

### 5.3 复习跨卡交错

`getReviewQueue` 先按每张卡已作答题数分组，再在相同深度内稳定乱序。这样：

- 所有卡先完成第一道题
- 再进入第二道题
- 错卡进入纠错轮时不会连续出现

## 6. 内容版本

当前词库格式增加：

- `quizExampleEn`, `quizExampleZh`
- `exampleVariants[]`
- `primaryExampleIndexes[]`
- `senses[]`，每个义项可带 `note`、`exampleEn`、`exampleZh`

多义题型：

- `meaning` 只接受第一个主释义。
- `spelling` 使用主释义作为中文提示。
- `senseChoice` 展示某个义项的语境例句，再选择对应中文义项。
- 第 0 天出口测试要求所有次要义项逐个通过。
- 第 1 天和长期复习会轮换义项使用次数。

兼容策略：

- 缺少新字段的旧 JSON 仍可导入。
- 只有一两条例句时内容状态标记 `needsReview`。
- 页面在无法可靠挖空时回退为短语选择题。
- 导入相同 ID 时更新内容而不覆盖学习进度。

## 7. 静态部署和缓存

- `output: "export"`
- `trailingSlash: true`
- 自动写入 `.nojekyll`
- GitHub Actions 使用仓库名作为 `NEXT_PUBLIC_BASE_PATH`
- Service Worker：
  - 生产环境注册
  - `updateViaCache: "none"`
  - 主动检查更新
  - 新控制器接管时自动刷新一次
  - 每次发布递增缓存版本

## 8. 本地预览专用机制

`LocalPreviewSeed` 仅在：

```text
NEXT_PUBLIC_LOCAL_PREVIEW_SEED=1
```

时启用。

它用于把固定搭配自动导入当前测试浏览器。正式 GitHub 构建未设置该变量，因此：

- 不读取私人词库
- 不自动导入数据
- GitHub 包中不包含 `local-data`

## 9. 测试分层

| 层 | 代表测试 |
|---|---|
| 日期和文本 | `date-and-text.test.ts` |
| 自适应规则 | `learning-policy.test.ts` |
| 新词选择 | `learning-flow.test.ts` |
| 第 0 天和第 1 天 | `four-round-flow.test.ts` |
| 例句与错题轮次 | `learning-experience.test.ts` |
| 调度数学 | `scheduler.test.ts` |
| 长期公平性 | `fairness.test.ts`、`simulation.test.ts` |
| JSON 导入 | `import.test.ts` |
| 真实词库质量 | `local-data-quality.test.ts` |
| 备份恢复 | `backup.test.ts` |

## 10. 代码审查结论

### 已修复

- 页面和仓储重复定义阈值
- 题型扩展逻辑位于数据层
- 优先级在随机后失效
- 复习按原计划顺序轮转
- 两学习线额度不能完整互相补给
- 复习错题无上限
- Service Worker 只注册、不主动更新
- 本地预览辅助缺少错误保护

### 保留的架构债务

`repositories.ts` 仍约 1800 行，页面组件也较大。当前不立即拆分的原因是：

1. 数据事务彼此关联，贸然拆分容易引入跨事务一致性问题。
2. 用户已有多轮学习进度，需要先保证迁移稳定。
3. 当前测试覆盖已能约束行为。

后续建议在真实使用稳定后按以下顺序拆分：

1. `repositories/learning.ts`
2. `repositories/review.ts`
3. `repositories/statistics.ts`
4. `repositories/backup.ts`
5. 保持现有公开导出作为兼容门面

## 11. 架构债决策

当前决定：

- 本轮不拆分 `repositories.ts`。
- 本轮不重写 `learn/page.tsx` 和 `review/page.tsx`。
- 已先提取 `learning-policy.ts`、义项展示组件和领域题型扩展。

原因：

- 当前用户数据已包含真实进度，跨模块搬迁事务代码的收益低于风险。
- 现有测试已经覆盖核心不变量。
- 多义词是比文件拆分更高优先级的功能正确性变化。

下一轮拆分顺序：

1. 先抽离纯查询与备份，不改事务边界。
2. 再按学习/复习拆分 repository。
3. 最后把页面拆成小展示组件。

## 12. 非目标

- 不引入账号系统
- 不引入云同步
- 不把私人 JSON 打进 GitHub 仓库
- 不进行推倒重写
- 不宣称现有固定次数是普遍最优参数
