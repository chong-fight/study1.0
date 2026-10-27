# 短词记 2.0 代码架构

## 1. 目标

本版本完全重写旧应用，保留经过验证的学习产品方向，同时修复旧版中的导航、日期、会话恢复、错题题型和队列顺延问题。

核心要求：

- Next.js 16.4 App Router、TypeScript、静态导出。
- 本地优先，Dexie + IndexedDB 保存学习数据。
- 固定搭配与动词句型两条独立学习线。
- JSON 内容导入，不在源码中内嵌词库。
- 今日、学习、短语库、复习、我的五个主页面。
- 第 0 天四关学习、第 1 天四轮校准、长期自适应复习。
- 纯函数领域层可以脱离浏览器测试。
- 所有重要业务规则拥有自动化测试。

## 2. 分层

```text
src/
  app/                     路由与页面组合
    page.tsx               今日
    learn/page.tsx         学习
    review/page.tsx        复习
    library/page.tsx       短语库
    profile/page.tsx       我的
    import/page.tsx        JSON 导入预览
  components/
    AppShell.tsx
    BottomNav.tsx
    PageTitleBand.tsx
    PhraseRows.tsx
    Sheet.tsx
    StudyCard.tsx
    ReviewQuestion.tsx
  lib/
    domain/
      types.ts             领域类型
      constants.ts         学习线、能力、题型、默认设置
      date.ts              本地日历日期
      text.ts              标准化与答案判断
      grading.ts           第 1 天校准与等级
      scheduler.ts         长期复习调度
      learning-flow.ts     新学状态机
      review-flow.ts       复习题型与结果计算
    data/
      db.ts                Dexie schema
      repositories.ts      查询与事务
      settings.ts          localStorage 设置
      today.ts             今日视图读模型
    import/
      schema.ts            导入格式
      normalize.ts         旧格式兼容与校验
      importer.ts          去重、更新、事务写入
    hooks/
      useLocalDay.ts       跨午夜自动刷新本地日期
  scripts/
    prepare-static-export.mjs  GitHub Pages RSC 兼容文件
    serve-static.mjs           静态产物本地预览
  tests/
    date.test.ts
    grading.test.ts
    scheduler.test.ts
    import.test.ts
    long-term.test.ts
```

## 3. 数据流

```text
JSON 文件
  -> 解析与格式识别
  -> 旧字段标准化
  -> 预览与错误报告
  -> 以 track + normalizedPhrase 去重
  -> IndexedDB 事务
  -> 今日读模型
  -> 学习/复习会话
  -> CardProgress + ReviewState + ReviewLog
```

页面不直接实现业务公式。页面只调用领域函数与 repository。

## 4. 核心数据

### Phrase

- `id`: `track:normalizedPhrase`，稳定业务 ID。
- `trackId`: `fixed` 或 `verb-pattern`。
- `phrase`, `meaning`
- `exampleEn`, `exampleZh`
- `entryType`, `category`, `tags`, `priority`
- `exerciseModes`
- `supportsCloze`
- `confusionGroup`
- `synonyms`
- `contentStatus`
- `archived`

### LearningSession

- 每天每条学习线最多一个。
- `id = date:trackId`。
- 保存本次新卡 ID 与阶段。

### CardProgress

- `id = phraseId`。
- 第 0 天信号、暂定等级、确认等级。
- 四项能力状态。
- 校准日期。

### ReviewState

- 每个 phrase 一条。
- 当前等级、难度系数、间隔、连续成功/失败。
- `nextReviewOn` 使用本地 `YYYY-MM-DD`。

### ReviewPlan

- 每个日期与学习线一个。
- 持久化当天选中的复习卡片和顺延数量。
- 刷新页面不会重新抽取队列。

## 5. 学习状态机

```text
新卡
  -> 第 0 天含义回忆
  -> 第 0 天主动产出
  -> 第 0 天语境应用
  -> 第 0 天出口测试
  -> incubating
  -> 次日校准第 1 轮：英→中
  -> 第 2 轮：选择正确英文形式
  -> 第 3 轮：新语境应用
  -> 第 4 轮：中→英
  -> scheduled
  -> review
  -> scheduled | relearning
```

第 0 天只产生暂定信号，不进入长期调度。第 1 天四轮全部完成后才创建 ReviewState。

## 6. 队列规则

- 新学队列按学习线、独立上限构建。
- 同日不选择同一 `confusionGroup` 的多张新卡。
- 复习队列先校准，后长期复习。
- 长期复习按“逾期天数 × 100 + 等级风险 + 连续顺延奖励”计算紧迫度。
- 每日计划持久化，超限卡片只顺延一次到下一日。
- 日期全部通过本地日历工具生成，不使用 `toISOString().slice(0, 10)`。
- 到期量达到复习上限 80% 时新学减半，达到上限时默认暂停新学。

## 7. 导入策略

- 支持现有的 `phrase-app-audit-2.0` 文件。
- 根据 `metadata.role` 识别学习线。
- 字段映射：
  - `example -> exampleEn`
  - `synonym_details -> synonyms`
  - `example_translation/exampleZh -> exampleZh`
- 同一学习线同一标准化短语只保留一条。
- 更新内容时保留学习进度。
- 缺失翻译或例句只标记内容状态，不阻止导入。
- 导入使用 Dexie 事务，错误时不部分落盘。

## 7.1 完整备份

- 导出包含短语、学习会话、卡牌进度、复习状态、复习计划和答题日志。
- 恢复使用单一 IndexedDB 事务。
- 恢复前必须预览并确认覆盖范围。
- 内容导入与完整备份恢复是两个独立入口。

## 7.2 静态部署

- 默认输出到 `out/`。
- `NEXT_PUBLIC_BASE_PATH` 支持 GitHub Pages 项目子路径。
- 构建后生成 Next RSC 预取文件的扁平别名，兼容普通静态文件托管。
- Service Worker 仅在 production 注册；开发环境自动注销旧缓存。

## 8. 测试策略

### 单元测试

- 本地日期和跨时区边界。
- 等级判断。
- 调度间隔、失败重置、等级升降。
- 文本标准化和答案比较。
- JSON v2 兼容、去重、进度保留。

### 长期模拟

- 模拟 365 天学习与复习。
- 每日只创建一个 session/review plan。
- 所有到期日单调推进。
- 间隔始终为正数。
- 不因超限产生重复计划或无限队列。

### 浏览器测试

- 五个导航选中态。
- JSON 导入两份真实文件。
- 今日数字、检索、详情 Sheet。
- 学习流程、第 1 天校准。
- 复习答错反馈和刷新恢复。
- 375px 与桌面宽度无横向溢出。

## 9. 非目标

- 第一版不包含账号、云同步和在线题库市场。
- 第一版不训练独立机器学习模型。
- 第一版不把 AI 生成作为学习必需条件。
