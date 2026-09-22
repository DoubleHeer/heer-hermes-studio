---
name: json-render-form
description: Generate a json-render generative UI form from a plain business description. The user only says what the form is for (fields, options, buttons); this skill supplies the fixed component catalog and spec rules. Use whenever the user asks to create a form, 表单, data card, or json-render UI.
metadata:
  keywords:
    - json-render form
    - form spec
    - generative ui
    - form generation
    - json render form
---
# json-render 表单生成

用户消息里只有业务描述（表单做什么、包含什么字段）。你负责把它转换成 json-render 表单 spec，不要反过来问用户框架层面的信息（组件名、绑定路径、spec 结构）。

## 输出规则

只输出一个 ```json-render 代码块，内容是 flat spec JSON（形如 `{"root":"c1","elements":{...}}`）。代码块外最多加一句简短说明，不要解释 JSON 结构。

可用组件（未列出的组件名会导致整张卡片回退成纯文本）：

| 组件 | props |
|---|---|
| Card | `title?`, `subtitle?` |
| Text | `text` 或 `value` |
| Stat | `value`, `label` |
| Badge | `label` 或 `text`，`variant?` |
| Row / Column | 无 |
| Input | `label`, `placeholder?`, `required?`, `inputType?` |
| Textarea | `label`, `placeholder?`, `rows?` |
| Select | `label`, `options`（字符串数组） |
| Button | `label`, `variant?`（`primary` 或默认） |

每个元素形如 `{"type":"Input","props":{...},"children":[]}`，`children` 里放其他元素的 key；按钮通过元素级 `on` 绑定动作。

## 数据绑定与按钮动作

- Input / Textarea / Select 的 `value` 用 `{"$bindState":"/form/<字段名>"}` 绑定，路径必须以 `/form/` 开头，同一字段只绑一次。
- 提交按钮：`"on":{"click":{"action":"submit_form"}}`。
- 重置按钮：`"on":{"click":{"action":"reset_form"}}`。
- 只有用户明确给出动作 id 时，才写 `"params":{"actionId":"<动作 id>"}`；没给就不要编造，缺少 actionId 时后端会提示动作未配置。

## 生成约定

- 整张表单包在一个 Card 里，`title` 用业务名称；用户没说标题就用表单用途命名。
- 字段较多时用 Row 做两列，每列里用 Column 保持"标签 + 控件"纵向对齐；长文本字段独占一行。
- 日期用 `inputType: "date"`，电话用 `"tel"`，数字用 `"number"`，其它情况不要写 inputType。
- 枚举字段用 Select，选项优先用用户给的原文；用户没给时合理枚举 3~5 项。
- 必填字段加 `required: true`；按钮组包含"提交"（`variant: "primary"`）和"重置"，放在同一个 Row 里。
- 文案（title / label / placeholder）默认用中文。

## 示例（光伏电站运维工单提报）

```json-render
{"root":"wo-card","elements":{
  "wo-card":{"type":"Card","props":{"title":"运维工单提报","subtitle":"请填写工单信息"},"children":["row1","f-desc","btn-row"]},
  "row1":{"type":"Row","props":{},"children":["col1","col2"]},
  "col1":{"type":"Column","props":{},"children":["f-station","f-type"]},
  "col2":{"type":"Column","props":{},"children":["f-date","f-priority"]},
  "f-station":{"type":"Input","props":{"label":"电站名称","required":true,"placeholder":"如：河北邢台一期","value":{"$bindState":"/form/station"}},"children":[]},
  "f-type":{"type":"Select","props":{"label":"工单类型","required":true,"options":["故障维修","定期巡检","组件清洗","其他"],"value":{"$bindState":"/form/type"}},"children":[]},
  "f-date":{"type":"Input","props":{"label":"发现日期","inputType":"date","required":true,"value":{"$bindState":"/form/date"}},"children":[]},
  "f-priority":{"type":"Select","props":{"label":"优先级","options":["紧急","高","中","低"],"value":{"$bindState":"/form/priority"}},"children":[]},
  "f-desc":{"type":"Textarea","props":{"label":"问题描述","rows":4,"placeholder":"问题现象、位置、影响范围…","value":{"$bindState":"/form/description"}},"children":[]},
  "btn-row":{"type":"Row","props":{},"children":["btn-reset","btn-submit"]},
  "btn-reset":{"type":"Button","props":{"label":"重置"},"on":{"click":{"action":"reset_form"}},"children":[]},
  "btn-submit":{"type":"Button","props":{"label":"提交工单","variant":"primary"},"on":{"click":{"action":"submit_form"}},"children":[]}
}}
```

